/**
 * Record Type Registry Management Routes
 *
 * Provides CRUD for the record type registry (categories + types + fields).
 */

const { Router } = require('express');
const registry = require('../services/recordRegistry');

const router = Router();

// ──────────────────────────────────────────────
//  GET /api/record-types/registry
//  Get the full registry
// ──────────────────────────────────────────────
router.get('/record-types/registry', (req, res) => {
  try {
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    res.json(data);
  } catch (err) {
    console.error('[GET /record-types/registry]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /api/record-types/registry
//  Replace the full registry
// ──────────────────────────────────────────────
router.put('/record-types/registry', (req, res) => {
  try {
    const data = req.body;
    const validation = registry.validateRegistry(data);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /record-types/registry]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/record-types/category
//  Add a new category
// ──────────────────────────────────────────────
router.post('/record-types/category', (req, res) => {
  try {
    const { id, label, icon, enabled = true } = req.body;
    if (!id || !label) {
      return res.status(400).json({ error: 'id and label are required' });
    }
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    if (data.categories.find(c => c.id === id)) {
      return res.status(400).json({ error: `Category ${id} already exists` });
    }
    data.categories.push({
      id,
      label,
      icon: icon || '📁',
      enabled,
      sortOrder: data.categories.length,
      types: [],
    });
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /record-types/category]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /api/record-types/category/:id
//  Update a category
// ──────────────────────────────────────────────
router.put('/record-types/category/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    const cat = data.categories.find(c => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `Category ${id} not found` });
    }
    const { label, icon, enabled, sortOrder } = req.body;
    if (label !== undefined) cat.label = label;
    if (icon !== undefined) cat.icon = icon;
    if (enabled !== undefined) cat.enabled = enabled;
    if (sortOrder !== undefined) cat.sortOrder = sortOrder;
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /record-types/category/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DELETE /api/record-types/category/:id
//  Delete a category and its types
// ──────────────────────────────────────────────
router.delete('/record-types/category/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    const idx = data.categories.findIndex(c => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: `Category ${id} not found` });
    }
    data.categories.splice(idx, 1);
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /record-types/category/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/record-types/category/:id/type
//  Add a new type to a category
// ──────────────────────────────────────────────
router.post('/record-types/category/:id/type', (req, res) => {
  try {
    const { id } = req.params;
    const { typeId, label, icon, storeKey, templateKey, enabled = true, contextDependencies = [], fields = [] } = req.body;
    if (!typeId || !label || !storeKey || !templateKey) {
      return res.status(400).json({ error: 'typeId, label, storeKey, templateKey are required' });
    }
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    const cat = data.categories.find(c => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `Category ${id} not found` });
    }
    // Check for duplicate typeId across all categories
    for (const c of data.categories) {
      if (c.types.find(t => t.id === typeId)) {
        return res.status(400).json({ error: `Type ${typeId} already exists` });
      }
    }
    cat.types.push({
      id: typeId,
      label,
      icon: icon || '📄',
      storeKey,
      templateKey,
      enabled,
      sortOrder: cat.types.length,
      contextDependencies,
      fields,
    });
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /record-types/category/:id/type]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /api/record-types/category/:id/type/:typeId
//  Update a type
// ──────────────────────────────────────────────
router.put('/record-types/category/:id/type/:typeId', (req, res) => {
  try {
    const { id, typeId } = req.params;
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    const cat = data.categories.find(c => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `Category ${id} not found` });
    }
    const type = cat.types.find(t => t.id === typeId);
    if (!type) {
      return res.status(404).json({ error: `Type ${typeId} not found` });
    }
    const { label, icon, storeKey, templateKey, enabled, sortOrder, contextDependencies, fields } = req.body;
    if (label !== undefined) type.label = label;
    if (icon !== undefined) type.icon = icon;
    if (storeKey !== undefined) type.storeKey = storeKey;
    if (templateKey !== undefined) type.templateKey = templateKey;
    if (enabled !== undefined) type.enabled = enabled;
    if (sortOrder !== undefined) type.sortOrder = sortOrder;
    if (contextDependencies !== undefined) type.contextDependencies = contextDependencies;
    if (fields !== undefined) type.fields = fields;
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /record-types/category/:id/type/:typeId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DELETE /api/record-types/category/:id/type/:typeId
//  Delete a type
// ──────────────────────────────────────────────
router.delete('/record-types/category/:id/type/:typeId', (req, res) => {
  try {
    const { id, typeId } = req.params;
    const data = registry.getRegistry() || registry.getDefaultRegistry();
    const cat = data.categories.find(c => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `Category ${id} not found` });
    }
    const idx = cat.types.findIndex(t => t.id === typeId);
    if (idx === -1) {
      return res.status(404).json({ error: `Type ${typeId} not found` });
    }
    cat.types.splice(idx, 1);
    registry.saveRegistry(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /record-types/category/:id/type/:typeId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/record-types/reset
//  Reset to default registry
// ──────────────────────────────────────────────
router.post('/record-types/reset', (req, res) => {
  try {
    // P5: require explicit confirm to prevent accidental/malicious reset
    if (!req.body || req.body.confirm !== true) {
      return res.status(400).json({ error: '确认重置请传 { confirm: true }' });
    }
    registry.saveRegistry(registry.getDefaultRegistry());
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /record-types/reset]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
