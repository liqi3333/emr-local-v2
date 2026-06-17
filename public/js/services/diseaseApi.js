/**
 * Disease Catalog API client
 * Communicates with /api/diseases/* endpoints.
 * Usage: import { diseaseApi } from './services/diseaseApi.js'
 */

const BASE = '/api/diseases';

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
 * Get the full disease catalog
 * @returns {Promise<Array>} Array of category objects
 */
async function getDiseases() {
  return request(`${BASE}`);
}

/**
 * Replace the full catalog (used by import)
 * @param {Array} categories
 */
async function saveDiseases(categories) {
  return request(`${BASE}`, {
    method: 'PUT',
    body: JSON.stringify(categories),
  });
}

/**
 * Reset to default catalog
 */
async function resetDiseases() {
  return request(`${BASE}/reset`, {
    method: 'POST',
  });
}

/**
 * Add a new category
 * @param {{ id: string, name: string, icon?: string, color?: string, textColor?: string, bgColor?: string }} data
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
 * @param {{ name?: string, icon?: string, color?: string, textColor?: string, bgColor?: string, sortOrder?: number }} data
 */
async function updateCategory(id, data) {
  return request(`${BASE}/category/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a category and all its diseases
 * @param {string} id
 */
async function deleteCategory(id) {
  return request(`${BASE}/category/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * Add a new disease to a category
 * @param {string} categoryId
 * @param {{ diseaseId: string, name: string }} data
 */
async function addDisease(categoryId, data) {
  return request(`${BASE}/category/${encodeURIComponent(categoryId)}/disease`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a disease (rename triggers history migration via backend transaction)
 * @param {string} categoryId
 * @param {string} diseaseId
 * @param {{ name?: string, sortOrder?: number }} data
 */
async function updateDisease(categoryId, diseaseId, data) {
  return request(`${BASE}/category/${encodeURIComponent(categoryId)}/disease/${encodeURIComponent(diseaseId)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a disease (historical records are preserved)
 * @param {string} categoryId
 * @param {string} diseaseId
 */
async function deleteDisease(categoryId, diseaseId) {
  return request(`${BASE}/category/${encodeURIComponent(categoryId)}/disease/${encodeURIComponent(diseaseId)}`, {
    method: 'DELETE',
  });
}

/**
 * Count historical records for a disease name (for delete confirmation)
 * @param {string} diseaseName
 * @returns {Promise<{ count: number }>}
 */
async function getDiseaseRecordCount(diseaseName) {
  return request(`${BASE}/${encodeURIComponent(diseaseName)}/record-count`);
}

/**
 * Export catalog as JSON file download
 */
async function exportDiseases() {
  const categories = await getDiseases();
  const blob = new Blob([JSON.stringify(categories, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `disease-categories-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import catalog from JSON file
 * @param {File} file
 */
async function importDiseases(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const categories = JSON.parse(e.target.result);
        await saveDiseases(categories);
        resolve(categories);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export const diseaseApi = {
  getDiseases,
  saveDiseases,
  resetDiseases,
  addCategory,
  updateCategory,
  deleteCategory,
  addDisease,
  updateDisease,
  deleteDisease,
  getDiseaseRecordCount,
  exportDiseases,
  importDiseases,
};
