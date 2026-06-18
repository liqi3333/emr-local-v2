/**
 * Knowledge Base Service (F1: RAG)
 *
 * Reads markdown files per disease from src/data/medical-files/{disease}/
 * and assembles a knowledge snippet injected into the AI system prompt.
 *
 * Directory layout:
 *   src/data/medical-files/
 *     腹股沟疝/
 *       指南.md
 *       要点.md
 *     急性阑尾炎/
 *       ...
 *
 * Security: disease and filename are sanitized to prevent path traversal.
 */

const fs = require('fs');
const path = require('path');

const KB_ROOT = path.join(__dirname, '../data/medical-files');
const MAX_CHARS = 8000;

// ──────────────────────────────────────────────
//  Path safety
// ──────────────────────────────────────────────

/**
 * Sanitize a disease or filename for safe filesystem use.
 * Rejects path traversal and control chars; allows CJK, alphanumeric,
 * spaces, hyphen, underscore, dot (for filenames).
 */
function _sanitizeName(name, allowDot = false) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('名称不能为空');
  }
  const trimmed = name.trim();
  // Block path traversal and separators
  if (/[\/\\]|\.\./.test(trimmed)) {
    throw new Error('名称包含非法路径字符');
  }
  // Allow CJK + word chars + space + hyphen/underscore (+dot if filename)
  const re = allowDot ? /^[\u4e00-\u9fa5a-zA-Z0-9 _.\-]+$/ : /^[\u4e00-\u9fa5a-zA-Z0-9 _\-]+$/;
  if (!re.test(trimmed)) {
    throw new Error('名称包含非法字符');
  }
  return trimmed;
}

function _diseaseDir(disease) {
  const safe = _sanitizeName(disease, false);
  return path.join(KB_ROOT, safe);
}

function _filePath(disease, filename) {
  const safeDisease = _sanitizeName(disease, false);
  const safeFile = _sanitizeName(filename, true);
  if (!safeFile.endsWith('.md')) {
    throw new Error('文件必须是 .md 格式');
  }
  return path.join(KB_ROOT, safeDisease, safeFile);
}

// ──────────────────────────────────────────────
//  Read
// ──────────────────────────────────────────────

/**
 * Get assembled knowledge text for a disease.
 * Concatenates all .md files in the disease directory (sorted by name),
 * truncates to MAX_CHARS. Returns empty string if no knowledge base exists.
 *
 * @param {string} disease
 * @returns {{ text: string, files: string[], truncated: boolean }}
 */
function getKnowledge(disease) {
  const dir = _diseaseDir(disease);
  if (!fs.existsSync(dir)) {
    return { text: '', files: [], truncated: false };
  }
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort();
  if (files.length === 0) {
    return { text: '', files: [], truncated: false };
  }
  const parts = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      parts.push(`### ${f}\n${content}`);
    } catch (e) {
      console.warn(`[knowledge] Failed to read ${f}:`, e.message);
    }
  }
  let text = parts.join('\n\n---\n\n');
  let truncated = false;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    truncated = true;
  }
  return { text, files, truncated };
}

/**
 * List all diseases that have a knowledge base.
 * @returns {Array<{ disease: string, fileCount: number }>}
 */
function listKnowledge() {
  if (!fs.existsSync(KB_ROOT)) return [];
  const result = [];
  for (const disease of fs.readdirSync(KB_ROOT)) {
    const dir = path.join(KB_ROOT, disease);
    if (!fs.statSync(dir).isDirectory()) continue;
    const mdFiles = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      result.push({ disease, fileCount: mdFiles.length });
    }
  }
  return result.sort((a, b) => a.disease.localeCompare(b.disease));
}

/**
 * List files in a disease's knowledge base.
 * @returns {Array<{ name: string, size: number }>}
 */
function listDiseaseFiles(disease) {
  const dir = _diseaseDir(disease);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(name => ({ name, size: fs.statSync(path.join(dir, name)).size }));
}

/**
 * Read a single file's content.
 */
function readKnowledgeFile(disease, filename) {
  const fp = _filePath(disease, filename);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, 'utf-8');
}

// ──────────────────────────────────────────────
//  Write / Delete
// ──────────────────────────────────────────────

/**
 * Save (create or overwrite) a markdown file for a disease.
 */
function saveKnowledgeFile(disease, filename, content) {
  const fp = _filePath(disease, filename);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content, 'utf-8');
  return { disease, filename, size: content.length };
}

/**
 * Delete a knowledge file.
 */
function deleteKnowledgeFile(disease, filename) {
  const fp = _filePath(disease, filename);
  if (!fs.existsSync(fp)) {
    throw new Error(`文件 ${filename} 不存在`);
  }
  fs.unlinkSync(fp);
  // Remove disease dir if empty
  const dir = path.dirname(fp);
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
  return { disease, filename, deleted: true };
}

module.exports = {
  getKnowledge,
  listKnowledge,
  listDiseaseFiles,
  readKnowledgeFile,
  saveKnowledgeFile,
  deleteKnowledgeFile,
  MAX_CHARS,
};
