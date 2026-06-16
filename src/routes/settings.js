/**
 * Settings Routes
 * Provides API endpoints for model configuration.
 * - .env file sync (legacy)
 * - SQLite model_config (primary)
 */

const { Router } = require('express');
const db = require('../services/database');
const { updateEnvConfig, getAllEnvConfig } = require('../services/envWriter');

const router = Router();

// Valid provider list
const VALID_PROVIDERS = ['openai', 'claude', 'gemini', 'deepseek', 'ollama'];

// ──────────────────────────────────────────────
//  PUT /api/settings/env
//  Update model configuration in .env file
// ──────────────────────────────────────────────
router.put('/settings/env', (req, res) => {
  try {
    const { provider, baseUrl, model, apiKey } = req.body;

    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider is required' });
    }

    // Validate provider
    const validProviders = ['openai', 'claude', 'gemini', 'deepseek', 'ollama'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ success: false, error: `Invalid provider: ${provider}` });
    }

    // Build config object (only include defined values)
    const config = {};
    if (baseUrl !== undefined) config.baseUrl = baseUrl;
    if (model !== undefined) config.model = model;
    if (apiKey !== undefined) config.apiKey = apiKey;

    const result = updateEnvConfig(provider, config);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[PUT /api/settings/env]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/settings/env
//  Get current .env configuration (for debugging)
// ──────────────────────────────────────────────
router.get('/settings/env', (req, res) => {
  try {
    const config = getAllEnvConfig();
    // Mask API keys for security
    for (const provider of Object.keys(config)) {
      if (provider === 'defaultProvider') continue;
      if (config[provider].apiKey) {
        config[provider].apiKey = config[provider].apiKey.slice(0, 8) + '...';
      }
    }
    res.json(config);
  } catch (err) {
    console.error('[GET /api/settings/env]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  SQLite model_config endpoints (primary storage)
// ──────────────────────────────────────────────

// GET /api/settings/model-config — Get current model config (masked API key)
router.get('/settings/model-config', (req, res) => {
  try {
    const raw = db.getSetting('model_config');
    if (!raw) {
      return res.json({ provider: null, config: null });
    }
    try {
      const config = JSON.parse(raw);
      // Mask API key for security
      const masked = { ...config };
      if (masked.apiKey) {
        masked.apiKey = masked.apiKey.slice(0, 8) + '...';
      }
      res.json({ provider: config.provider, config: masked });
    } catch {
      res.json({ provider: null, config: null });
    }
  } catch (err) {
    console.error('[GET /api/settings/model-config]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/model-config/full — Get full config with API key (for internal use)
router.get('/settings/model-config/full', (req, res) => {
  try {
    const raw = db.getSetting('model_config');
    if (!raw) {
      return res.json({ provider: null, config: null });
    }
    try {
      const config = JSON.parse(raw);
      res.json({ provider: config.provider, config });
    } catch {
      res.json({ provider: null, config: null });
    }
  } catch (err) {
    console.error('[GET /api/settings/model-config/full]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/model-config — Update model config
router.put('/settings/model-config', (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body;

    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider is required' });
    }

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({ success: false, error: `Invalid provider: ${provider}` });
    }

    const config = {
      provider,
      apiKey: apiKey || '',
      baseUrl: baseUrl || '',
      model: model || '',
    };

    db.setSetting('model_config', JSON.stringify(config));
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/settings/model-config]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/settings/model-config — Clear config (enter offline mode)
router.delete('/settings/model-config', (req, res) => {
  try {
    db.setSetting('model_config', '');
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/settings/model-config]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
