/**
 * Disease Catalog Management Routes
 *
 * Provides CRUD for the disease category catalog (categories + diseases).
 * Mirrors the record-types registry pattern.
 *
 * Rename operations go through diseaseRegistry.renameDisease() which runs
 * a transaction to update both the catalog and all historical records.
 */

const { Router } = require('express');
const registry = require('../services/diseaseRegistry');

const router = Router();

// ──────────────────────────────────────────────
//  GET /api/diseases
//  Get the full disease catalog
// ──────────────────────────────────────────────
router.get('/diseases', (req, res) => {
  try {
    const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();
    res.json(data);
  } catch (err) {
    console.error('[GET /api/diseases]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /api/diseases
//  Replace the full catalog (used by import)
// ──────────────────────────────────────────────
router.put('/diseases', (req, res) => {
  try {
    const data = req.body;
    const validation = registry.validateDiseaseCategories(data);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    registry.saveDiseaseCategories(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/diseases]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/diseases/reset
//  Reset to default catalog
// ──────────────────────────────────────────────
router.post('/diseases/reset', (req, res) => {
  try {
    registry.saveDiseaseCategories(registry.getDefaultDiseaseCategories());
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/diseases/reset]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/diseases/category
//  Add a new category
// ──────────────────────────────────────────────
router.post('/diseases/category', (req, res) => {
  try {
    const { id, name, icon, color, textColor, bgColor } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id 和 name 为必填' });
    }
    const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();

    if (data.find((c) => c.id === id)) {
      return res.status(400).json({ error: `分类 ID 已存在: ${id}` });
    }
    if (data.find((c) => c.name === name)) {
      return res.status(400).json({ error: `分类名称已存在: ${name}` });
    }

    data.push({
      id,
      name,
      icon: icon || '📁',
      color: color || '#f3f4f6',
      textColor: textColor || '#374151',
      bgColor: bgColor || '#f9fafb',
      sortOrder: data.length,
      diseases: [],
    });
    registry.saveDiseaseCategories(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /diseases/category]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /api/diseases/category/:id
//  Update a category (name / icon / colors / sortOrder)
// ──────────────────────────────────────────────
router.put('/diseases/category/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();
    const cat = data.find((c) => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `找不到分类: ${id}` });
    }

    const { name, icon, color, textColor, bgColor, sortOrder } = req.body;

    // Name uniqueness check
    if (name !== undefined && name !== cat.name) {
      if (!name.trim()) {
        return res.status(400).json({ error: '分类名称不能为空' });
      }
      if (data.find((c) => c.id !== id && c.name === name.trim())) {
        return res.status(400).json({ error: `分类名称已存在: ${name}` });
      }
      cat.name = name.trim();
    }
    if (icon !== undefined) cat.icon = icon;
    if (color !== undefined) cat.color = color;
    if (textColor !== undefined) cat.textColor = textColor;
    if (bgColor !== undefined) cat.bgColor = bgColor;
    if (sortOrder !== undefined) cat.sortOrder = sortOrder;

    registry.saveDiseaseCategories(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /diseases/category/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DELETE /api/diseases/category/:id
//  Delete a category and all its diseases
// ──────────────────────────────────────────────
router.delete('/diseases/category/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();
    const idx = data.findIndex((c) => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: `找不到分类: ${id}` });
    }
    data.splice(idx, 1);
    registry.saveDiseaseCategories(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /diseases/category/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  POST /api/diseases/category/:id/disease
//  Add a new disease to a category
// ──────────────────────────────────────────────
router.post('/diseases/category/:id/disease', (req, res) => {
  try {
    const { id } = req.params;
    const { diseaseId, name } = req.body;
    if (!diseaseId || !name) {
      return res.status(400).json({ error: 'diseaseId 和 name 为必填' });
    }
    const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();
    const cat = data.find((c) => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `找不到分类: ${id}` });
    }

    // Global disease id uniqueness
    for (const c of data) {
      if (c.diseases.find((d) => d.id === diseaseId)) {
        return res.status(400).json({ error: `疾病 ID 已存在: ${diseaseId}` });
      }
      if (c.diseases.find((d) => d.name === name.trim())) {
        return res.status(400).json({ error: `疾病名称已存在: ${name.trim()}` });
      }
    }

    cat.diseases.push({
      id: diseaseId,
      name: name.trim(),
      sortOrder: cat.diseases.length,
    });
    registry.saveDiseaseCategories(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /diseases/category/:id/disease]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  PUT /api/diseases/category/:id/disease/:diseaseId
//  Update a disease (name rename + sortOrder).
//  Name changes go through renameDisease() which runs a transaction
//  to update the catalog AND all historical records (plan option A).
// ──────────────────────────────────────────────
router.put('/diseases/category/:id/disease/:diseaseId', (req, res) => {
  try {
    const { id, diseaseId } = req.params;
    const { name, sortOrder } = req.body;

    // Handle rename (with history migration) first
    if (name !== undefined) {
      const result = registry.renameDisease(id, diseaseId, name);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
    }

    // Handle sortOrder update separately (no records to migrate)
    if (sortOrder !== undefined) {
      const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();
      const cat = data.find((c) => c.id === id);
      if (!cat) {
        return res.status(404).json({ error: `找不到分类: ${id}` });
      }
      const disease = cat.diseases.find((d) => d.id === diseaseId);
      if (!disease) {
        return res.status(404).json({ error: `找不到疾病: ${diseaseId}` });
      }
      disease.sortOrder = sortOrder;
      registry.saveDiseaseCategories(data);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /diseases/category/:id/disease/:diseaseId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  DELETE /api/diseases/category/:id/disease/:diseaseId
//  Delete a disease (historical records are preserved)
// ──────────────────────────────────────────────
router.delete('/diseases/category/:id/disease/:diseaseId', (req, res) => {
  try {
    const { id, diseaseId } = req.params;
    const data = registry.getDiseaseCategories() || registry.getDefaultDiseaseCategories();
    const cat = data.find((c) => c.id === id);
    if (!cat) {
      return res.status(404).json({ error: `找不到分类: ${id}` });
    }
    const idx = cat.diseases.findIndex((d) => d.id === diseaseId);
    if (idx === -1) {
      return res.status(404).json({ error: `找不到疾病: ${diseaseId}` });
    }
    cat.diseases.splice(idx, 1);
    registry.saveDiseaseCategories(data);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /diseases/category/:id/disease/:diseaseId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  GET /api/diseases/:diseaseName/record-count
//  Count historical records for a disease (for delete confirmation)
// ──────────────────────────────────────────────
router.get('/diseases/:diseaseName/record-count', (req, res) => {
  try {
    const { diseaseName } = req.params;
    const count = registry.getDiseaseRecordCount(diseaseName);
    res.json({ count });
  } catch (err) {
    console.error('[GET /diseases/:diseaseName/record-count]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
