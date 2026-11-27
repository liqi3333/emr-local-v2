/**
 * Record Registry Service Layer
 * Manages the record type registry in SQLite settings table.
 * Provides load/save/lookup/validation/migration functions.
 */

const db = require('./database');
const { DEFAULT_REGISTRY } = require('../data/recordRegistry');

const REGISTRY_KEY = 'record_registry';

// A2: in-memory cache to avoid repeated DB + JSON.parse on every request
let _cache = null;

function getDefaultRegistry() {
  return JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
}

function getRegistry() {
  if (_cache) return _cache;
  const raw = db.getSetting(REGISTRY_KEY);
  if (!raw) return null;
  try {
    _cache = JSON.parse(raw);
    return _cache;
  } catch (err) {
    // S4-1: corrupted registry JSON — log the first 200 chars so the
    // operator can diagnose (power loss during write, manual edit, etc.)
    console.error('[recordRegistry] Corrupted registry JSON, data:', JSON.stringify(raw.slice(0, 200)));
    console.error('[recordRegistry] Parse error:', err.message);
    _cache = null;
    return null;
  }
}

function saveRegistry(registry) {
  _cache = null; // invalidate cache
  db.setSetting(REGISTRY_KEY, JSON.stringify(registry));
}

function ensureDefaultRegistry() {
  const existing = getRegistry();
  if (!existing) {
    // S4-1: preserve corrupted data before restoring defaults
    const raw = db.getSetting(REGISTRY_KEY);
    if (raw) {
      console.warn('[recordRegistry] Registry is corrupted — backing up before restoring defaults');
      db.setSetting(REGISTRY_KEY + '_corrupted_' + Date.now(), raw);
      console.warn('[recordRegistry] Corrupted data saved to key: record_registry_corrupted_' + Date.now());
    }
    saveRegistry(getDefaultRegistry());
  }
}

function findCategory(categoryId) {
  const registry = getRegistry() || getDefaultRegistry();
  return registry.categories.find(c => c.id === categoryId) || null;
}

function findType(typeId) {
  const registry = getRegistry() || getDefaultRegistry();
  for (const cat of registry.categories) {
    const found = cat.types.find(t => t.id === typeId);
    if (found) return { category: cat, type: found };
  }
  return null;
}

function findTypeByTemplateKey(templateKey) {
  const registry = getRegistry() || getDefaultRegistry();
  for (const cat of registry.categories) {
    const found = cat.types.find(t => t.templateKey === templateKey);
    if (found) return { category: cat, type: found };
  }
  return null;
}

function validateRegistry(registry) {
  if (!registry || !Array.isArray(registry.categories)) {
    return { valid: false, error: 'registry.categories must be an array' };
  }
  const typeIds = new Set();
  const storeKeys = new Set();
  const templateKeys = new Set();

  for (const cat of registry.categories) {
    if (!cat.id || !cat.label) {
      return { valid: false, error: `Category missing id or label` };
    }
    if (!Array.isArray(cat.types)) {
      return { valid: false, error: `Category ${cat.id} types must be an array` };
    }
    for (const type of cat.types) {
      if (!type.id || !type.label || !type.storeKey || !type.templateKey) {
        return { valid: false, error: `Type in ${cat.id} missing required fields` };
      }
      if (typeIds.has(type.id)) {
        return { valid: false, error: `Duplicate type id: ${type.id}` };
      }
      if (storeKeys.has(type.storeKey)) {
        return { valid: false, error: `Duplicate storeKey: ${type.storeKey}` };
      }
      if (templateKeys.has(type.templateKey)) {
        return { valid: false, error: `Duplicate templateKey: ${type.templateKey}` };
      }
      typeIds.add(type.id);
      storeKeys.add(type.storeKey);
      templateKeys.add(type.templateKey);

      if (!Array.isArray(type.fields)) {
        return { valid: false, error: `Type ${type.id} fields must be an array` };
      }
      for (const field of type.fields) {
        if (!field.key || !field.label) {
          return { valid: false, error: `Field in ${type.id} missing key or label` };
        }
      }
    }
  }
  return { valid: true };
}

function migrateLegacyTypes() {
  try {
    db._db.exec("UPDATE records SET category = 'clinicalRecords' WHERE category IS NULL OR category = ''");
  } catch (e) {
    // category column may not exist yet — will be handled in database.js migration
  }
}

// ──────────────────────────────────────────────
//  One-time migration: strict linear dependency chain
//  attending → chief → discussion → preop → surgery
//  Each step only receives the immediately preceding record instead of all
//  earlier records being injected again. 术前讨论 also moves before 术前小结
//  in the type list so the tab order matches the chain.
// ──────────────────────────────────────────────

const DEPENDENCY_CHAIN_MIGRATION_KEY = 'migration_dependency_chain_v3';
const DEPENDENCY_CHAIN = {
  chiefRound: ['attendingRound'],
  discussion: ['chiefRound'],
  preop: ['discussion'],
  surgery: ['discussion'],
};
const CHIEF_SUMMARY_OLD = '综合首次病程录和主治查房内容';
const CHIEF_SUMMARY_NEW = '基于主治查房内容';

function migrateDependencyChain() {
  // Run only once so later edits made in the RecordTypeManager are preserved.
  if (db.getSetting(DEPENDENCY_CHAIN_MIGRATION_KEY) === 'done') return false;

  const registry = getRegistry();
  if (!registry) return false;

  let changed = false;
  for (const cat of registry.categories || []) {
    if (!Array.isArray(cat.types)) continue;

    for (const type of cat.types) {
      const nextDeps = DEPENDENCY_CHAIN[type.id];
      if (nextDeps) {
        if (JSON.stringify(type.contextDependencies || []) !== JSON.stringify(nextDeps)) {
          type.contextDependencies = nextDeps;
          changed = true;
        }
      }
      if (type.id === 'discussion' && type.sortOrder !== 3) {
        type.sortOrder = 3;
        changed = true;
      }
      if (type.id === 'preop' && type.sortOrder !== 4) {
        type.sortOrder = 4;
        changed = true;
      }
      if (type.id === 'chiefRound') {
        const summaryField = (type.fields || []).find(f => f.key === 'chiefSummary');
        if (summaryField
            && typeof summaryField.description === 'string'
            && summaryField.description.includes(CHIEF_SUMMARY_OLD)) {
          summaryField.description = summaryField.description.replace(CHIEF_SUMMARY_OLD, CHIEF_SUMMARY_NEW);
          changed = true;
        }
      }
    }

    // Keep the tab order consistent with the dependency chain:
    // 术前讨论 must render before 术前小结.
    const discussionIdx = cat.types.findIndex(t => t.id === 'discussion');
    const preopIdx = cat.types.findIndex(t => t.id === 'preop');
    if (discussionIdx !== -1 && preopIdx !== -1 && discussionIdx > preopIdx) {
      const [discussion] = cat.types.splice(discussionIdx, 1);
      const insertAt = cat.types.findIndex(t => t.id === 'preop');
      cat.types.splice(insertAt, 0, discussion);
      changed = true;
    }
  }

  if (changed) saveRegistry(registry);
  db.setSetting(DEPENDENCY_CHAIN_MIGRATION_KEY, 'done');
  return changed;
}

module.exports = {
  getDefaultRegistry,
  getRegistry,
  saveRegistry,
  ensureDefaultRegistry,
  findCategory,
  findType,
  findTypeByTemplateKey,
  validateRegistry,
  migrateLegacyTypes,
  migrateDependencyChain,
};
