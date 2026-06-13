/**
 * Prompt Template Management Routes
 *
 * Provides CRUD for prompt templates and active-template management.
 */

const { Router } = require('express');
const promptTemplates = require('../services/promptTemplates');

const router = Router();

// ──────────────────────────────────────────────
//  GET /prompts/templates
//  List all templates (default + custom)
// ──────────────────────────────────────────────
router.get('/prompts/templates', (req, res) => {
  try {
    const templates = promptTemplates.listTemplates();
    res.json({ templates });
  } catch (err) {
    console.error('[GET /prompts/templates]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /prompts/templates/:name
//  Get a specific template
// ──────────────────────────────────────────────
router.get('/prompts/templates/:name', (req, res) => {
  try {
    const { name } = req.params;
    const template = promptTemplates.getTemplate(name);
    res.json({ template });
  } catch (err) {
    console.error('[GET /prompts/templates/:name]', err.message);
    res.status(404).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /prompts/templates
//  Create a new custom template (body: { name, basedOn? })
// ──────────────────────────────────────────────
router.post('/prompts/templates', (req, res) => {
  try {
    const { name, basedOn = 'default' } = req.body;
    if (!name) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }

    const source = promptTemplates.getTemplate(basedOn);
    const toSave = {
      name,
      basedOn: basedOn === 'default' ? 'default' : (source.name || basedOn),
      defaultVersion: promptTemplates.getDefaultTemplate().version,
      templates: {},
    };

    const result = promptTemplates.saveTemplate(name, toSave);
    res.json({ success: true, name: result.name });
  } catch (err) {
    console.error('[POST /prompts/templates]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /prompts/templates/:name
//  Save/update a custom template
// ──────────────────────────────────────────────
router.put('/prompts/templates/:name', (req, res) => {
  try {
    const { name } = req.params;
    const data = req.body;
    const result = promptTemplates.saveTemplate(name, data);
    res.json({ success: true, name: result.name });
  } catch (err) {
    console.error('[PUT /prompts/templates/:name]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /prompts/templates/:name/duplicate
//  Duplicate a template to a new name
// ──────────────────────────────────────────────
router.post('/prompts/templates/:name/duplicate', (req, res) => {
  try {
    const { name } = req.params;
    const { targetName } = req.body;
    if (!targetName) {
      return res.status(400).json({ error: '新模板名称不能为空' });
    }
    const result = promptTemplates.duplicateTemplate(name, targetName);
    res.json({ success: true, name: result.name });
  } catch (err) {
    console.error('[POST /prompts/templates/:name/duplicate]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DELETE /prompts/templates/:name
//  Delete a custom template
// ──────────────────────────────────────────────
router.delete('/prompts/templates/:name', (req, res) => {
  try {
    const { name } = req.params;
    promptTemplates.deleteTemplate(name);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /prompts/templates/:name]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /prompts/active
//  Get the currently active template name
// ──────────────────────────────────────────────
router.get('/prompts/active', (req, res) => {
  try {
    const name = promptTemplates.getActiveTemplateName();
    res.json({ name });
  } catch (err) {
    console.error('[GET /prompts/active]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /prompts/active
//  Set the active template
// ──────────────────────────────────────────────
router.post('/prompts/active', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }
    promptTemplates.setActiveTemplateName(name);
    res.json({ success: true, name });
  } catch (err) {
    console.error('[POST /prompts/active]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /prompts/merged
//  Get the merged template (active + default fallback)
// ──────────────────────────────────────────────
router.get('/prompts/merged', (req, res) => {
  try {
    const name = promptTemplates.getActiveTemplateName();
    const template = promptTemplates.getMergedTemplate(name);
    res.json({ name, template });
  } catch (err) {
    console.error('[GET /prompts/merged]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /prompts/templates/:name/sync
//  Sync a custom template with the latest default
// ──────────────────────────────────────────────
router.post('/prompts/templates/:name/sync', (req, res) => {
  try {
    const { name } = req.params;
    const result = promptTemplates.syncTemplate(name);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /prompts/templates/:name/sync]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /prompts/templates/:name/status
//  Check sync status of a template
// ──────────────────────────────────────────────
router.get('/prompts/templates/:name/status', (req, res) => {
  try {
    const { name } = req.params;
    const status = promptTemplates.checkSyncStatus(name);
    res.json(status);
  } catch (err) {
    console.error('[GET /prompts/templates/:name/status]', err.message);
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
