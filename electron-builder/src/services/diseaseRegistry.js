/**
 * Disease Registry Service Layer
 *
 * Manages the disease category catalog in the SQLite settings table
 * (key: 'disease_categories'). Provides load/save/validate/lookup,
 * default initialization, and rename-with-history-migration logic.
 *
 * Design note: disease *ids* are used only within this catalog layer.
 * Disease *names* are the values stored in `records.disease`, passed to
 * the AI, and shown in the UI. Renaming a disease therefore must update
 * `records.disease` to keep stats and history consistent (plan option A).
 */

const db = require('./database');
const { DEFAULT_DISEASE_CATEGORIES } = require('../data/diseaseCategories');

const DISEASE_KEY = 'disease_categories';

function getDefaultDiseaseCategories() {
  return JSON.parse(JSON.stringify(DEFAULT_DISEASE_CATEGORIES));
}

function getDiseaseCategories() {
  const raw = db.getSetting(DISEASE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDiseaseCategories(categories) {
  db.setSetting(DISEASE_KEY, JSON.stringify(categories));
}

function ensureDefaultDiseaseCategories() {
  const existing = getDiseaseCategories();
  if (!existing) {
    saveDiseaseCategories(getDefaultDiseaseCategories());
  }
}

/**
 * Validate a full disease-categories catalog.
 * Enforces:
 *  - categories is an array
 *  - each category has id + name
 *  - category ids unique
 *  - category names unique
 *  - each disease has id + name
 *  - disease ids unique (globally)
 *  - disease names unique (globally, per user requirement)
 */
function validateDiseaseCategories(categories) {
  if (!categories || !Array.isArray(categories)) {
    return { valid: false, error: 'disease categories must be an array' };
  }

  const categoryIds = new Set();
  const categoryNames = new Set();
  const diseaseIds = new Set();
  const diseaseNames = new Set();

  for (const cat of categories) {
    if (!cat.id || !cat.name) {
      return { valid: false, error: '分类缺少 id 或 name' };
    }
    if (categoryIds.has(cat.id)) {
      return { valid: false, error: `分类 ID 重复: ${cat.id}` };
    }
    if (categoryNames.has(cat.name)) {
      return { valid: false, error: `分类名称重复: ${cat.name}` };
    }
    categoryIds.add(cat.id);
    categoryNames.add(cat.name);

    if (!Array.isArray(cat.diseases)) {
      return { valid: false, error: `分类 ${cat.name} 的 diseases 必须是数组` };
    }

    for (const disease of cat.diseases) {
      if (!disease.id || !disease.name) {
        return { valid: false, error: `分类 ${cat.name} 下有疾病缺少 id 或 name` };
      }
      if (diseaseIds.has(disease.id)) {
        return { valid: false, error: `疾病 ID 重复: ${disease.id}` };
      }
      if (diseaseNames.has(disease.name)) {
        return { valid: false, error: `疾病名称重复: ${disease.name}` };
      }
      diseaseIds.add(disease.id);
      diseaseNames.add(disease.name);
    }
  }

  return { valid: true };
}

/** Find a category by id within the given (or current) catalog. */
function findCategory(categoryId, categories) {
  const list = categories || getDiseaseCategories() || getDefaultDiseaseCategories();
  return list.find((c) => c.id === categoryId) || null;
}

/** Find a disease by id across all categories. Returns { category, disease }. */
function findDisease(diseaseId, categories) {
  const list = categories || getDiseaseCategories() || getDefaultDiseaseCategories();
  for (const cat of list) {
    const found = cat.diseases.find((d) => d.id === diseaseId);
    if (found) return { category: cat, disease: found };
  }
  return null;
}

/** Count how many saved records reference a disease name (for delete prompts). */
function getDiseaseRecordCount(diseaseName) {
  const row = db._db
    .prepare('SELECT COUNT(*) as count FROM records WHERE disease = ?')
    .get(diseaseName);
  return row ? row.count : 0;
}

/**
 * Rename a disease and synchronously update all historical records.
 * Runs in a single SQLite transaction (plan option A): either the catalog
 * and all `records.disease` rows update together, or nothing changes.
 *
 * @param {string} categoryId
 * @param {string} diseaseId
 * @param {string} newName
 * @returns {{ success: true } | { success: false, error: string }}
 */
function renameDisease(categoryId, diseaseId, newName) {
  if (!newName || !newName.trim()) {
    return { success: false, error: '疾病名称不能为空' };
  }
  newName = newName.trim();

  const categories = getDiseaseCategories() || getDefaultDiseaseCategories();

  // Locate target disease and old name.
  let oldName = null;
  let targetCat = null;
  let targetDisease = null;
  for (const cat of categories) {
    for (const d of cat.diseases) {
      if (d.id === diseaseId) {
        targetCat = cat;
        targetDisease = d;
        oldName = d.name;
        break;
      }
    }
    if (targetDisease) break;
  }

  if (!targetDisease) {
    return { success: false, error: '找不到该疾病' };
  }
  if (targetCat.id !== categoryId) {
    return { success: false, error: '分类与疾病不匹配' };
  }
  if (oldName === newName) {
    return { success: true };
  }

  // Validate new name is globally unique (excluding itself).
  for (const cat of categories) {
    for (const d of cat.diseases) {
      if (d.id !== diseaseId && d.name === newName) {
        return { success: false, error: `疾病名称已存在: ${newName}` };
      }
    }
  }

  // Atomic update: catalog + records.
  const txn = db._db.transaction(() => {
    targetDisease.name = newName;
    saveDiseaseCategories(categories);
    db._db
      .prepare('UPDATE records SET disease = ? WHERE disease = ?')
      .run(newName, oldName);
  });

  try {
    txn();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  getDefaultDiseaseCategories,
  getDiseaseCategories,
  saveDiseaseCategories,
  ensureDefaultDiseaseCategories,
  validateDiseaseCategories,
  findCategory,
  findDisease,
  getDiseaseRecordCount,
  renameDisease,
};
