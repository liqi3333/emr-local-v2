const { Router } = require('express');
const ai = require('../services/ai');
const promptTemplates = require('../services/promptTemplates');
const { createRateLimiter } = require('../middleware/rateLimit');
const { findType, getRegistry } = require('../services/recordRegistry');
const { mockGenerate } = require('../services/ai-mock');

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
//  POST /api/records/:typeId/generate  –  Generic record generation
// ──────────────────────────────────────────────
router.post('/records/:typeId/generate', async (req, res) => {
  try {
    const { typeId } = req.params;
    const result = findType(typeId);
    if (!result) {
      return res.status(404).json({ error: `Record type '${typeId}' not found` });
    }

    const { type: typeConfig, category } = result;
    const {
      disease,
      patientInfo = {},
      provider,
      model,
      apiKey,
      baseUrl,
      ...restData
    } = req.body;

    if (!disease) {
      return res.status(400).json({ error: 'disease is required' });
    }

    // Build context from contextDependencies
    const context = { disease, patientInfo };
    const registry = getRegistry();
    if (typeConfig.contextDependencies && registry) {
      for (const depId of typeConfig.contextDependencies) {
        // Find the dependent type to get its storeKey
        for (const cat of registry.categories) {
          const depType = cat.types.find(t => t.id === depId);
          if (depType) {
            // Use storeKey to extract data from request body
            const data = restData[depType.storeKey] || {};
            context[depType.storeKey] = data;
            break;
          }
        }
      }
    }

    // Check if mock mode (no API key)
    const isMockMode = !apiKey;

    let content;
    if (isMockMode) {
      // Use mock generate for new types
      content = mockGenerate(typeConfig, disease, context);
    } else {
      // Generate prompt and call real AI
      const systemPrompt = promptTemplates.assembleSystemPrompt(typeConfig.templateKey, context, typeConfig);
      const userPrompt = promptTemplates.assembleUserPrompt(typeConfig.templateKey, { disease }, typeConfig);

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      content = await ai.callAI(provider, model, messages, apiKey, baseUrl);
    }

    // Try to parse JSON response
    let emr;
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      emr = JSON.parse(cleaned);
      // Build defaults from typeConfig fields
      const defaults = {};
      if (typeConfig.fields) {
        for (const field of typeConfig.fields) {
          if (field.enabled === false) continue;
          defaults[field.key] = '';
        }
      }
      emr = { ...defaults, ...emr };
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
      return res.json({ content, emr: null, parseError: true, typeId, category: category.id });
    }

    res.json({ content, emr, typeId, category: category.id });
  } catch (err) {
    console.error('[POST /api/records/:typeId/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DEPRECATED: Old 7 generate endpoints
//  Use POST /api/records/:typeId/generate instead
//  Kept for backward compatibility during migration
// ──────────────────────────────────────────────
const _DEPRECATED_MAP = {
  '/emr/generate': 'firstCourse',
  '/attending/generate': 'attendingRound',
  '/chief/generate': 'chiefRound',
  '/preop/generate': 'preop',
  '/discussion/generate': 'discussion',
  '/surgery/generate': 'surgery',
  '/discharge/generate': 'discharge',
};
for (const [oldPath, typeId] of Object.entries(_DEPRECATED_MAP)) {
  router.post(oldPath, async (req, res) => {
    try {
      const result = findType(typeId);
      if (!result) return res.status(404).json({ error: `Type '${typeId}' not found` });
      const { disease, patientInfo = {}, provider, model, apiKey, baseUrl, ...restData } = req.body;
      if (!disease) return res.status(400).json({ error: 'disease is required' });
      const context = { disease, patientInfo };
      const registry = getRegistry();
      if (result.type.contextDependencies && registry) {
        for (const depId of result.type.contextDependencies) {
          for (const cat of registry.categories) {
            const depType = cat.types.find(t => t.id === depId);
            if (depType) { context[depType.storeKey] = restData[depType.storeKey] || {}; break; }
          }
        }
      }
      const isMockMode = !apiKey;
      let content;
      if (isMockMode) {
        content = mockGenerate(result.type, disease, context);
      } else {
        const systemPrompt = promptTemplates.assembleSystemPrompt(result.type.templateKey, context, result.type);
        const userPrompt = promptTemplates.assembleUserPrompt(result.type.templateKey, { disease }, result.type);
        content = await ai.callAI(provider, model, [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], apiKey, baseUrl);
      }
      let emr;
      try {
        const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
        emr = JSON.parse(cleaned);
        const defaults = {};
        if (result.type.fields) { for (const f of result.type.fields) { if (f.enabled === false) continue; defaults[f.key] = ''; } }
        emr = { ...defaults, ...emr };
        if (emr && typeof emr === 'object') {
          for (const [k, v] of Object.entries(emr)) {
            if (v == null) emr[k] = '';
            else if (typeof v !== 'string') {
              emr[k] = Array.isArray(v) ? v.map(i => typeof i === 'string' ? i : JSON.stringify(i)).join('\n') : JSON.stringify(v, null, 2);
            }
          }
        }
      } catch { return res.json({ content, emr: null, parseError: true }); }
      res.json({ content, emr });
    } catch (err) {
      console.error(`[DEPRECATED ${oldPath}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

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
