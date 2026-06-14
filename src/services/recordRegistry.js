/**
 * Record Registry Service Layer
 * Manages the record type registry in SQLite settings table.
 * Provides load/save/lookup/validation/migration functions.
 */

const db = require('./database');
const { DEFAULT_REGISTRY } = require('../data/recordRegistry');

const REGISTRY_KEY = 'record_registry';

function getDefaultRegistry() {
  return JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
}

function getRegistry() {
  const raw = db.getSetting(REGISTRY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveRegistry(registry) {
  db.setSetting(REGISTRY_KEY, JSON.stringify(registry));
}

function ensureDefaultRegistry() {
  const existing = getRegistry();
  if (!existing) {
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

module.exports = {
  getDefaultRegistry,
  getRegistry,
  saveRegistry,
  ensureDefaultRegistry,
  findCategory,
  findType,
  validateRegistry,
  migrateLegacyTypes,
};
