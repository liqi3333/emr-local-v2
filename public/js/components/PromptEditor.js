/**
 * PromptEditor — GUI for managing AI prompt templates.
 *
 * Supports:
 *   - Creating / duplicating / deleting / activating custom templates
 *   - Editing role prompt, output format, field descriptions, ending prompt, user prompt
 *   - Resetting to default
 *   - Previewing assembled system prompt
 *   - Syncing with default template updates
 */

import * as api from '../services/api.js';
import { recordTypeApi } from '../services/recordTypeApi.js';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export class PromptEditor {
  constructor(containerEl) {
    this.container = containerEl;
    this._state = {
      templates: [],
      defaultTemplate: null,
      currentName: 'default',
      currentTemplate: null,
      activeName: 'default',
      currentTab: 'emr',
      editingField: null,
      loading: false,
      updateBanner: null,
      registry: null,
      tabOrder: [],
    };
  }

  async render() {
    this._renderSkeleton();
    await this._loadData();
    this._bindEvents();
    this._render();
  }

  // ──────────────────────────────────────────────
  //  Data loading
  // ──────────────────────────────────────────────

  async _loadData() {
    this._setLoading(true);
    try {
      const [templatesRes, defaultRes, activeRes, registryRes] = await Promise.all([
        api.listPromptTemplates(),
        api.getPromptTemplate('default'),
        api.getActivePromptTemplate(),
        recordTypeApi.getRegistry().catch(() => null),
      ]);

      this._state.templates = templatesRes.templates || [];
      this._state.defaultTemplate = defaultRes.template;
      this._state.activeName = activeRes.name || 'default';
      this._state.registry = registryRes;

      // Build tab order from registry (grouped by category)
      this._buildTabOrder();

      // If current template no longer exists, fall back to default
      const exists = this._state.templates.some((t) => t.name === this._state.currentName);
      if (!exists) {
        this._state.currentName = 'default';
      }

      // Ensure currentTab is valid
      if (!this._state.tabOrder.some(t => t.key === this._state.currentTab)) {
        this._state.currentTab = this._state.tabOrder[0]?.key || 'emr';
      }

      await this._loadCurrentTemplate();
    } catch (err) {
      this._toast('error', '加载模板失败: ' + err.message);
      console.error('[PromptEditor] _loadData error:', err);
    } finally {
      this._setLoading(false);
    }
  }

  _buildTabOrder() {
    const registry = this._state.registry;
    if (!registry || !Array.isArray(registry.categories)) {
      // Fallback to default template keys
      this._state.tabOrder = Object.keys(this._state.defaultTemplate?.templates || {}).map(key => ({
        key,
        label: this._state.defaultTemplate?.templates?.[key]?.label || key,
        category: null,
      }));
      return;
    }

    const tabs = [];
    for (const cat of registry.categories) {
      if (cat.enabled === false) continue;
      for (const type of cat.types) {
        if (type.enabled === false) continue;
        // F4: show ALL enabled registry types, not just those with a default
        // template. Types without a default template get a generic fallback
        // (built by _defaultTypeFallback) so the user can still edit prompts
        // for custom types added via RecordTypeManager.
        tabs.push({
          key: type.templateKey,
          label: type.label,
          category: cat.label,
          typeId: type.id,
          hasDefaultTemplate: !!this._state.defaultTemplate?.templates?.[type.templateKey],
        });
      }
    }
    this._state.tabOrder = tabs;
  }

  async _loadCurrentTemplate() {
    try {
      const res = await api.getPromptTemplate(this._state.currentName);
      this._state.currentTemplate = res.template;
      this._checkUpdateStatus();
    } catch (err) {
      this._toast('error', '加载当前模板失败: ' + err.message);
    }
  }

  _checkUpdateStatus() {
    const current = this._state.currentTemplate;
    const defaultTemplate = this._state.defaultTemplate;
    if (!current || !defaultTemplate || this._state.currentName === 'default') {
      this._state.updateBanner = null;
      return;
    }

    const currentVersion = current.defaultVersion || '';
    if (currentVersion !== defaultTemplate.version) {
      this._state.updateBanner = {
        previousVersion: currentVersion,
        currentVersion: defaultTemplate.version,
      };
    } else {
      this._state.updateBanner = null;
    }
  }

  // ──────────────────────────────────────────────
  //  Rendering skeleton
  // ──────────────────────────────────────────────

  _renderSkeleton() {
    this.container.innerHTML = `
      <div class="pe-container">
        <header class="pe-header">
          <a href="/" class="pe-back">← 返回病历主页</a>
          <h1>✏️ AI 提示词模板编辑器</h1>
        </header>

        <div class="pe-toolbar">
          <select id="peTemplateSelect" class="pe-select"></select>
          <button id="peBtnNew" class="pe-btn">➕ 新建模板</button>
          <button id="peBtnDuplicate" class="pe-btn">💾 另存为</button>
          <button id="peBtnSetActive" class="pe-btn pe-btn-primary">✓ 设为默认使用</button>
          <button id="peBtnDelete" class="pe-btn pe-btn-danger">🗑 删除</button>
        </div>

        <div id="peUpdateBanner" class="pe-update-banner" style="display:none;"></div>
        <div id="peLoading" class="pe-loading" style="display:none;">加载中...</div>

        <div class="pe-body">
          <nav id="peTabs" class="pe-tabs"></nav>
          <main id="peContent" class="pe-content"></main>
        </div>
      </div>
    `;
  }

  _render() {
    this._renderTemplateSelect();
    this._renderUpdateBanner();
    this._renderTabs();
    this._renderTabContent();
    this._setLoading(this._state.loading);
  }

  _renderTemplateSelect() {
    const select = this.container.querySelector('#peTemplateSelect');
    select.innerHTML = this._state.templates
      .map((t) => {
        const activeMark = t.name === this._state.activeName ? ' (当前使用)' : '';
        const outdatedMark = t.outdated ? ' ⚠️' : '';
        return `<option value="${this._escapeHtml(t.name)}" ${t.name === this._state.currentName ? 'selected' : ''}>
          ${this._escapeHtml(t.label || t.name)}${activeMark}${outdatedMark}
        </option>`;
      })
      .join('');
    // Force the select value to match the current state, guarding against
    // browsers not updating selectedIndex after innerHTML replacement.
    select.value = this._state.currentName;
  }

  _renderUpdateBanner() {
    const banner = this.container.querySelector('#peUpdateBanner');
    if (!this._state.updateBanner) {
      banner.style.display = 'none';
      banner.innerHTML = '';
      return;
    }

    banner.style.display = 'block';
    banner.innerHTML = `
      <span>⚠️ 默认模板已更新（${this._escapeHtml(this._state.updateBanner.previousVersion || '未知')} → ${this._escapeHtml(this._state.updateBanner.currentVersion)}）</span>
      <div class="pe-banner-actions">
        <button id="peBtnViewDiff" class="pe-btn pe-btn-sm">查看差异</button>
        <button id="peBtnSync" class="pe-btn pe-btn-sm pe-btn-primary">自动合并新增内容</button>
        <button id="peBtnIgnore" class="pe-btn pe-btn-sm">忽略</button>
      </div>
    `;

    banner.querySelector('#peBtnViewDiff')?.addEventListener('click', () => this._showDiff());
    banner.querySelector('#peBtnSync')?.addEventListener('click', () => this._syncTemplate());
    banner.querySelector('#peBtnIgnore')?.addEventListener('click', () => this._ignoreUpdate());
  }

  _renderTabs() {
    const tabs = this.container.querySelector('#peTabs');
    const tabOrder = this._state.tabOrder;
    let lastCategory = null;
    let html = '';

    for (const tab of tabOrder) {
      if (tab.category && tab.category !== lastCategory) {
        html += `<div class="pe-tab-category">${this._escapeHtml(tab.category)}</div>`;
        lastCategory = tab.category;
      }
      const active = tab.key === this._state.currentTab ? 'active' : '';
      html += `<button class="pe-tab ${active}" data-tab="${tab.key}">📋 ${this._escapeHtml(tab.label)}</button>`;
    }

    tabs.innerHTML = html;
  }

  _renderTabContent() {
    const content = this.container.querySelector('#peContent');
    const current = this._state.currentTemplate;
    const defaultTmpl = this._state.defaultTemplate;
    if (!current || !defaultTmpl) {
      content.innerHTML = '<div class="pe-placeholder">加载中...</div>';
      return;
    }

    const typeKey = this._state.currentTab;
    const currentType = current.templates?.[typeKey] || {};
    // F4: when the type has no entry in defaultTemplate (custom type added
    // via RecordTypeManager), fall back to generic defaults so the textareas
    // show editable content instead of blanks. Values match the skeleton
    // endpoint so editing/saving produces a consistent template.
    const defaultType = this._resolveTypeDefaults(typeKey);

    content.innerHTML = `
      <section class="pe-section">
        <label class="pe-label">角色设定</label>
        <textarea id="peRolePrompt" class="pe-textarea" rows="4">${this._escapeHtml(currentType.rolePrompt || defaultType.rolePrompt || '')}</textarea>
      </section>

      <section class="pe-section">
        <label class="pe-label">输出格式要求</label>
        <textarea id="peOutputFormat" class="pe-textarea" rows="3">${this._escapeHtml(currentType.outputFormat || defaultType.outputFormat || '')}</textarea>
      </section>

      <section class="pe-section">
        <label class="pe-label">字段说明（按病历输出顺序，仅可编辑内容）</label>
        <div id="peFieldEditForm"></div>
        <table class="pe-fields-table">
          <thead>
            <tr>
              <th>字段名</th>
              <th>显示名</th>
              <th>说明</th>
              <th>来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="peFieldsBody"></tbody>
        </table>
      </section>

      <section class="pe-section">
        <label class="pe-label">结尾要求</label>
        <textarea id="peEndingPrompt" class="pe-textarea" rows="2">${this._escapeHtml(currentType.endingPrompt || defaultType.endingPrompt || '')}</textarea>
      </section>

      <section class="pe-section">
        <label class="pe-label">用户提示词</label>
        <textarea id="peUserPrompt" class="pe-textarea" rows="2">${this._escapeHtml(currentType.userPrompt || defaultType.userPrompt || '')}</textarea>
      </section>

      <div class="pe-actions">
        <button id="peBtnResetTab" class="pe-btn">↩️ 恢复此页默认</button>
        <button id="peBtnSaveTab" class="pe-btn pe-btn-primary">保存当前页</button>
      </div>

      <section class="pe-section pe-preview">
        <label class="pe-label">最终 system prompt 预览</label>
        <div class="pe-preview-actions">
          <button id="peBtnRefreshPreview" class="pe-btn pe-btn-sm">🔄 从后端刷新精确预览</button>
        </div>
        <pre id="pePreview"></pre>
      </section>
    `;

    this._renderFieldsTable(currentType, defaultType);
    this._renderFieldEditForm();
    this._renderPreview(typeKey);
  }

  /**
   * F4: resolve the default type config for a tab. Returns the real entry
   * from defaultTemplate if it exists; otherwise constructs a generic
   * fallback (matching the skeleton endpoint defaults) so custom types
   * added via RecordTypeManager have editable prompt content.
   */
  _resolveTypeDefaults(typeKey) {
    const real = this._state.defaultTemplate?.templates?.[typeKey];
    if (real) return real;
    const tab = this._state.tabOrder.find(t => t.key === typeKey);
    const label = tab?.label || typeKey;
    return {
      label,
      rolePrompt: `你是一位经验丰富的普外科主治医师。请根据疾病"{{disease}}"生成一份结构化${label}。{{patientContext}}`,
      outputFormat: '以严格的 JSON 格式返回（不要包含 markdown 代码块标记），包含以下字段：',
      fields: {},
      endingPrompt: '确保内容专业、准确、符合临床规范，所有字段互相对应、逻辑自洽。',
      userPrompt: `请为"{{disease}}"生成${label}。`,
    };
  }

  _getRegistryTypeForTab(typeKey) {
    const tab = this._state.tabOrder.find(t => t.key === typeKey);
    if (!tab || !tab.typeId || !this._state.registry) return null;
    for (const cat of this._state.registry.categories) {
      const found = cat.types.find(t => t.id === tab.typeId);
      if (found) return found;
    }
    return null;
  }

  _renderFieldsTable(currentType, defaultType) {
    const tbody = this.container.querySelector('#peFieldsBody');
    if (!tbody) return;

    const typeKey = this._state.currentTab;
    const regType = this._getRegistryTypeForTab(typeKey);
    const regFieldsMap = {};
    if (regType && Array.isArray(regType.fields)) {
      for (const f of regType.fields) {
        regFieldsMap[f.key] = f;
      }
    }

    const defaultFields = defaultType.fields || {};
    const currentFields = currentType.fields || {};

    // Use Registry fields as the source of truth for field list and order
    const fieldEntries = (regType?.fields || [])
      .filter(f => f.enabled !== false)
      .map(f => ({ key: f.key, regField: f }));

    // Fallback: also show fields that exist only in the template (legacy custom fields)
    for (const key of Object.keys(defaultFields)) {
      if (!regFieldsMap[key]) {
        fieldEntries.push({ key, regField: null });
      }
    }

    tbody.innerHTML = fieldEntries.map(({ key, regField }) => {
      const customField = currentFields[key];
      const defaultField = defaultFields[key];
      const isCustom = !!customField;
      const label = customField?.label || defaultField?.label || regField?.label || key;
      // Prefer registry description, then custom override, then default template
      const description = customField?.description || regField?.description || defaultField?.description || '';
      const source = isCustom ? '自定义' : (regField ? 'Registry' : '默认');

      return `
        <tr data-field="${key}">
          <td class="pe-field-key">${this._escapeHtml(key)}</td>
          <td class="pe-field-label">${this._escapeHtml(label)}</td>
          <td class="pe-field-desc">${this._escapeHtml(description)}</td>
          <td class="pe-field-source">${this._escapeHtml(source)}</td>
          <td class="pe-field-actions">
            <button class="pe-btn pe-btn-sm pe-btn-edit" data-field="${key}">编辑</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.pe-btn-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const key = e.target.closest('[data-field]').dataset.field;
        this._startFieldEdit(key);
      });
    });
  }

  _renderFieldEditForm() {
    const form = this.container.querySelector('#peFieldEditForm');
    if (!form) return;

    if (!this._state.editingField) {
      form.innerHTML = '';
      return;
    }

    const { typeKey, fieldKey, label, description } = this._state.editingField;
    const typeConfig = this._state.currentTemplate?.templates?.[typeKey];
    const defaultType = this._state.defaultTemplate?.templates?.[typeKey];
    const defaultField = defaultType?.fields?.[fieldKey];
    const regType = this._getRegistryTypeForTab(typeKey);
    const regField = regType?.fields?.find(f => f.key === fieldKey);
    const registryDesc = regField?.description || '';

    form.innerHTML = `
      <div class="pe-field-edit-card">
        <h4>编辑字段：${this._escapeHtml(fieldKey)}</h4>
        <label>显示名</label>
        <input type="text" id="peEditLabel" value="${this._escapeHtml(label)}" />
        <label>说明</label>
        <textarea id="peEditDescription" rows="6">${this._escapeHtml(description)}</textarea>
        <div class="pe-field-edit-actions">
          <button id="peBtnSaveField" class="pe-btn pe-btn-primary">保存字段</button>
          <button id="peBtnResetField" class="pe-btn">恢复默认</button>
          <button id="peBtnCancelField" class="pe-btn">取消</button>
        </div>
        ${registryDesc ? `<div class="pe-field-default">Registry 默认值：${this._escapeHtml(registryDesc)}</div>` : ''}
      </div>
    `;

    form.querySelector('#peBtnSaveField')?.addEventListener('click', () => this._saveFieldEdit());
    form.querySelector('#peBtnResetField')?.addEventListener('click', () => this._resetFieldEdit());
    form.querySelector('#peBtnCancelField')?.addEventListener('click', () => this._cancelFieldEdit());
  }

  _renderPreview(typeKey) {
    const previewEl = this.container.querySelector('#pePreview');
    if (!previewEl) return;

    const rolePrompt = this.container.querySelector('#peRolePrompt')?.value || '';
    const outputFormat = this.container.querySelector('#peOutputFormat')?.value || '';
    const endingPrompt = this.container.querySelector('#peEndingPrompt')?.value || '';
    const userPrompt = this.container.querySelector('#peUserPrompt')?.value || '';

    const typeConfig = {
      rolePrompt,
      outputFormat,
      endingPrompt,
      userPrompt,
      fields: this._getCurrentFieldsFromTable(typeKey),
    };

    // Assemble preview locally (fast, uses Registry field descriptions)
    const fieldObj = {};
    for (const [key, field] of Object.entries(typeConfig.fields)) {
      fieldObj[key] = field.description;
    }

    const preview = [
      typeConfig.rolePrompt,
      '',
      typeConfig.outputFormat,
      '',
      JSON.stringify(fieldObj, null, 2),
      '',
      typeConfig.endingPrompt,
      '',
      '--- 用户提示词 ---',
      typeConfig.userPrompt,
    ].join('\n');

    previewEl.textContent = preview;
  }

  async _refreshPreviewFromBackend() {
    const previewEl = this.container.querySelector('#pePreview');
    if (!previewEl) return;

    const typeKey = this._state.currentTab;
    const tab = this._state.tabOrder.find(t => t.key === typeKey);
    if (!tab) return;

    previewEl.textContent = '正在从后端获取精确预览...';
    try {
      const { systemPrompt, userPrompt } = await api.getPromptPreview(typeKey, {
        disease: '示例疾病',
      });
      const full = systemPrompt + '\n\n--- 用户提示词 ---\n' + userPrompt;
      previewEl.textContent = full;
    } catch (err) {
      previewEl.textContent = '预览获取失败: ' + err.message;
    }
  }

  _getCurrentFieldsFromTable(typeKey) {
    const currentType = this._state.currentTemplate?.templates?.[typeKey] || {};
    const defaultType = this._state.defaultTemplate?.templates?.[typeKey] || {};
    const regType = this._getRegistryTypeForTab(typeKey);
    const regFieldsMap = {};
    if (regType && Array.isArray(regType.fields)) {
      for (const f of regType.fields) regFieldsMap[f.key] = f;
    }

    const result = {};

    // Start with registry fields (source of truth)
    for (const regField of regType?.fields || []) {
      if (regField.enabled === false) continue;
      const key = regField.key;
      const customField = currentType.fields?.[key];
      const defaultField = defaultType.fields?.[key];
      result[key] = {
        label: customField?.label || defaultField?.label || regField.label || key,
        description: customField?.description || regField.description || defaultField?.description || '',
      };
    }

    // Fallback: include fields that exist only in the template (legacy custom fields)
    for (const [key, defaultField] of Object.entries(defaultType.fields || {})) {
      if (result[key]) continue;
      const customField = currentType.fields?.[key];
      result[key] = {
        label: customField?.label || defaultField.label || key,
        description: customField?.description || defaultField.description || '',
      };
    }

    return result;
  }

  // ──────────────────────────────────────────────
  //  Event bindings
  // ──────────────────────────────────────────────

  _bindEvents() {
    // Toolbar
    this.container.querySelector('#peTemplateSelect')?.addEventListener('change', (e) => {
      this._state.currentName = e.target.value;
      this._state.currentTemplate = null;   // clear stale content immediately
      this._state.editingField = null;
      this._setLoading(true);
      this._render();                        // show loading + updated dropdown
      this._loadCurrentTemplate().then(() => {
        this._setLoading(false);
        this._render();
      });
    });

    this.container.querySelector('#peBtnNew')?.addEventListener('click', () => this._newTemplate());
    this.container.querySelector('#peBtnDuplicate')?.addEventListener('click', () => this._duplicateTemplate());
    this.container.querySelector('#peBtnSetActive')?.addEventListener('click', () => this._setActiveTemplate());
    this.container.querySelector('#peBtnDelete')?.addEventListener('click', () => this._deleteTemplate());

    // Tabs (event delegation)
    this.container.querySelector('#peTabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.pe-tab');
      if (!tab) return;
      this._state.currentTab = tab.dataset.tab;
      this._state.editingField = null;
      this._render();
    });

    // Tab content (event delegation for dynamic elements)
    this.container.querySelector('#peContent')?.addEventListener('input', (e) => {
      if (e.target.matches('.pe-textarea')) {
        this._renderPreview(this._state.currentTab);
      }
    });

    this.container.querySelector('#peContent')?.addEventListener('click', (e) => {
      if (e.target.closest('#peBtnSaveTab')) {
        this._saveCurrentTab();
      } else if (e.target.closest('#peBtnResetTab')) {
        this._resetCurrentTab();
      } else if (e.target.closest('#peBtnRefreshPreview')) {
        this._refreshPreviewFromBackend();
      }
    });
  }

  // ──────────────────────────────────────────────
  //  Actions
  // ──────────────────────────────────────────────

  async _newTemplate() {
    const name = prompt('请输入新模板名称：');
    if (!name || !name.trim()) return;

    this._setLoading(true);
    try {
      await api.createPromptTemplate(name.trim());
      await this._loadData();
      this._state.currentName = name.trim();
      await this._loadCurrentTemplate();
      this._render();
      this._toast('success', '模板创建成功');
    } catch (err) {
      this._toast('error', err.message);
    } finally {
      this._setLoading(false);
    }
  }

  async _duplicateTemplate() {
    const name = prompt('请输入另存为的模板名称：');
    if (!name || !name.trim()) return;

    this._setLoading(true);
    try {
      await api.duplicatePromptTemplate(this._state.currentName, name.trim());
      await this._loadData();
      this._state.currentName = name.trim();
      await this._loadCurrentTemplate();
      this._render();
      this._toast('success', '模板另存成功');
    } catch (err) {
      this._toast('error', err.message);
    } finally {
      this._setLoading(false);
    }
  }

  async _setActiveTemplate() {
    this._setLoading(true);
    try {
      await api.setActivePromptTemplate(this._state.currentName);
      this._state.activeName = this._state.currentName;
      this._render();
      this._toast('success', `已设为默认使用模板：${this._state.currentName}`);
    } catch (err) {
      this._toast('error', err.message);
    } finally {
      this._setLoading(false);
    }
  }

  async _deleteTemplate() {
    if (this._state.currentName === 'default') {
      this._toast('error', '不能删除默认模板');
      return;
    }
    if (!confirm(`确定要删除模板 "${this._state.currentName}" 吗？此操作不可恢复。`)) {
      return;
    }

    this._setLoading(true);
    try {
      await api.deletePromptTemplate(this._state.currentName);
      this._state.currentName = 'default';
      await this._loadData();
      this._render();
      this._toast('success', '模板已删除');
    } catch (err) {
      this._toast('error', err.message);
    } finally {
      this._setLoading(false);
    }
  }

  _startFieldEdit(fieldKey) {
    const typeKey = this._state.currentTab;
    const currentType = this._state.currentTemplate?.templates?.[typeKey] || {};
    const defaultType = this._state.defaultTemplate?.templates?.[typeKey] || {};
    const customField = currentType.fields?.[fieldKey];
    const defaultField = defaultType.fields?.[fieldKey];

    // Get registry description as ultimate fallback
    const regType = this._getRegistryTypeForTab(typeKey);
    const regField = regType?.fields?.find(f => f.key === fieldKey);

    this._state.editingField = {
      typeKey,
      fieldKey,
      label: customField?.label || defaultField?.label || regField?.label || '',
      description: customField?.description || defaultField?.description || regField?.description || '',
    };

    this._renderFieldEditForm();
  }

  _saveFieldEdit() {
    if (!this._state.editingField) return;

    const { typeKey, fieldKey } = this._state.editingField;
    const label = this.container.querySelector('#peEditLabel')?.value?.trim() || '';
    const description = this.container.querySelector('#peEditDescription')?.value?.trim() || '';

    if (!this._state.currentTemplate.templates[typeKey]) {
      this._state.currentTemplate.templates[typeKey] = {};
    }
    if (!this._state.currentTemplate.templates[typeKey].fields) {
      this._state.currentTemplate.templates[typeKey].fields = {};
    }

    this._state.currentTemplate.templates[typeKey].fields[fieldKey] = { label, description };
    this._state.editingField = null;
    this._render();
  }

  _resetFieldEdit() {
    if (!this._state.editingField) return;
    const { typeKey, fieldKey } = this._state.editingField;
    const defaultField = this._state.defaultTemplate?.templates?.[typeKey]?.fields?.[fieldKey];
    const regType = this._getRegistryTypeForTab(typeKey);
    const regField = regType?.fields?.find(f => f.key === fieldKey);

    this._state.editingField.label = defaultField?.label || regField?.label || '';
    this._state.editingField.description = defaultField?.description || regField?.description || '';
    this._renderFieldEditForm();
  }

  _cancelFieldEdit() {
    this._state.editingField = null;
    this._renderFieldEditForm();
  }

  _collectCurrentTabData() {
    const typeKey = this._state.currentTab;
    // F4: use _resolveTypeDefaults so custom types without a default template
    // still get a label for the saved tab data.
    const defaultType = this._resolveTypeDefaults(typeKey);

    return {
      label: defaultType.label,
      rolePrompt: this.container.querySelector('#peRolePrompt')?.value || defaultType.rolePrompt,
      outputFormat: this.container.querySelector('#peOutputFormat')?.value || defaultType.outputFormat,
      endingPrompt: this.container.querySelector('#peEndingPrompt')?.value || defaultType.endingPrompt,
      userPrompt: this.container.querySelector('#peUserPrompt')?.value || defaultType.userPrompt,
      fields: this._getCurrentFieldsFromTable(typeKey),
    };
  }

  async _saveCurrentTab() {
    if (this._state.currentName === 'default') {
      this._toast('error', '不能修改默认模板，请先另存为自定义模板');
      return;
    }

    const typeKey = this._state.currentTab;
    const defaultType = this._state.defaultTemplate?.templates?.[typeKey] || {};
    const tabData = this._collectCurrentTabData();

    // Only persist fields that actually differ from default
    const defaultFields = defaultType.fields || {};
    const customFields = {};
    for (const [key, field] of Object.entries(tabData.fields)) {
      const defaultField = defaultFields[key];
      if (!defaultField || field.label !== defaultField.label || field.description !== defaultField.description) {
        customFields[key] = field;
      }
    }
    tabData.fields = customFields;

    const template = deepClone(this._state.currentTemplate);
    if (!template.templates) template.templates = {};
    template.templates[typeKey] = tabData;

    this._setLoading(true);
    try {
      await api.savePromptTemplate(this._state.currentName, template);
      this._state.currentTemplate = template;

      // 保存即生效：自动将该模板设为当前使用
      if (this._state.currentName !== this._state.activeName) {
        await api.setActivePromptTemplate(this._state.currentName);
        this._state.activeName = this._state.currentName;
      }

      this._render();
      this._toast('success', '当前页保存成功，已设为当前使用模板');
    } catch (err) {
      this._toast('error', err.message);
    } finally {
      this._setLoading(false);
    }
  }

  _resetCurrentTab() {
    if (this._state.currentName === 'default') {
      this._toast('info', '当前已经是默认模板');
      return;
    }

    const typeKey = this._state.currentTab;
    const template = deepClone(this._state.currentTemplate);
    if (template.templates?.[typeKey]) {
      delete template.templates[typeKey];
    }

    this._state.currentTemplate = template;
    this._state.editingField = null;
    this._render();
    this._toast('info', '已恢复此页默认，记得点击保存');
  }

  async _syncTemplate() {
    this._setLoading(true);
    try {
      const result = await api.syncPromptTemplate(this._state.currentName);
      if (result.changed) {
        this._toast('success', '已自动合并默认模板更新');
      } else {
        this._toast('info', '无需同步');
      }
      await this._loadCurrentTemplate();
      this._render();
    } catch (err) {
      this._toast('error', err.message);
    } finally {
      this._setLoading(false);
    }
  }

  _ignoreUpdate() {
    this._state.updateBanner = null;
    this._renderUpdateBanner();
  }

  _showDiff() {
    const current = this._state.currentTemplate;
    const defaultTmpl = this._state.defaultTemplate;
    if (!current || !defaultTmpl) return;

    const diffLines = [];
    for (const [typeKey, defaultType] of Object.entries(defaultTmpl.templates)) {
      const currentType = current.templates?.[typeKey] || {};
      for (const [fieldKey, defaultField] of Object.entries(defaultType.fields || {})) {
        const currentField = currentType.fields?.[fieldKey];
        if (!currentField) {
          diffLines.push(`[新增字段] ${typeKey}.${fieldKey}: ${defaultField.label}`);
        }
      }
      if (!current.templates?.[typeKey]) {
        diffLines.push(`[新增类型] ${typeKey}: ${defaultType.label}`);
      }
    }

    alert(diffLines.length ? diffLines.join('\n') : '当前模板与默认模板一致');
  }

  // ──────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────

  _setLoading(loading) {
    this._state.loading = loading;
    const el = this.container.querySelector('#peLoading');
    if (el) el.style.display = loading ? 'block' : 'none';
  }

  _escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  _toast(type, text) {
    // Simple toast using existing store if available, otherwise alert
    if (window.__promptEditorToast) {
      window.__promptEditorToast(type, text);
      return;
    }

    const container = document.getElementById('toastContainer');
    if (container) {
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.textContent = text;
      container.innerHTML = '';
      container.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    } else {
      alert(text);
    }
  }
}
