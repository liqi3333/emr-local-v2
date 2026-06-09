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
//  POST /api/emr/generate  –  Generate structured EMR
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
  "chief": "主诉（规范描述）",
  "hpi": "现病史（包含起病、症状发展、诊疗经过）",
  "past": "既往史（相关病史）",
  "exam": "体格检查（阳性体征及专科查体）",
  "lab": "辅助检查（实验室检查及影像学结果）",
  "diag": "初步诊断",
  "diff": "鉴别诊断（列出 2-3 个）",
  "plan": "治疗计划（具体方案）"
}
确保内容专业、准确、符合临床规范。`;

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
  "chief": "主诉（规范描述）",
  "hpi": "现病史（包含起病、症状发展、诊疗经过）",
  "past": "既往史（相关病史）",
  "exam": "体格检查（阳性体征及专科查体）",
  "lab": "辅助检查（实验室检查及影像学结果）",
  "diag": "初步诊断",
  "diff": "鉴别诊断（列出 2-3 个）",
  "plan": "治疗计划（具体方案）"
}
确保内容专业、准确、符合临床规范。`;

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

module.exports = router;
