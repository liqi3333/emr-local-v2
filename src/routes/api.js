const { Router } = require('express');
const ai = require('../services/ai');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = Router();

// Apply rate limiter to all /api routes
router.use(createRateLimiter({ windowMs: 60_000, maxRequests: 60 }));

// ──────────────────────────────────────────────
//  GET /api/health  –  Health check
// ──────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────
//  POST /api/chat  –  Non-streaming chat
// ──────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { provider, model, messages, apiKey, baseUrl } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required and must be a non-empty array' });
    }

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);
    res.json({ content });
  } catch (err) {
    console.error('[POST /api/chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/chat/stream  –  Streaming chat (SSE)
// ──────────────────────────────────────────────
router.post('/chat/stream', async (req, res) => {
  const { provider, model, messages, apiKey, baseUrl } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages is required and must be a non-empty array' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering if behind a proxy
  });

  // Track client disconnection; note: req.on('close') fires after body
  // consumption, not on disconnect — use res.on('close') instead.
  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    const stream = ai.streamAI(provider, model, messages, apiKey, baseUrl);

    for await (const chunk of stream) {
      if (aborted) break;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    if (!aborted) {
      res.write('data: [DONE]\n\n');
    }
  } catch (err) {
    console.error('[POST /api/chat/stream]', err.message);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    if (!aborted) {
      res.end();
    }
  }
});

// ──────────────────────────────────────────────
//  POST /api/emr/generate  –  Generate structured EMR (firstCourse)
// ──────────────────────────────────────────────
router.post('/emr/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科主治医师。请根据疾病"${disease}"生成一份结构化电子病历。${patientContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "chief": "主诉（格式：症状或体征+持续时间，如'发现右侧腹股沟区可复性肿物1年'。不超过20字，突出主要症状、部位、性质、时间要素）",

  "hpi": "现病史（需包含：①起病情况——诱因、起病缓急、具体时间；②主要症状特点——部位、性质、程度、持续时间、加重或缓解因素；③伴随症状——有无发热、恶心、呕吐、腹胀、排便改变等，按系统鉴别行阴性症状描述；④诊疗经过——院外就诊、检查、用药及疗效；⑤发病以来一般情况——精神、饮食、睡眠、大小便、体重变化。内容应支撑鉴别诊断，时间线清晰）",

  "past": "既往史（需分层书写，每条一行，前面加数字序号，如\"1. 慢性病史：高血压病史5年...\\n2. 手术外伤史：...\"。①慢性病史——高血压、糖尿病、冠心病等，含发现时间、控制情况、用药；②手术外伤史——手术名称、时间、有无并发症；③传染病史；④过敏史——具体过敏原及反应类型；⑤输血史；⑥吸烟饮酒史——包年、年限；⑦家族遗传病史。若患者为女性还需包含：⑧月经史——初潮年龄、周期、经期、末次月经、绝经年龄。无某项则标注'否认'）",

  "exam": "体格检查（格式：T P R BP 开头。全身情况→皮肤黏膜→淋巴结→头颈→胸廓肺→心脏→腹部→脊柱四肢→神经系统。专科查体需详细描述疾病相关阳性体征及阴性体征。参考《诊断学（第9版）》）",

  "lab": "辅助检查（区分本院或外院，注明日期。包括：血常规、肝肾功能、凝血、感染筛查、心电图、胸片、疾病特异性检查如B超/CT/胃镜等。具体数值化，不可仅写'未见异常'）",

  "diag": "诊断（分两部分写：①主要疾病诊断——规范全称，注明侧别、分期、分型、并发症；②伴发诊断——**必须逐条列出既往史中所有慢性病、手术史、传染病等并存疾病**，如「高血压病 2级（高危）」「2型糖尿病」「胆囊切除术后」等。**既往史中写到的疾病，诊断中必须有对应条目**，不可遗漏。所有诊断每条一行，前面加数字序号，如\"1. 右侧腹股沟疝（可复性）\\n2. 高血压病 2级（高危）\"。所有诊断须在前述病史体查中有依据）",

  "workup": "拟诊讨论（分4部分，每条一行，前面加数字序号，如\"1. 患者信息：...\\n2. 主诉：...\"。①患者信息——引用患者基本资料（年龄、性别）；②主诉——引用主诉字段内容；③查体——引用体格检查中的关键阳性体征；④辅助检查——引用辅助检查中的关键阳性结果）",

  "diff": "鉴别诊断（列出3-10个，按可能性降序排列，每条一行，前面加数字序号，如\"1. 腹股沟淋巴结肿大：...\\n2. 精索鞘膜积液：...\"。每个需包含：鉴别疾病名称、与本病鉴别要点——从症状、体征、辅助检查三方面对比、排除依据）",

  "plan": "治疗计划（分7步，每条一行，前面加数字序号，如\"1. 完善检查：...\\n2. 首选方案：...\"。①完善检查——基本项目+疾病特异性项目，标注必查或可选；②首选方案——手术或药物名称、方式、入路、材料；③替代方案——列出其他可行方案及优劣势对比，仅限临床可行且指南推荐的方案；④术前准备；⑤术中要点；⑥术后处理；⑦出院计划。参考最新版相关疾病临床指南）"
}

