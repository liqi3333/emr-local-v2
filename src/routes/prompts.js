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

// ──────────────────────────────────────────────
//  POST /prompts/preview/:templateKey
//  Assemble system + user prompt for a given type and context
//  Used by ChatArea to inherit PromptEditor templates
// ──────────────────────────────────────────────
router.post('/prompts/preview/:templateKey', (req, res) => {
  try {
    const { templateKey } = req.params;
    const context = req.body.context || {};

    const systemPrompt = promptTemplates.assembleSystemPrompt(templateKey, context);
    const userPrompt = promptTemplates.assembleUserPrompt(templateKey, context);

    res.json({ systemPrompt, userPrompt });
  } catch (err) {
    console.error('[POST /prompts/preview/:templateKey]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /prompts/skeleton
//  Create a skeleton entry in the active prompt template for a new type
// ──────────────────────────────────────────────
router.post('/prompts/skeleton', (req, res) => {
  try {
    const { templateKey, label } = req.body;
    if (!templateKey) {
      return res.status(400).json({ error: 'templateKey is required' });
    }

    const activeName = promptTemplates.getActiveTemplateName();

    // Default template is read-only; skeleton will be auto-generated by buildFromRegistryFields()
    if (activeName === 'default') {
      return res.json({ success: true, skipped: true, reason: 'default template is read-only' });
    }

    const template = promptTemplates.getTemplate(activeName);

    // Skip if skeleton already exists
    if (template.templates && template.templates[templateKey]) {
      return res.json({ success: true, exists: true });
    }

    // Create skeleton
    if (!template.templates) template.templates = {};
    template.templates[templateKey] = {
      label: label || templateKey,
      rolePrompt: `你是一位经验丰富的普外科主治医师。请根据疾病"{{disease}}"生成一份结构化${label || templateKey}。{{patientContext}}`,
      outputFormat: '以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：',
      fields: {},
      endingPrompt: '确保内容专业、准确、符合临床规范，所有字段互相对应、逻辑自洽。',
      userPrompt: `请为"{{disease}}"生成${label || templateKey}。`,
    };

    promptTemplates.saveTemplate(activeName, template);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /prompts/skeleton]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /prompts/cleanup/:templateKey
//  Remove a type from all custom prompt templates
// ──────────────────────────────────────────────
router.post('/prompts/cleanup/:templateKey', (req, res) => {
  try {
    const { templateKey } = req.params;
    if (!templateKey) {
      return res.status(400).json({ error: 'templateKey is required' });
    }

    const templates = promptTemplates.listTemplates();
    let cleaned = 0;

    for (const t of templates) {
      if (t.isDefault) continue;
      try {
        const data = promptTemplates.getTemplate(t.name);
        if (data.templates && data.templates[templateKey]) {
          delete data.templates[templateKey];
          promptTemplates.saveTemplate(t.name, data);
          cleaned++;
        }
      } catch (e) {
        // Skip broken templates
      }
    }

    res.json({ success: true, cleaned });
  } catch (err) {
    console.error('[POST /prompts/cleanup/:templateKey]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
