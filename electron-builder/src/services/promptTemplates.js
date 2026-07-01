/**
 * Prompt Template Service
 *
 * Manages default and custom prompt templates for AI medical record generation.
 *
 * - Default template: src/data/defaultPrompts.json (read-only, versioned)
 * - Custom templates: data/prompt-templates/*.json (user-created)
 * - Active template: stored in SQLite settings table
 *
 * Exports:
 *   getDefaultTemplate()              → default template object
 *   listTemplates()                   → array of template metadata
 *   getTemplate(name)                 → a specific template
 *   saveTemplate(name, data)          → create/update custom template
 *   deleteTemplate(name)              → delete custom template
 *   duplicateTemplate(src, target)    → copy a template
 *   getActiveTemplateName()           → current active template name
 *   setActiveTemplateName(name)       → set active template
 *   getMergedTemplate(name)           → custom merged over default
 *   syncTemplate(name)                → sync custom template with latest default
 *   assembleSystemPrompt(type, ctx)   → final system prompt string
 *   assembleUserPrompt(type, ctx)     → final user prompt string
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');
const recordRegistry = require('./recordRegistry');

const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '../data/defaultPrompts.json');
const TEMPLATES_DIR = path.join(__dirname, '../../data/prompt-templates');
const ACTIVE_SETTING_KEY = 'active_prompt_template';
const RESERVED_NAMES = ['default'];

// ──────────────────────────────────────────────
//  Internal helpers
// ──────────────────────────────────────────────

function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

function getTemplateFilePath(name) {
  const safeName = sanitizeTemplateName(name);
  return path.join(TEMPLATES_DIR, `${safeName}.json`);
}

function sanitizeTemplateName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('模板名称不能为空');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('模板名称不能为空');
  }
  // Allow Chinese, alphanumeric, spaces, hyphens, underscores; remove dangerous chars
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  if (!sanitized) {
    throw new Error('模板名称包含非法字符');
  }
  if (RESERVED_NAMES.includes(sanitized.toLowerCase())) {
    throw new Error(`"${sanitized}" 是保留名称，不能使用`);
  }
  return sanitized;
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ──────────────────────────────────────────────
//  Default template
// ──────────────────────────────────────────────

function getDefaultTemplate() {
  delete require.cache[require.resolve('../data/defaultPrompts.json')];
  return require('../data/defaultPrompts.json');
}

// ──────────────────────────────────────────────
//  Custom template files
// ──────────────────────────────────────────────

function listTemplates() {
  ensureTemplatesDir();
  const defaultTemplate = getDefaultTemplate();
  const result = [
    {
      name: 'default',
      label: '默认模板',
      isDefault: true,
      version: defaultTemplate.version,
      basedOn: null,
    },
  ];

  const files = fs.readdirSync(TEMPLATES_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const name = path.basename(file, '.json');
    try {
      const template = readJson(path.join(TEMPLATES_DIR, file));
      result.push({
        name,
        label: template.name || name,
        isDefault: false,
        version: template.defaultVersion || defaultTemplate.version,
        basedOn: template.basedOn || 'default',
        outdated: (template.defaultVersion || '') !== defaultTemplate.version,
      });
    } catch (err) {
      console.error(`[promptTemplates] Failed to read template ${file}:`, err.message);
    }
  }

  return result;
}

function getTemplate(name) {
  if (name === 'default' || !name) {
    return getDefaultTemplate();
  }
  const filePath = getTemplateFilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`模板 "${name}" 不存在`);
  }
  return readJson(filePath);
}

function saveTemplate(name, data) {
  const safeName = sanitizeTemplateName(name);
  if (safeName.toLowerCase() === 'default') {
    throw new Error('不能覆盖默认模板');
  }

  const defaultTemplate = getDefaultTemplate();
  const now = new Date().toISOString();
  const toSave = {
    name: data.name || safeName,
    basedOn: data.basedOn || 'default',
    defaultVersion: data.defaultVersion || defaultTemplate.version,
    templates: data.templates || {},
    updatedAt: now,
  };

  writeJson(getTemplateFilePath(safeName), toSave);
  return { name: safeName };
}

function deleteTemplate(name) {
  if (name === 'default') {
    throw new Error('不能删除默认模板');
  }
  const filePath = getTemplateFilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`模板 "${name}" 不存在`);
  }
  fs.unlinkSync(filePath);

  // If deleted template was active, reset to default
  const active = getActiveTemplateName();
  if (active === name) {
    setActiveTemplateName('default');
  }
}

function duplicateTemplate(sourceName, targetName) {
  if (!sourceName) {
    throw new Error('源模板名称不能为空');
  }
  const source = getTemplate(sourceName);
  const safeTarget = sanitizeTemplateName(targetName);

  const duplicated = {
    name: safeTarget,
    basedOn: sourceName === 'default' ? 'default' : (source.name || sourceName),
    defaultVersion: getDefaultTemplate().version,
    templates: sourceName === 'default' ? {} : (source.templates || {}),
  };

  saveTemplate(safeTarget, duplicated);
  return { name: safeTarget };
}

// ──────────────────────────────────────────────
//  Active template
// ──────────────────────────────────────────────

function getActiveTemplateName() {
  return db.getSetting(ACTIVE_SETTING_KEY) || 'default';
}

function setActiveTemplateName(name) {
  const validNames = listTemplates().map((t) => t.name);
  if (!validNames.includes(name)) {
    throw new Error(`模板 "${name}" 不存在，无法设为默认`);
  }
  db.setSetting(ACTIVE_SETTING_KEY, name);
}

// ──────────────────────────────────────────────
//  Merge & Sync
// ──────────────────────────────────────────────

/**
 * Merge a custom template with the default template.
 * The default template defines field order; custom values override defaults.
 */
