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