确保内容专业、准确、符合临床规范，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成电子病历。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    // Try to parse the JSON response
    let emr;
    try {
      // Remove potential markdown code fences
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      // Normalize all fields to strings (AI may return arrays for diff etc.)
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      // If parsing fails, return the raw content so the frontend can still display it
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/emr/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/attending/generate  –  Generate attending round record
// ──────────────────────────────────────────────
router.post('/attending/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      emrData = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const emrContext = Object.keys(emrData).length
      ? `\n首次病程录内容：\n${JSON.stringify(emrData, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科主治医师。请基于以下首次病程录，生成一份主治医师首次查房病程记录。${patientContext}${emrContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "supplementHistory": "补充病史（根据首次病程录中现病史部分，补充追问得到的病史细节，包括起病情况、症状演变、诊治经过等；如无补充可写\"无特殊补充\"）",

  "summary": "病情摘要（基于首次病程录精炼概括，每条一行，前面加数字序号。①患者基本信息——姓名、性别、年龄、床号；②入院日期、入院诊断；③主诉；④现病史摘要；⑤专科查体要点；⑥辅助检查关键阳性结果；⑦目前治疗方案及效果）",

  "diagnosis": "诊断（在首次病程录诊断基础上，结合查房时的新信息确认或修正，分两部分写，每条一行，前面加数字序号。①主要疾病诊断——规范全称，注明侧别、分期、分型、并发症；②伴发诊断——逐条列出所有并存疾病。所有诊断须在病史体查中有依据）",

  "analysis": "分析（这是重点，需深入分析，每条一行，前面加数字序号。①本病诊断依据——从病史、查体、辅查三方面综合分析；②鉴别诊断——逐个排除，说明排除依据；③病情严重程度评估——有无并发症风险、是否需要手术；④治疗反应评估——对目前治疗的反应和调整建议）",

  "treatment": "下一步诊疗计划（基于分析结果，给出具体可执行的计划，每条一行，前面加数字序号。①完善检查——尚需补充的检查项目及目的；②手术方式探讨——手术适应症、禁忌症、推荐术式及理由、替代术式比较；③调整治疗——是否需要调整用药或手术方案；④术前准备——如需手术，具体准备事项；⑤术后处理——如已手术，后续处理要点；⑥出院计划——预计出院时间及注意事项）",

  "signed": "签名（留空，由医生自行填写）"
}

确保内容专业、准确、符合临床规范，体现主治医师的专业判断深度，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成主治医师首次查房病程记录。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      // Ensure all expected fields exist (AI may omit some)
      if (emr && typeof emr === 'object') {
        const defaults = { supplementHistory: '', summary: '', diagnosis: '', analysis: '', treatment: '', signed: '' };
        emr = { ...defaults, ...emr };
      }
      // Normalize all fields to strings
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/attending/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/chief/generate  –  Generate chief round record
// ──────────────────────────────────────────────
router.post('/chief/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      emrData = {},
      attendingData = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const emrContext = Object.keys(emrData).length
      ? `\n首次病程录内容：\n${JSON.stringify(emrData, null, 2)}`
      : '';

    const attendingContext = Object.keys(attendingData).length
      ? `\n主治医师查房记录：\n${JSON.stringify(attendingData, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科主任医师。请基于以下病历资料，生成一份主任医师首次查房病程记录。${patientContext}${emrContext}${attendingContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "chiefSummary": "病情摘要（综合首次病程录和主治查房内容，精炼概括，每条一行，前面加数字序号。①患者基本信息；②入院日期、入院诊断；③主诉；④现病史摘要；⑤专科查体要点；⑥辅助检查关键阳性结果；⑦目前治疗方案及效果）",

  "chiefDiagnosis": "诊断（在主治查房诊断基础上，结合主任查房时的新信息确认或修正，分两部分写，每条一行，前面加数字序号。①主要疾病诊断——规范全称，注明侧别、分期、分型、并发症；②伴发诊断——逐条列出所有并存疾病）",

  "chiefAnalysis": "分析（体现主任医师的专业判断深度，每条一行，前面加数字序号。①本病诊断依据——从病史、查体、辅查三方面综合分析；②鉴别诊断——逐个排除，说明排除依据；③病情严重程度评估——有无并发症风险、是否需要手术；④治疗反应评估——对目前治疗的反应和调整建议）",

  "chiefTreatment": "诊疗计划（基于分析结果，给出具体可执行的计划，每条一行，前面加数字序号。①完善检查；②手术方式探讨——手术适应症、禁忌症、推荐术式及理由；③调整治疗——是否需要调整用药或手术方案；④术前准备；⑤术后处理；⑥出院计划）",

  "chiefSigned": "医师签名（留空，由医生自行填写）"
}

确保内容专业、准确、符合临床规范，体现主任医师的专业判断深度和指导性意见，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成主任医师首次查房病程记录。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      // Ensure all expected fields exist (AI may omit some)
      if (emr && typeof emr === 'object') {
        const defaults = { chiefSummary: '', chiefDiagnosis: '', chiefAnalysis: '', chiefTreatment: '', chiefSigned: '' };
        emr = { ...defaults, ...emr };
      }
      // Normalize all fields to strings
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/chief/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/preop/generate  –  Generate preop summary (术前小结)
// ──────────────────────────────────────────────
router.post('/preop/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      emrData = {},
      attendingData = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const emrContext = Object.keys(emrData).length
      ? `\n首次病程录内容：\n${JSON.stringify(emrData, null, 2)}`
      : '';

    const attendingContext = Object.keys(attendingData).length
      ? `\n主治医师查房记录：\n${JSON.stringify(attendingData, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科主治医师。请基于以下病历资料，生成一份术前小结。${patientContext}${emrContext}${attendingContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "preopDiagnosis": "术前诊断（规范全称，注明侧别、分型。如：右侧腹股沟斜疝）",

  "preopIndication": "手术指征（逐条列出，每条一行，前面加数字序号。①病史特点——症状持续时间、进展；②查体发现——肿物大小、可复性；③辅助检查——B超等影像结果；④综合评估——诊断明确，具有手术指征）",

  "preopPlan": "手术方案（每条一行，前面加数字序号。①手术名称——规范术式全称；②麻醉方式——椎管内麻醉/全麻等；③手术目的——修补缺损等；④手术风险——出血、感染等主要风险；⑤预计手术时间；⑥预计住院时间）",

  "preopPreparation": "术前准备（每条一行，前面加数字序号。①完善检查——血常规、凝血、心电图等；②备皮；③禁食禁饮时间；④抗生素皮试；⑤签署知情同意书）",

  "preopRisk": "风险评估（每条一行，前面加数字序号。①麻醉风险；②手术主要风险；③术后风险；④患者一般情况评估；⑤综合风险等级——低/中/高）",

  "preopSigned": "医师签名（留空，由医生自行填写）"
}

确保内容专业、准确、符合临床规范，体现术前评估的完整性和严谨性，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成术前小结。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      if (emr && typeof emr === 'object') {
        const defaults = { preopDiagnosis: '', preopIndication: '', preopPlan: '', preopPreparation: '', preopRisk: '', preopSigned: '' };
        emr = { ...defaults, ...emr };
      }
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/preop/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/discussion/generate  –  Generate preop discussion (术前讨论)
// ──────────────────────────────────────────────
router.post('/discussion/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      emrData = {},
      attendingData = {},
      preopData = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const emrContext = Object.keys(emrData).length
      ? `\n首次病程录内容：\n${JSON.stringify(emrData, null, 2)}`
      : '';

    const attendingContext = Object.keys(attendingData).length
      ? `\n主治医师查房记录：\n${JSON.stringify(attendingData, null, 2)}`
      : '';

    const preopContext = Object.keys(preopData).length
      ? `\n术前小结内容：\n${JSON.stringify(preopData, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科主治医师。请基于以下病历资料，生成一份术前讨论记录。${patientContext}${emrContext}${attendingContext}${preopContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "discussionParticipants": "参加人员（格式：主持人：XXX主治医师\\n参加人员：XXX住院医师、XXX住院医师、XXX护士长）",

  "discussionCaseSummary": "病例摘要（简明扼要，每条一行，前面加数字序号。①患者基本信息；②主诉；③现病史要点；④查体关键发现；⑤辅助检查结果）",

  "discussionDiagnosis": "诊断（规范全称，如有多个诊断逐条列出）",

  "discussionContent": "讨论内容（体现多位医师的讨论过程，包括：①住院医师汇报病史；②主治医师分析——诊断依据、鉴别诊断、手术方案；③护士长补充——术前宣教、准备情况）",

  "discussionConclusion": "讨论结论（每条一行，前面加数字序号。①最终诊断；②治疗方案——术式选择及理由；③麻醉方式；④术前准备事项；⑤术后处理要点）",

  "discussionSigned": "记录者签名（留空，由医生自行填写）"
}

确保内容专业、准确、符合临床规范，体现术前讨论的多学科协作和规范化流程，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成术前讨论记录。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      if (emr && typeof emr === 'object') {
        const defaults = { discussionParticipants: '', discussionCaseSummary: '', discussionDiagnosis: '', discussionContent: '', discussionConclusion: '', discussionSigned: '' };
        emr = { ...defaults, ...emr };
      }
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/discussion/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/surgery/generate  –  Generate surgery record (手术记录)
// ──────────────────────────────────────────────
router.post('/surgery/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      emrData = {},
      preopData = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const emrContext = Object.keys(emrData).length
      ? `\n首次病程录内容：\n${JSON.stringify(emrData, null, 2)}`
      : '';

    const preopContext = Object.keys(preopData).length
      ? `\n术前小结内容：\n${JSON.stringify(preopData, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科手术医师。请基于以下病历资料，生成一份手术记录。${patientContext}${emrContext}${preopContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "surgeryName": "手术名称（规范全称，如：右侧腹股沟疝无张力修补术（Lichtenstein术））",

  "surgerySurgeon": "手术者（留空，由医生自行填写）",

  "surgeryAssistant": "助手（留空，由医生自行填写）",

  "surgeryAnesthesia": "麻醉方式（如：椎管内麻醉、全麻、局部浸润麻醉）",

  "surgeryProcess": "手术经过（详细描述手术步骤，每步一行，前面加数字序号。①麻醉成功，体位，消毒铺巾；②切口选择、长度、逐层切开；③探查所见；④关键操作步骤——疝囊游离、结扎、补片放置等；⑤缝合各层；⑥手术结束。注意：描述应具体、规范，体现手术操作的专业性）",

  "surgeryFindings": "术中发现（每条一行，前面加数字序号。①病变部位、大小、形态；②与周围组织关系；③术中出血量；④手术是否顺利）",

  "surgerySigned": "手术者签名（留空，由医生自行填写。附手术开始时间、结束时间、历时）"
}

确保内容专业、准确、符合临床规范，体现手术记录的完整性和规范性，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成手术记录。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      if (emr && typeof emr === 'object') {
        const defaults = { surgeryName: '', surgerySurgeon: '', surgeryAssistant: '', surgeryAnesthesia: '', surgeryProcess: '', surgeryFindings: '', surgerySigned: '' };
        emr = { ...defaults, ...emr };
      }
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/surgery/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/discharge/generate  –  Generate discharge summary (出院小结)
// ──────────────────────────────────────────────
router.post('/discharge/generate', async (req, res) => {
  try {
    const {
      disease,
      patientInfo = {},
      emrData = {},
      preopData = {},
      surgeryData = {},
      provider,
      model,
      apiKey,
      baseUrl,
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    const patientContext = Object.keys(patientInfo).length
      ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
      : '';

    const emrContext = Object.keys(emrData).length
      ? `\n首次病程录内容：\n${JSON.stringify(emrData, null, 2)}`
      : '';

    const preopContext = Object.keys(preopData).length
      ? `\n术前小结内容：\n${JSON.stringify(preopData, null, 2)}`
      : '';

    const surgeryContext = Object.keys(surgeryData).length
      ? `\n手术记录内容：\n${JSON.stringify(surgeryData, null, 2)}`
      : '';

    const systemPrompt = `你是一位经验丰富的普外科主治医师。请基于以下病历资料，生成一份出院小结。${patientContext}${emrContext}${preopContext}${surgeryContext}

以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

{
  "dischargeAdmissionDate": "入院日期（格式：____年____月____日）",

  "dischargeDate": "出院日期（格式：____年____月____日）",

  "dischargeDiagnosis": "出院诊断（规范全称，如有多个诊断逐条列出。如：右侧腹股沟斜疝\\n右侧腹股沟疝无张力修补术后）",

  "dischargeTreatment": "治疗经过（简明描述入院后诊疗过程：①完善检查；②手术——日期、术式；③术后处理——抗感染、止痛、补液等）",

  "dischargeOutcome": "出院情况（描述患者出院时状态：一般情况、切口愈合、并发症、复查结果等）",

  "dischargeAdvice": "出院医嘱（每条一行，前面加数字序号。①休息与活动限制；②饮食指导；③切口护理与拆线时间；④异常情况就诊指征；⑤复查时间安排；⑥用药指导）",

  "dischargeSigned": "主治医师签名（留空，由医生自行填写）"
}

确保内容专业、准确、符合临床规范，体现出院评估的完整性和医嘱的可执行性，所有字段互相对应、逻辑自洽。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为"${disease}"生成出院小结。` },
    ];

    const content = await ai.callAI(provider, model, messages, apiKey, baseUrl);

    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      if (emr && typeof emr === 'object') {
        const defaults = { dischargeAdmissionDate: '', dischargeDate: '', dischargeDiagnosis: '', dischargeTreatment: '', dischargeOutcome: '', dischargeAdvice: '', dischargeSigned: '' };
        emr = { ...defaults, ...emr };
      }
      if (emr && typeof emr === 'object') {
        for (const [k, v] of Object.entries(emr)) {
          if (v == null) {
            emr[k] = '';
          } else if (!(typeof v === 'string')) {
            if (Array.isArray(v)) {
              emr[k] = v.map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object' && item !== null) {
                  return Object.values(item).join('：');
                }
                return String(item);
              }).join('\n');
            } else {
              emr[k] = JSON.stringify(v, null, 2);
            }
          }
        }
      }
    } catch {
      return res.json({ content, emr: null, parseError: true });
    }

    res.json({ content, emr });
  } catch (err) {
    console.error('[POST /api/discharge/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/emr/generate/stream  –  Streaming EMR generation (SSE)
// ──────────────────────────────────────────────
router.post('/emr/generate/stream', async (req, res) => {
  const {
    disease,
    patientInfo = {},
    provider,
    model,
    apiKey,
    baseUrl,
  } = req.body;

  if (!disease) {
    res.status(400).json({ error: 'disease is required' });
    return;
  }

  const patientContext = Object.keys(patientInfo).length
    ? `\n患者基本信息：${JSON.stringify(patientInfo, null, 2)}`
    : '';

  const systemPrompt = `你是一位经验丰富的普外科主治医师。请根据疾病"${disease}"生成一份结构化电子病历。${patientContext}

 以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：

 {
   "chief": "主诉（格式：症状或体征+持续时间，如'发现右侧腹股沟区可复性肿物1年'。不超过20字，突出主要症状、部位、性质、时间要素）",

   "hpi": "现病史（需包含：①起病情况——诱因、起病缓急、具体时间；②主要症状特点——部位、性质、程度、持续时间、加重或缓解因素；③伴随症状——有无发热、恶心、呕吐、腹胀、排便改变等，按系统鉴别行阴性症状描述；④诊疗经过——院外就诊、检查、用药及疗效；⑤发病以来一般情况——精神、饮食、睡眠、大小便、体重变化。内容应支撑鉴别诊断，时间线清晰）",

   "past": "既往史（需分层书写，每条一行，前面加数字序号，如\"1. 慢性病史：高血压病史5年...\\n2. 手术外伤史：...\"。①慢性病史——高血压、糖尿病、冠心病等，含发现时间、控制情况、用药；②手术外伤史——手术名称、时间、有无并发症；③传染病史；④过敏史——具体过敏原及反应类型；⑤输血史；⑥吸烟饮酒史——包年、年限；⑦家族遗传病史。若患者为女性还需包含：⑧月经史——初潮年龄、周期、经期、末次月经、绝经年龄。无某项则标注'否认'）",

   "exam": "体格检查（格式：T P R BP 开头。全身情况→皮肤黏膜→淋巴结→头颈→胸廓肺→心脏→腹部→脊柱四肢→神经系统。专科查体需详细描述疾病相关阳性体征及阴性体征。参考《诊断学（第9版）》）",

   "lab": "辅助检查（区分本院或外院，注明日期。包括：血常规、肝肾功能、凝血、感染筛查、心电图、胸片、疾病特异性检查如B超/CT/胃镜等。具体数值化，不可仅写'未见异常'）",

   "diag": "诊断（分两部分写：①主要疾病诊断——规范全称，注明侧别、分期、分型、并发症；②伴发诊断——**必须逐条列出既往史中所有慢性病、手术史、传染病等并存疾病**，如「高血压病 2级（高危）」「2型糖尿病」「胆囊切除术后」等。**既往史中写到的疾病，诊断中必须有对应条目**，不可遗漏。所有诊断每条一行，前面加数字序号，如\"1. 右侧腹股沟疝（可复性）\\n2. 高血压病 2级（高危）\"。所有诊断须在前述病史体查中有依据）",

   "workup": "拟诊讨论（分4部分，每条一行，前面加数字序号，如\"1. 患者信息：...\\n2. 主诉：...\"。①患者信息——引用患者基本资料（年龄、性别）；②主诉——引用主诉字段内容；③查体——引用体格检查中的关键阳性体征；④辅助检查——引用辅助检查中的关键阳性结果）",

   "diff": "鉴别诊断（列出3-10个，按可能性降序排列，每条一行，前面加数字序号，如\"1. 腹股沟淋巴结肿大：...\\n2. 精索鞘膜积液：...\"。每个需包含：鉴别疾病名称、与本病鉴别要点——从症状、体征、辅助检查三方面对比、排除依据）",

   "plan": "治疗计划（分7步，每条一行，前面加数字序号，如\"1. 完善检查：...\\n2. 首选方案：...\"。①完善检查——基本项目+疾病特异性项目，标注必查或可选；②首选方案——手术或药物名称、方式、入路、材料；③替代方案——列出其他可行方案及优劣势对比，仅限临床可行且指南推荐的方案；④术前准备；⑤术中要点；⑥术后处理；⑦出院计划。参考最新版相关疾病临床指南）"
 }

 确保内容专业、准确、符合临床规范，所有字段互相对应、逻辑自洽。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请为"${disease}"生成电子病历。` },
  ];

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    const stream = ai.streamAI(provider, model, messages, apiKey, baseUrl);

    for await (const chunk of stream) {
      if (aborted) break;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    if (!aborted) {
      res.write('data: [DONE]\n\n');
    }
  } catch (err) {
    console.error('[POST /api/emr/generate/stream]', err.message);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    if (!aborted) {
      res.end();
    }
  }
});

// ──────────────────────────────────────────────
//  GET /api/templates/attending/:disease  –  Get attending round template
// ──────────────────────────────────────────────
router.get('/templates/attending/:disease', (req, res) => {
  try {
    const { disease } = req.params;
    // Clear require cache to ensure latest template is loaded
    delete require.cache[require.resolve('../data/templates')];
    const { getAttendingTemplate } = require('../data/templates');
    const template = getAttendingTemplate(disease);
    
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('[GET /api/templates/attending/:disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/templates/chief/:disease  –  Get chief round template
// ──────────────────────────────────────────────
router.get('/templates/chief/:disease', (req, res) => {
  try {
    const { disease } = req.params;
    // Clear require cache to ensure latest template is loaded
    delete require.cache[require.resolve('../data/templates')];
    const { getChiefTemplate } = require('../data/templates');
    const template = getChiefTemplate(disease);
    
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('[GET /api/templates/chief/:disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/templates/preop/:disease  –  Get preop summary template
// ──────────────────────────────────────────────
router.get('/templates/preop/:disease', (req, res) => {
  try {
    const { disease } = req.params;
    // Clear require cache to ensure latest template is loaded
    delete require.cache[require.resolve('../data/templates')];
    const { getPreopTemplate } = require('../data/templates');
    const template = getPreopTemplate(disease);
    
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('[GET /api/templates/preop/:disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/templates/discussion/:disease  –  Get discussion template
// ──────────────────────────────────────────────
router.get('/templates/discussion/:disease', (req, res) => {
  try {
    const { disease } = req.params;
    delete require.cache[require.resolve('../data/templates')];
    const { getDiscussionTemplate } = require('../data/templates');
    const template = getDiscussionTemplate(disease);
    
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('[GET /api/templates/discussion/:disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/templates/surgery/:disease  –  Get surgery template
// ──────────────────────────────────────────────
router.get('/templates/surgery/:disease', (req, res) => {
  try {
    const { disease } = req.params;
    delete require.cache[require.resolve('../data/templates')];
    const { getSurgeryTemplate } = require('../data/templates');
    const template = getSurgeryTemplate(disease);
    
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('[GET /api/templates/surgery/:disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/templates/discharge/:disease  –  Get discharge template
// ──────────────────────────────────────────────
router.get('/templates/discharge/:disease', (req, res) => {
  try {
    const { disease } = req.params;
    delete require.cache[require.resolve('../data/templates')];
    const { getDischargeTemplate } = require('../data/templates');
    const template = getDischargeTemplate(disease);
    
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    
    res.json({ template });
  } catch (err) {
    console.error('[GET /api/templates/discharge/:disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
