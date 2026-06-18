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
//  Shared generation core (A3: eliminates duplicate logic between the
//  unified endpoint and the 7 deprecated endpoints)
// ──────────────────────────────────────────────

/**
 * Normalize a parsed EMR object so every field is a string.
 * Arrays become newline-joined; objects inside arrays are flattened via
 * Object.values().join('：') (clinical-friendly: "字段：值" pairs).
 */
function _normalizeEmr(emr) {
  if (!emr || typeof emr !== 'object') return emr;
  for (const [k, v] of Object.entries(emr)) {
    if (v == null) {
      emr[k] = '';
    } else if (typeof v !== 'string') {
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
  return emr;
}

/**
 * Core generation routine shared by the unified endpoint and the
 * deprecated legacy endpoints. Returns { content, emr, parseError? }.
 */
async function _generateCore(typeConfig, categoryId, reqBody) {
  const {
    disease,
    patientInfo = {},
    provider,
    model,
    apiKey,
    baseUrl,
    ...restData
  } = reqBody;

  if (!disease) {
    const err = new Error('disease is required');
    err.status = 400;
    throw err;
  }

  // Build context from contextDependencies
  const context = { disease, patientInfo };
  const registry = getRegistry();
  if (typeConfig.contextDependencies && registry) {
    for (const depId of typeConfig.contextDependencies) {
      for (const cat of registry.categories) {
        const depType = cat.types.find(t => t.id === depId);
        if (depType) {
          context[depType.storeKey] = restData[depType.storeKey] || {};
          break;
        }
      }
    }
  }

  const isMockMode = !apiKey;
  let content;
  if (isMockMode) {
    content = mockGenerate(typeConfig, disease, context);
  } else {
    const systemPrompt = promptTemplates.assembleSystemPrompt(typeConfig.templateKey, context, typeConfig);
    const userPrompt = promptTemplates.assembleUserPrompt(typeConfig.templateKey, context, typeConfig);
    content = await ai.callAI(provider, model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], apiKey, baseUrl);
  }

  // Try to parse JSON response
  try {
    const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
    const emr = JSON.parse(cleaned);
    // Build defaults from typeConfig fields
    const defaults = {};
    if (typeConfig.fields) {
      for (const field of typeConfig.fields) {
        if (field.enabled === false) continue;
        defaults[field.key] = '';
      }
    }
    const merged = { ...defaults, ...emr };
    return { content, emr: _normalizeEmr(merged), typeId: typeConfig.id, category: categoryId };
  } catch {
    return { content, emr: null, parseError: true, typeId: typeConfig.id, category: categoryId };
  }
}

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
    const out = await _generateCore(typeConfig, category.id, req.body);
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[POST /api/records/:typeId/generate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DEPRECATED: Old 7 generate endpoints
//  Use POST /api/records/:typeId/generate instead
//  Kept for backward compatibility during migration (A3: now thin proxies)
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
      const out = await _generateCore(result.type, result.category.id, req.body);
      res.json(out);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
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
  const userPrompt = promptTemplates.assembleUserPrompt('emr', { disease, patientInfo });

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
//  GET /api/templates/:templateKey/:disease  –  Unified template fetch (A2)
//  Also keeps legacy per-key endpoints as thin proxies for backward compat
//  until DiseaseTree.js is migrated (A4).
// ──────────────────────────────────────────────
const _TEMPLATE_GETTERS = {
  emr: () => require('../data/templates').getTemplate,
  attending: () => require('../data/templates').getAttendingTemplate,
  chief: () => require('../data/templates').getChiefTemplate,
  preop: () => require('../data/templates').getPreopTemplate,
  discussion: () => require('../data/templates').getDiscussionTemplate,
  surgery: () => require('../data/templates').getSurgeryTemplate,
  discharge: () => require('../data/templates').getDischargeTemplate,
};

function _serveTemplate(templateKey, disease, res) {
  try {
    // Clear require cache to ensure latest template is loaded
    delete require.cache[require.resolve('../data/templates')];
    const getterFactory = _TEMPLATE_GETTERS[templateKey];
    if (!getterFactory) {
      return res.status(404).json({ error: `Unknown template key '${templateKey}'` });
    }
    const template = getterFactory()(disease);
    if (!template) {
      return res.json({ template: null, message: 'No template found for this disease' });
    }
    res.json({ template });
  } catch (err) {
    console.error(`[GET /api/templates/${templateKey}/${disease}]`, err.message);
    res.status(500).json({ error: err.message });
  }
}

// Unified endpoint
router.get('/templates/:templateKey/:disease', (req, res) => {
  _serveTemplate(req.params.templateKey, req.params.disease, res);
});

// Legacy per-key endpoints (thin proxies — kept until DiseaseTree.js migrated)
router.get('/templates/attending/:disease', (req, res) => _serveTemplate('attending', req.params.disease, res));
router.get('/templates/chief/:disease', (req, res) => _serveTemplate('chief', req.params.disease, res));
router.get('/templates/preop/:disease', (req, res) => _serveTemplate('preop', req.params.disease, res));
router.get('/templates/discussion/:disease', (req, res) => _serveTemplate('discussion', req.params.disease, res));
router.get('/templates/surgery/:disease', (req, res) => _serveTemplate('surgery', req.params.disease, res));
router.get('/templates/discharge/:disease', (req, res) => _serveTemplate('discharge', req.params.disease, res));

module.exports = router;
