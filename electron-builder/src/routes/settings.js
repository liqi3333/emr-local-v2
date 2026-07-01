/**
 * Settings Routes
 * Provides API endpoints for model configuration via .env file.
 */

const { Router } = require('express');
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
    res.json(config);
  } catch (err) {
    console.error('[GET /api/settings/env]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
