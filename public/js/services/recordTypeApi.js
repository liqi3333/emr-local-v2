/**
 * Record Type Registry API client
 * Communicates with /api/record-types/* endpoints.
 * Usage: import { recordTypeApi } from './services/recordTypeApi.js'
 */

const BASE = '/api/record-types';

/** Helper: fetch with error handling */
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Get the full registry
 * @returns {Promise<Object>} Registry object with categories and types
 */
async function getRegistry() {
  return request(`${BASE}/registry`);
}

/**
 * Replace the full registry
 * @param {Object} registry
 */
async function saveRegistry(registry) {
  return request(`${BASE}/registry`, {
    method: 'PUT',
    body: JSON.stringify(registry),
  });
}

/**
 * Add a new category
 * @param {{ id: string, label: string, icon?: string, enabled?: boolean }} data
 */
async function addCategory(data) {
  return request(`${BASE}/category`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a category
 * @param {string} id
 * @param {{ label?: string, icon?: string, enabled?: boolean, sortOrder?: number }} data
 */
async function updateCategory(id, data) {
  return request(`${BASE}/category/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a category
 * @param {string} id
 */
async function deleteCategory(id) {
  return request(`${BASE}/category/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * Add a new type to a category
 * @param {string} categoryId
 * @param {Object} typeData - { typeId, label, icon, storeKey, templateKey, enabled, contextDependencies, fields }
 */
async function addType(categoryId, typeData) {
  return request(`${BASE}/category/${encodeURIComponent(categoryId)}/type`, {
    method: 'POST',
    body: JSON.stringify(typeData),
  });
}

/**
 * Update a type
 * @param {string} categoryId
 * @param {string} typeId
 * @param {Object} data
 */
async function updateType(categoryId, typeId, data) {
  return request(`${BASE}/category/${encodeURIComponent(categoryId)}/type/${encodeURIComponent(typeId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a type
 * @param {string} categoryId
 * @param {string} typeId
 */
async function deleteType(categoryId, typeId) {
  return request(`${BASE}/category/${encodeURIComponent(categoryId)}/type/${encodeURIComponent(typeId)}`, {
    method: 'DELETE',
  });
}

/**
 * Reset to default registry
 */
async function resetRegistry() {
  return request(`${BASE}/reset`, {
    method: 'POST',
  });
}

/**
 * Export registry as JSON file download
 */
async function exportRegistry() {
  const registry = await getRegistry();
  const blob = new Blob([JSON.stringify(registry, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `record-registry-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import registry from JSON file
 * @param {File} file
 */
async function importRegistry(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const registry = JSON.parse(e.target.result);
        await saveRegistry(registry);
        resolve(registry);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export const recordTypeApi = {
  getRegistry,
  saveRegistry,
  addCategory,
  updateCategory,
  deleteCategory,
  addType,
  updateType,
  deleteType,
  resetRegistry,
  exportRegistry,
  importRegistry,
};