function getMergedTemplate(name) {
  const defaultTemplate = getDefaultTemplate();
  let customTemplate = { templates: {} };

  if (name && name !== 'default') {
    try {
      customTemplate = getTemplate(name);
    } catch (err) {
      console.warn(`[promptTemplates] Active template "${name}" not found, falling back to default`);
    }
  }

  const merged = deepClone(defaultTemplate);

  for (const [typeKey, defaultType] of Object.entries(defaultTemplate.templates)) {
    const customType = customTemplate.templates?.[typeKey] || {};

    merged.templates[typeKey].rolePrompt = customType.rolePrompt || defaultType.rolePrompt;
    merged.templates[typeKey].outputFormat = customType.outputFormat || defaultType.outputFormat;
    merged.templates[typeKey].endingPrompt = customType.endingPrompt || defaultType.endingPrompt;
    merged.templates[typeKey].userPrompt = customType.userPrompt || defaultType.userPrompt;

    // Merge all field keys from default and custom templates
    const mergedFields = {};
    const allFieldKeys = new Set([
      ...Object.keys(defaultType.fields || {}),
      ...Object.keys(customType.fields || {}),
    ]);
    for (const fieldKey of allFieldKeys) {
      const defaultField = defaultType.fields?.[fieldKey];
      const customField = customType.fields?.[fieldKey];
      mergedFields[fieldKey] = customField
        ? { ...defaultField, ...customField }
        : { ...defaultField };
    }
    merged.templates[typeKey].fields = mergedFields;
  }

  return merged;
}

/**
 * Sync a custom template with the latest default template.
 * Adds missing types/fields at the correct position without overwriting user's edits.
 * Returns the synced template and whether it was modified.
 */
