/**
 * Template Evolution Service (F3)
 *
 * Aggregates ≥3 real case records per disease+type, asks AI to analyze
 * common writing patterns, and produces an "evolved template insight" that
 * can supplement the base prompt template (field-level writing tips, common
 * phrasings, etc.).
 *
 * Results are stored in SQLite settings table with version history:
 *   key = evolution_{disease}_{typeId}
 *   value = JSON { versions: [{ version, sampleCount, insights, createdAt }] }
 */

const db = require('./database');
const { findType } = require('./recordRegistry');

const EVOLUTION_PREFIX = 'evolution_';
const MIN_SAMPLES = 3;

function _key(disease, typeId) {
  return `${EVOLUTION_PREFIX}${disease}_${typeId}`;
}

/**
 * Fetch real record contents for a disease+type from the DB.
 * @returns {Array<object>} parsed content JSONs
 */
function _fetchSamples(disease, typeId) {
  const rows = db._db.prepare(
    'SELECT content FROM records WHERE disease = ? AND type = ? ORDER BY createdAt DESC LIMIT 10'
  ).all(disease, typeId);
  const samples = [];
  for (const r of rows) {
    try {
      const c = JSON.parse(r.content || '{}');
      if (Object.keys(c).length > 0) samples.push(c);
    } catch { /* skip unparseable */ }
  }
  return samples;
}

/**
 * Build the analysis prompt from samples + type config.
 */
function _buildAnalysisPrompt(disease, typeConfig, samples) {
  const fields = (typeConfig.fields || [])
    .filter(f => f.enabled !== false)
    .map(f => `${f.key}（${f.label}）`)
    .join('、');

  const samplesText = samples.map((s, i) =>
    `--- 样本 ${i + 1} ---\n${JSON.stringify(s, null, 2)}`
  ).join('\n\n');

  const system = `你是一位资深外科病案质控专家。下面是针对"${disease}"的${typeConfig.label}的多份真实病历样本（字段：${fields}）。
请分析这些样本的共性书写模式，提炼出可以帮助 AI 更好生成该类型病历的"进化建议"。

以严格的 JSON 格式返回（不要 markdown 代码块标记），结构如下：
{
  "fieldInsights": {
    "字段key": "该字段在真实病历中的常见表述模式、专业术语、书写要点"
  },
  "generalPatterns": "整体书写风格、结构、详略要求的共性总结",
  "qualityNotes": "常见不足或可改进之处"
}`;

  const user = `以下是 ${samples.length} 份"${disease}"的${typeConfig.label}真实样本：

${samplesText}

请分析共性并给出进化建议。`;

  return { system, user };
}

/**
 * Trigger evolution analysis for a disease+type.
 * @param {string} disease
 * @param {string} typeId
 * @param {object} aiOpts { provider, model, apiKey, baseUrl }
 * @returns {Promise<object>} the new evolution entry
 */
async function evolveTemplate(disease, typeId, aiOpts = {}) {
  const result = findType(typeId);
  if (!result) throw new Error(`类型 ${typeId} 不存在`);
  const typeConfig = result.type;

  const samples = _fetchSamples(disease, typeId);
  if (samples.length < MIN_SAMPLES) {
    return {
      error: 'insufficient_samples',
      sampleCount: samples.length,
      required: MIN_SAMPLES,
      message: `需要至少 ${MIN_SAMPLES} 份同疾病同类型病历，当前 ${samples.length} 份`,
    };
  }

  // Load AI service lazily to avoid circular deps at boot
  const ai = require('./ai');
  const { system, user } = _buildAnalysisPrompt(disease, typeConfig, samples);

  let insights;
  // Try real AI; if no key (mock mode), produce a deterministic stub
  const hasKey = aiOpts.apiKey || process.env[`${(aiOpts.provider || 'openai').toUpperCase()}_API_KEY`];
  if (!hasKey && !aiOpts.provider) {
    // Mock: summarize samples deterministically
    insights = _mockInsights(typeConfig, samples);
  } else {
    const content = await ai.callAI(
      aiOpts.provider, aiOpts.model,
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      aiOpts.apiKey, aiOpts.baseUrl
    );
    try {
      const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
      insights = JSON.parse(cleaned);
    } catch {
      insights = { rawContent: content, parseError: true };
    }
  }

  // Save with version history
  const settingKey = _key(disease, typeId);
  const existing = db.getSetting(settingKey);
  let history = existing ? (JSON.parse(existing).versions || []) : [];
  const version = history.length + 1;
  const entry = {
    version,
    disease,
    typeId,
    typeLabel: typeConfig.label,
    sampleCount: samples.length,
    insights,
    createdAt: new Date().toISOString(),
  };
  history.push(entry);
  db.setSetting(settingKey, JSON.stringify({ versions: history }));
  return entry;
}

/** Deterministic mock insights for offline mode. */
function _mockInsights(typeConfig, samples) {
  const fieldInsights = {};
  for (const field of (typeConfig.fields || []).filter(f => f.enabled !== false)) {
    const vals = samples.map(s => s[field.key]).filter(Boolean);
    if (vals.length > 0) {
      const avgLen = Math.round(vals.join('').length / vals.length);
      fieldInsights[field.key] = `样本中该字段平均 ${avgLen} 字，常见表述含专业术语`;
    } else {
      fieldInsights[field.key] = '样本中该字段多为空或简略';
    }
  }
  return {
    fieldInsights,
    generalPatterns: `基于 ${samples.length} 份样本，${typeConfig.label}整体结构规范，字段填写完整度较高`,
    qualityNotes: '建议进一步补充鉴别诊断细节与个体化治疗考量',
  };
}

/**
 * Get the evolution history for a disease+type.
 */
function getEvolution(disease, typeId) {
  const raw = db.getSetting(_key(disease, typeId));
  if (!raw) return { versions: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { versions: [] };
  }
}

/**
 * List all disease+type pairs that have evolution history.
 */
function listEvolutions() {
  const rows = db._db.prepare(
    "SELECT key, value FROM settings WHERE key LIKE 'evolution_%'"
  ).all();
  const result = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.value);
      const latest = parsed.versions?.[parsed.versions.length - 1];
      if (latest) {
        result.push({
          disease: latest.disease,
          typeId: latest.typeId,
          typeLabel: latest.typeLabel,
          version: latest.version,
          sampleCount: latest.sampleCount,
          createdAt: latest.createdAt,
        });
      }
    } catch { /* skip */ }
  }
  return result.sort((a, b) => a.disease.localeCompare(b.disease));
}

/**
 * Delete evolution history for a disease+type.
 */
function deleteEvolution(disease, typeId) {
  const key = _key(disease, typeId);
  const existed = !!db.getSetting(key);
  if (existed) {
    db._db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
  return { disease, typeId, deleted: existed };
}

module.exports = {
  evolveTemplate,
  getEvolution,
  listEvolutions,
  deleteEvolution,
  MIN_SAMPLES,
};
