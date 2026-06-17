/**
 * Disease category style presets.
 *
 * The data model keeps 3 color fields (color / textColor / bgColor) for
 * backward compatibility with DiseaseTree rendering. The management UI only
 * exposes a single "color scheme" selector; picking a scheme fills all 3
 * fields at once via COLOR_PALETTE lookup.
 */

// 12 color schemes covering Tailwind primary palette.
// Existing 10 default categories all map to one of these schemes.
export const COLOR_PALETTE = [
  { name: '红',   color: '#fee2e2', textColor: '#b91c1c', bgColor: '#fef2f2' },
  { name: '橙',   color: '#ffedd5', textColor: '#c2410c', bgColor: '#fff7ed' },
  { name: '黄',   color: '#fef3c7', textColor: '#854d0e', bgColor: '#fefce8' },
  { name: '绿',   color: '#dcfce7', textColor: '#166534', bgColor: '#f0fdf4' },
  { name: '青',   color: '#cffafe', textColor: '#155e75', bgColor: '#ecfeff' },
  { name: '蓝',   color: '#dbeafe', textColor: '#1e40af', bgColor: '#eff6ff' },
  { name: '靛',   color: '#e0e7ff', textColor: '#3730a3', bgColor: '#eef2ff' },
  { name: '紫',   color: '#f3e8ff', textColor: '#6b21a8', bgColor: '#faf5ff' },
  { name: '粉',   color: '#fce7f3', textColor: '#9d174d', bgColor: '#fdf4ff' },
  { name: '玫瑰', color: '#ffe4e6', textColor: '#9f1239', bgColor: '#fff1f2' },
  { name: '灰',   color: '#f3f4f6', textColor: '#374151', bgColor: '#f9fafb' },
  { name: '石板', color: '#e2e8f0', textColor: '#334155', bgColor: '#f8fafc' },
];

// ~20 medical-related emojis for category icons.
// '📁' is the default for newly added categories.
export const EMOJI_LIST = [
  '🔥', '🫁', '🫃', '🔬', '🎗️', '🩺', '❤️', '⚕️', '🚑', '🧬',
  '🩹', '💉', '🏥', '🦴', '🧠', '🫀', '🫂', '🩸', '🧫', '⚗️',
  '📁',
];

/**
 * Default style for a newly added category.
 * @returns {{ icon: string, color: string, textColor: string, bgColor: string }}
 */
export function getDefaultStyle() {
  const gray = COLOR_PALETTE.find((c) => c.name === '灰');
  return {
    icon: '📁',
    color: gray.color,
    textColor: gray.textColor,
    bgColor: gray.bgColor,
  };
}

/**
 * Find the palette entry that matches a given color triplet.
 * Used to highlight the currently-selected scheme in the editor.
 * @param {string} color
 * @returns {object|null}
 */
export function findPaletteByColor(color) {
  return COLOR_PALETTE.find((c) => c.color === color) || null;
}