function syncTemplate(name) {
  if (name === 'default') {
    return { template: getDefaultTemplate(), changed: false };
  }

  const defaultTemplate = getDefaultTemplate();
  const customTemplate = getTemplate(name);
  const originalVersion = customTemplate.defaultVersion || '';
  let changed = false;

  // Ensure all types from default exist
  for (const [typeKey, defaultType] of Object.entries(defaultTemplate.templates)) {
    if (!customTemplate.templates[typeKey]) {
      customTemplate.templates[typeKey] = deepClone(defaultType);
      changed = true;
      continue;
    }

    const customType = customTemplate.templates[typeKey];

    // Ensure all fields from default exist (in default order)
    const syncedFields = {};
    for (const [fieldKey, defaultField] of Object.entries(defaultType.fields || {})) {
      if (!customType.fields?.[fieldKey]) {
        syncedFields[fieldKey] = deepClone(defaultField);
        changed = true;
      } else {
        syncedFields[fieldKey] = customType.fields[fieldKey];
      }
    }
    customType.fields = syncedFields;
  }

  // Update defaultVersion to latest
  if (customTemplate.defaultVersion !== defaultTemplate.version) {
    customTemplate.defaultVersion = defaultTemplate.version;
    changed = true;
  }

  if (changed) {
    customTemplate.updatedAt = new Date().toISOString();
    saveTemplate(name, customTemplate);
  }

  return {
    template: customTemplate,
    changed,
    previousVersion: originalVersion,
    currentVersion: defaultTemplate.version,
  };
}

function checkSyncStatus(name) {
  if (name === 'default') {
    return { outdated: false, currentVersion: getDefaultTemplate().version };
  }
  const defaultTemplate = getDefaultTemplate();
  const customTemplate = getTemplate(name);
  return {
    outdated: (customTemplate.defaultVersion || '') !== defaultTemplate.version,
    currentVersion: defaultTemplate.version,
    templateVersion: customTemplate.defaultVersion || '',
  };
}

// ──────────────────────────────────────────────
//  Prompt assembly
// ──────────────────────────────────────────────

function buildContextString(label, data) {
  if (!data || Object.keys(data).length === 0) return '';
  return `\n${label}：\n${JSON.stringify(data, null, 2)}`;
}

const CONTEXT_LABELS = {
  emrData: '首次病程录内容',
  attendingData: '主治医师查房记录',
  chiefData: '主任医师查房记录',
  preopData: '术前小结内容',
  discussionData: '术前讨论记录',
  surgeryData: '手术记录内容',
  dischargeData: '出院小结内容',
  surgeryConsentData: '手术同意书内容',
  bloodTransfusionConsentData: '输血同意书内容',
  anesthesiaConsentData: '麻醉同意书内容',
  nursingAssessmentData: '护理评估内容',
  nursingPlanData: '护理计划内容',
  nursingRecordSheetData: '护理记录单内容',
};

function replacePlaceholders(text, context) {
  if (!text) return '';
  const disease = context.disease || '';
  const patientInfo = context.patientInfo || {};

  // Static placeholders
  const replacements = {
    '{{disease}}': disease,
    '{{patientContext}}': buildContextString('患者基本信息', patientInfo),
  };

  // Dynamic: generate {{storeKey DataContext}} for all context data in request
  for (const [key, value] of Object.entries(context)) {
    if (key === 'disease' || key === 'patientInfo') continue;
    if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      const label = CONTEXT_LABELS[key] || key;
      replacements[`{{${key}Context}}`] = buildContextString(label, value);
    }
  }

  let result = text;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

function assembleFieldBlock(typeConfig, registryTypeConfig) {
  const fieldObj = {};

  // Build a lookup from registry fields by key (if registry config provided)
  const registryFieldsMap = {};
  if (registryTypeConfig && Array.isArray(registryTypeConfig.fields)) {
    for (const f of registryTypeConfig.fields) {
      registryFieldsMap[f.key] = f;
    }
  }

  const templateFields = typeConfig.fields || {};

  // Use registry fields as the source of truth for field list and order
  const fieldKeys = (registryTypeConfig?.fields || [])
    .filter(f => f.enabled !== false)
    .map(f => f.key);

  // Fallback: include fields that exist only in the template (legacy custom fields)
  for (const key of Object.keys(templateFields)) {
    if (!registryFieldsMap[key]) {
      fieldKeys.push(key);
    }
  }

  for (const key of fieldKeys) {
    const registryField = registryFieldsMap[key];
    // Prefer template description (custom/default), fallback to registry description
    const description = templateFields[key]?.description || (registryField && registryField.description) || '';
    fieldObj[key] = description;
  }

  return JSON.stringify(fieldObj, null, 2);
}

