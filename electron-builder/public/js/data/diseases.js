/**
 * Disease catalog loader.
 *
 * Fetches the disease category catalog from the backend (/api/diseases).
 * On failure, falls back to a trimmed local dataset so the UI never breaks.
 *
 * The catalog is loaded once into the store (store.diseaseCategories) at
 * app boot; components read from the store rather than importing this module
 * directly.
 */

// Trimmed fallback (3 categories) — only used if the backend is unreachable.
const FALLBACK_CATEGORIES = [
  {
    id: 'fb-cat-1',
    name: '腹部急症',
    icon: '🔥',
    color: '#fee2e2',
    textColor: '#b91c1c',
    bgColor: '#fef2f2',
    sortOrder: 0,
    diseases: [
      { id: 'fb-dis-1', name: '急性阑尾炎', sortOrder: 0 },
      { id: 'fb-dis-2', name: '急性胆囊炎', sortOrder: 1 },
      { id: 'fb-dis-3', name: '急性胰腺炎', sortOrder: 2 },
    ],
  },
  {
    id: 'fb-cat-2',
    name: '肝胆胰',
    icon: '🫁',
    color: '#dcfce7',
    textColor: '#166534',
    bgColor: '#f0fdf4',
    sortOrder: 1,
    diseases: [
      { id: 'fb-dis-4', name: '胆囊结石', sortOrder: 0 },
      { id: 'fb-dis-5', name: '肝癌', sortOrder: 1 },
    ],
  },
  {
    id: 'fb-cat-3',
    name: '胃肠',
    icon: '🫃',
    color: '#fef3c7',
    textColor: '#854d0e',
    bgColor: '#fefce8',
    sortOrder: 2,
    diseases: [
      { id: 'fb-dis-6', name: '结肠癌', sortOrder: 0 },
      { id: 'fb-dis-7', name: '直肠癌', sortOrder: 1 },
    ],
  },
];

/**
 * Load disease categories from the backend.
 * @returns {Promise<Array>} Array of category objects
 */
export async function loadDiseaseCategories() {
  try {
    const res = await fetch('/api/diseases');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return FALLBACK_CATEGORIES;
    }
    return data;
  } catch (err) {
    console.warn('[diseases] Failed to load from backend, using fallback:', err.message);
    return FALLBACK_CATEGORIES;
  }
}

/**
 * Flatten the catalog into a list of { name, category } for search.
 * @param {Array} categories
 * @returns {Array<{ name: string, category: string }>}
 */
export function getAllDiseases(categories) {
  const list = categories || [];
  return list.flatMap((cat) =>
    cat.diseases.map((d) => ({ name: d.name, category: cat.name }))
  );
}
