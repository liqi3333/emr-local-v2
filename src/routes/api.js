const { Router } = require('express');
const ai = require('../services/ai');
const promptTemplates = require('../services/promptTemplates');
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('emr', {
      disease,
      patientInfo,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('emr', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('attending', {
      disease,
      patientInfo,
      emrData,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('attending', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('chief', {
      disease,
      patientInfo,
      emrData,
      attendingData,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('chief', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('preop', {
      disease,
      patientInfo,
      emrData,
      attendingData,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('preop', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('discussion', {
      disease,
      patientInfo,
      emrData,
      attendingData,
      preopData,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('discussion', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('surgery', {
      disease,
      patientInfo,
      emrData,
      preopData,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('surgery', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    const systemPrompt = promptTemplates.assembleSystemPrompt('discharge', {
      disease,
      patientInfo,
      emrData,
      preopData,
      surgeryData,
    });
    const userPrompt = promptTemplates.assembleUserPrompt('discharge', { disease });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

  const systemPrompt = promptTemplates.assembleSystemPrompt('emr', {
    disease,
    patientInfo,
  });
  const userPrompt = promptTemplates.assembleUserPrompt('emr', { disease });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
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