function buildFromRegistryFields(registryTypeConfig, context) {
  const disease = context.disease || '';
  const patientInfo = context.patientInfo || {};

  const rolePrompt = `你是一位经验丰富的普外科主治医师。请根据疾病"${disease}"生成一份结构化${registryTypeConfig.label}。${buildContextString('患者基本信息', patientInfo)}`;

  const outputFormat = '以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：';

  const fieldObj = {};
  for (const field of registryTypeConfig.fields || []) {
    if (field.enabled === false) continue;
    fieldObj[field.key] = field.description;
  }
  const fieldBlock = JSON.stringify(fieldObj, null, 2);

  const endingPrompt = '确保内容专业、准确、符合临床规范，所有字段互相对应、逻辑自洽。';

  const parts = [
    rolePrompt,
    '',
    outputFormat,
    '',
    fieldBlock,
    '',
    endingPrompt,
  ];

  return parts.join('\n').trim();
}

function assembleSystemPrompt(type, context, registryTypeConfig) {
  const activeName = getActiveTemplateName();
  const merged = getMergedTemplate(activeName);
  const typeConfig = merged.templates[type];

  // Resolve registry config: use passed-in or look up by templateKey
  const regConfig = registryTypeConfig || recordRegistry.findTypeByTemplateKey(type)?.type || null;

  // Layer 1: Use existing template from defaultPrompts.json
  if (typeConfig) {
    const rolePrompt = replacePlaceholders(typeConfig.rolePrompt, context);
    const outputFormat = replacePlaceholders(typeConfig.outputFormat, context);
    const endingPrompt = replacePlaceholders(typeConfig.endingPrompt, context);
    const fieldBlock = assembleFieldBlock(typeConfig, regConfig);

    const parts = [
      rolePrompt,
      '',
      outputFormat,
      '',
      fieldBlock,
      '',
      endingPrompt,
    ];

    return parts.join('\n').trim();
  }

  // Layer 2: Auto-generate from registry fields
  if (regConfig) {
    return buildFromRegistryFields(regConfig, context);
  }

  // Layer 3: No template found
  throw new Error(`未知的病历类型: ${type}`);
}

function assembleUserPrompt(type, context, registryTypeConfig) {
  const activeName = getActiveTemplateName();
  const merged = getMergedTemplate(activeName);
  const typeConfig = merged.templates[type];

  // F4: resolve registry config the same way assembleSystemPrompt does —
  // use passed-in or look up by templateKey. Previously this only used the
  // passed-in arg, so callers like the preview endpoint that don't pass it
  // would throw "未知类型" for custom types even though they exist in registry.
  const regConfig = registryTypeConfig || recordRegistry.findTypeByTemplateKey(type)?.type || null;

  // Layer 1: Use existing template
  if (typeConfig) {
    return replacePlaceholders(typeConfig.userPrompt, context);
  }

  // Layer 2: Auto-generate user prompt
  if (regConfig) {
    return `请为"${context.disease || ''}"生成${regConfig.label}。`;
  }

  // Layer 3: No template found
  throw new Error(`未知的病历类型: ${type}`);
}

// ──────────────────────────────────────────────
//  Exports
// ──────────────────────────────────────────────

module.exports = {
  getDefaultTemplate,
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  duplicateTemplate,
  getActiveTemplateName,
  setActiveTemplateName,
  getMergedTemplate,
  syncTemplate,
  checkSyncStatus,
  assembleSystemPrompt,
  assembleUserPrompt,
};
