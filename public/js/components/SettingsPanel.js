/**
 * SettingsPanel — modal popup for AI model management.
 *
 * CRUD for models stored in localStorage ('models', 'activeModelId').
 * Compatible with v1 localStorage schema.
 *
 * Usage:
 *   import { SettingsPanel } from './components/SettingsPanel.js';
 *   const panel = new SettingsPanel(document.getElementById('btnModels'));
 *   panel.render();
 */
import { store } from '../store.js';

/** Provider presets */
const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    models: [
      { value: 'gpt-5.5', label: 'GPT-5.5 (最新)' },
      { value: 'gpt-5.4', label: 'GPT-5.4 (稳定)' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
      { value: 'gpt-4o', label: 'GPT-4o (旧版本)' },
    ],
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 (最新)' },
      { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (推荐)' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (最快)' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (推荐)' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (备选)' },
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (最新)' },
      { value: 'gemma-4-31b', label: 'Gemma 4 31B' },
      { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (预览)' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    models: [
      { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (最新)' },
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (推荐)' },
      { value: 'deepseek-chat', label: 'DeepSeek Chat (旧版本)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (旧版本)' },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:1.5b',
    models: [
      { value: 'qwen2.5:1.5b', label: 'Qwen 2.5 1.5B' },
      { value: 'qwen2.5:7b', label: 'Qwen 2.5 7B' },
      { value: 'llama3.2:3b', label: 'Llama 3.2 3B' },
      { value: 'phi3:mini', label: 'Phi-3 Mini' },
    ],
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容',
    defaultBaseUrl: '',
    defaultModel: '',
    models: [],
  },
];

function generateId() {
  return crypto.randomUUID();
}

/** Read models array from localStorage */
function loadModels() {
  try {
    return JSON.parse(localStorage.getItem('models') || '[]');
  } catch {
    return [];
  }
}

/** Read active model id from localStorage */
function loadActiveId() {
  return localStorage.getItem('activeModelId') || '';
}

/** Write models array to localStorage */
function saveModels(models) {
  localStorage.setItem('models', JSON.stringify(models));
}

/** Write active model id to localStorage */
function saveActiveId(id) {
  localStorage.setItem('activeModelId', id || '');
}

/** Get the active model object (or first available) */
function getActiveModel() {
  const activeId = loadActiveId();
  if (activeId === '__offline__') return null;
  const models = loadModels();
  return models.find((m) => m.id === activeId) || models[0] || null;
}

/** Update the header badge and store state */
function updateModelUI() {
  const badge = document.getElementById('modelBadge');
  const activeId = loadActiveId();
  if (badge) {
    if (activeId === '__offline__') {
      badge.textContent = '📴 离线模式';
    } else {
      const active = getActiveModel();
      badge.textContent = active
        ? `🧠 ${active.name || active.modelName || '未命名模型'}`
        : '⚙️ 未配置模型';
    }
  }
  // Let store know about active model (for API calls via getModelConfig)
  store.setState({ activeModel: activeId === '__offline__' ? null : getActiveModel() });
}

export class SettingsPanel {
  constructor(triggerBtn) {
    this.triggerBtn = triggerBtn; // #btnModels
    this._modalEl = null;
    this._overlayEl = null;
    this._boundKeydown = null;
    this._editingId = null; // id of model being edited (null = adding new)
  }

  render() {
    this.triggerBtn.addEventListener('click', () => this.show());
  }

  // ────────────────────────────────────────────────────────────────
  //  Show / Close
  // ────────────────────────────────────────────────────────────────

  show() {
    // Singleton: remove existing modal if any
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    this._renderModal();
    this._bindEvents();
  }

  close() {
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
      this._modalEl = null;
    }
    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
      this._boundKeydown = null;
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Build modal DOM
  // ────────────────────────────────────────────────────────────────

  _renderModal() {
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'modal-overlay';

    this._modalEl = document.createElement('div');
    this._modalEl.className = 'modal';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h3>🧠 AI 模型管理</h3>
      <button class="btn-close" data-action="close">✕</button>
    `;
    this._modalEl.appendChild(header);

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.id = 'settingsModalBody';
    this._modalEl.appendChild(body);

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const closeBtn = document.createElement('button');
    closeBtn.dataset.action = 'close';
    closeBtn.textContent = '关闭';
    footer.appendChild(closeBtn);
    this._modalEl.appendChild(footer);

    this._overlayEl.appendChild(this._modalEl);
    document.body.appendChild(this._overlayEl);

    // Render the model list
    this._renderModelList();
  }

  _renderModelList() {
    const body = this._modalEl.querySelector('#settingsModalBody');
    if (!body) return;
    body.innerHTML = '';

    const models = loadModels();
    const activeId = loadActiveId();

    // ── Offline mode card (always shown first) ──
    const list = document.createElement('div');
    list.id = 'modelList';

    const offlineItem = document.createElement('div');
    offlineItem.className = 'model-item' + (activeId === '__offline__' ? ' active' : '');
    offlineItem.dataset.modelId = '__offline__';
    offlineItem.innerHTML = `
      <div class="info">
        <div class="name">📴 离线模式</div>
        <div class="detail">使用内置模板，无需模型</div>
      </div>
      <div class="actions">
        <button data-action="select" title="切换至离线模式">✓</button>
      </div>
    `;
    offlineItem.addEventListener('click', (e) => {
      if (e.target.closest('.actions')) return;
      this._selectModel('__offline__');
    });
    list.appendChild(offlineItem);

    // ── Model items ──
    if (models.length > 0) {
      for (const model of models) {
        const item = document.createElement('div');
        item.className = 'model-item' + (model.id === activeId ? ' active' : '');
        item.dataset.modelId = model.id;

        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = `
          <div class="name">${this._escapeHtml(model.name || model.modelName || '未命名模型')}</div>
          <div class="detail">${this._escapeHtml(model.provider || '')} · ${this._escapeHtml(model.modelName || '')}</div>
        `;
        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.innerHTML = `
          <button data-action="select" title="设为活跃模型">✓</button>
          <button data-action="edit" title="编辑">✎</button>
          <button class="btn-del" data-action="delete" title="删除">🗑</button>
        `;
        item.appendChild(actions);

        item.addEventListener('click', (e) => {
          if (e.target.closest('.actions')) return;
          this._selectModel(model.id);
        });

        list.appendChild(item);
      }
    }
    body.appendChild(list);

    // ── OAuth hint ──
    const oauthHint = document.createElement('div');
    oauthHint.style.cssText =
      'margin-top:12px;padding:8px 10px;background:var(--warning-light);border-radius:var(--radius-sm);font-size:12px;color:var(--warning)';
    oauthHint.innerHTML = `
      🔑 <a href="#" id="oauthLink" style="color:var(--warning);text-decoration:underline">OAuth 2.0 登录</a>
      · 也可手动输入 API Key
    `;
    body.appendChild(oauthHint);

    // ── Add model button ──
    const addBtn = document.createElement('button');
    addBtn.id = 'btnAddModel';
    addBtn.style.cssText =
      'margin-top:12px;width:100%;padding:8px;border:1px dashed var(--border);border-radius:var(--radius-sm);background:none;font-size:13px;cursor:pointer';
    addBtn.textContent = '+ 添加模型';
    body.appendChild(addBtn);

    // ── Edit / Add form (hidden initially) ──
    const formContainer = document.createElement('div');
    formContainer.id = 'modelFormContainer';
    formContainer.style.display = 'none';
    body.appendChild(formContainer);

    // ── Event delegation on body ──
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const modelItem = btn.closest('.model-item');
      const modelId = modelItem ? modelItem.dataset.modelId : null;

      if (action === 'close') {
        this.close();
      } else if (action === 'select' && modelId) {
        this._selectModel(modelId);
      } else if (action === 'edit' && modelId) {
        this._editModel(modelId);
      } else if (action === 'delete' && modelId) {
        this._deleteModel(modelId);
      }
    });

    // OAuth link
    oauthHint.querySelector('#oauthLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      alert('OAuth 2.0 将在后续版本支持。当前请手动输入 API Key。');
    });

    // Add model button
    addBtn.addEventListener('click', () => this._addModel());
  }

  // ────────────────────────────────────────────────────────────────
  //  Model CRUD
  // ────────────────────────────────────────────────────────────────

  _selectModel(id) {
    if (id === '__offline__') {
      saveActiveId('__offline__');
      updateModelUI();
      // Update visual active state
      const items = this._modalEl.querySelectorAll('.model-item');
      items.forEach((item) => {
        item.classList.toggle('active', item.dataset.modelId === '__offline__');
      });
      return;
    }

    const models = loadModels();
    const model = models.find((m) => m.id === id);
    if (!model) return;

    saveActiveId(id);
    updateModelUI();

    // Update visual active state
    const items = this._modalEl.querySelectorAll('.model-item');
    items.forEach((item) => {
      item.classList.toggle('active', item.dataset.modelId === id);
    });
  }

  _editModel(id) {
    const models = loadModels();
    const model = models.find((m) => m.id === id);
    if (!model) return;

    this._editingId = id;
    this._showForm(model);
  }

  _addModel() {
    this._editingId = null;
    this._showForm(null);
  }

  _deleteModel(id) {
    if (!confirm('确定要删除此模型配置吗？')) return;

    let models = loadModels();
    const activeId = loadActiveId();
    models = models.filter((m) => m.id !== id);
    saveModels(models);

    // If deleted model was active, clear or pick first
    if (activeId === id) {
      const newActive = models[0] ? models[0].id : '';
      saveActiveId(newActive);
    }

    updateModelUI();
    this._renderModelList(); // Re-render the list
  }

  // ────────────────────────────────────────────────────────────────
  //  Form rendering
  // ────────────────────────────────────────────────────────────────

  _showForm(model) {
    const container = this._modalEl.querySelector('#modelFormContainer');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = '';

    const isEdit = !!model;
    const form = document.createElement('div');
    form.className = 'model-form';

    // Get current provider's models
    const currentProvider = PROVIDERS.find((p) => p.id === (model?.provider || 'openai'));
    const currentModels = currentProvider?.models || [];
    const currentModelName = model?.modelName || '';

    // Helper to generate model select options
    const generateModelOptions = (models, selectedValue) => {
      const options = models.map(
        (m) =>
          `<option value="${m.value}" ${m.value === selectedValue ? 'selected' : ''}>${m.label}</option>`
      ).join('');
      const hasSelected = models.some(m => m.value === selectedValue);
      if (!hasSelected && selectedValue) {
        return `<option value="${selectedValue}" selected>${selectedValue}</option>${options}`;
      }
      return options;
    };

    form.innerHTML = `
      <label>模型名称</label>
      <input id="mfName" type="text" placeholder="例如: GPT-4o" value="${this._escapeHtml(model?.name || '')}" />

      <label>提供商</label>
      <select id="mfProvider">
        ${PROVIDERS.map(
          (p) =>
            `<option value="${p.id}" ${
              (model?.provider || 'openai') === p.id ? 'selected' : ''
            }>${p.label}</option>`,
        ).join('')}
      </select>

      <label>Base URL</label>
      <input id="mfBaseUrl" type="text" placeholder="https://api.openai.com/v1" value="${this._escapeHtml(model?.baseUrl || '')}" />

      <label>模型名称 (Model Name)</label>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="mfModelSelect" style="flex:1">
          ${generateModelOptions(currentModels, currentModelName)}
          ${currentModels.length === 0 ? `<option value="__custom__" selected>自定义...</option>` : ''}
        </select>
      </div>
      <input id="mfModelName" type="text" placeholder="输入自定义模型名" value="${this._escapeHtml(currentModelName)}" style="display:${currentModels.length === 0 || !currentModels.some(m => m.value === currentModelName) ? 'block' : 'none'}" />

      <label>API Key</label>
      <div style="position:relative">
        <input id="mfApiKey" type="password" placeholder="sk-..." value="${this._escapeHtml(model?.apiKey || '')}" style="width:100%;padding-right:36px;box-sizing:border-box" />
        <button type="button" id="mfToggleKey" aria-label="切换显示" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;line-height:1;display:flex;align-items:center;color:var(--text-muted)" data-visible="false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>

      <div style="display:flex;gap:8px;margin-top:8px">
        <button id="mfSave" style="flex:1;padding:6px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">
          ${isEdit ? '💾 更新模型' : '💾 添加模型'}
        </button>
        <button id="mfCancel" style="padding:6px 12px;background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:13px">
          取消
        </button>
      </div>
    `;

    container.appendChild(form);

    // Auto-fill base URL and update model list when provider changes
    const providerSelect = form.querySelector('#mfProvider');
    const baseUrlInput = form.querySelector('#mfBaseUrl');
    const modelSelect = form.querySelector('#mfModelSelect');
    const modelNameInput = form.querySelector('#mfModelName');

    const updateModelList = (providerId) => {
      const provider = PROVIDERS.find((p) => p.id === providerId);
      if (provider && provider.defaultBaseUrl) {
        baseUrlInput.value = provider.defaultBaseUrl;
      }
      // Update model select options
      const models = provider?.models || [];
      modelSelect.innerHTML = generateModelOptions(models, provider?.defaultModel || '');
      if (models.length === 0) {
        modelSelect.innerHTML = '<option value="__custom__" selected>自定义...</option>';
        modelNameInput.value = '';
        modelNameInput.style.display = 'block';
      } else {
        modelNameInput.value = provider?.defaultModel || '';
        modelNameInput.style.display = 'none';
      }
    };

    modelSelect.addEventListener('change', () => {
      if (modelSelect.value === '__custom__') {
        modelNameInput.value = '';
        modelNameInput.style.display = 'block';
      } else {
        modelNameInput.value = modelSelect.value;
        modelNameInput.style.display = 'none';
      }
    });

    providerSelect.addEventListener('change', () => {
      updateModelList(providerSelect.value);
    });

    // Toggle API Key visibility
    const keyInput = form.querySelector('#mfApiKey');
    const toggleBtn = form.querySelector('#mfToggleKey');
    toggleBtn.addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
      toggleBtn.dataset.visible = isPassword ? 'true' : 'false';
      toggleBtn.innerHTML = isPassword
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });

    // Save
    form.querySelector('#mfSave').addEventListener('click', () => this._saveForm(form));
    form.querySelector('#mfCancel').addEventListener('click', () => {
      container.style.display = 'none';
      container.innerHTML = '';
      this._editingId = null;
    });
  }

  _saveForm(form) {
    const name = form.querySelector('#mfName').value.trim();
    const provider = form.querySelector('#mfProvider').value;
    const baseUrl = form.querySelector('#mfBaseUrl').value.trim();
    const modelName = form.querySelector('#mfModelName').value.trim();
    const apiKey = form.querySelector('#mfApiKey').value.trim();

    if (!name) {
      alert('请输入模型名称');
      return;
    }
    if (!baseUrl) {
      alert('请输入 Base URL');
      return;
    }
    if (!modelName) {
      alert('请输入模型名称 (Model Name)');
      return;
    }
    if (!apiKey && provider !== 'ollama') {
      alert('请输入 API Key');
      return;
    }

    const models = loadModels();
    const now = new Date().toISOString();

    if (this._editingId) {
      // Update existing
      const idx = models.findIndex((m) => m.id === this._editingId);
      if (idx !== -1) {
        models[idx] = {
          ...models[idx],
          name,
          provider,
          baseUrl,
          modelName,
          apiKey,
          updatedAt: now,
        };
      }
    } else {
      // Add new
      const newModel = {
        id: generateId(),
        name,
        provider,
        baseUrl,
        modelName,
        apiKey,
        createdAt: now,
        updatedAt: now,
      };
      models.push(newModel);

      // Auto-select first model
      if (models.length === 1) {
        saveActiveId(newModel.id);
      }
    }

    saveModels(models);
    updateModelUI();

    // Sync to backend (silent)
    this._syncToBackend({ provider, baseUrl, model: modelName, apiKey });

    // Hide form and refresh list
    const container = this._modalEl.querySelector('#modelFormContainer');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    this._editingId = null;
    this._renderModelList();
  }

  // ────────────────────────────────────────────────────────────────
  //  Backend Sync (silent)
  // ────────────────────────────────────────────────────────────────

  async _syncToBackend(config) {
    try {
      // Sync to SQLite (primary storage)
      await fetch('/api/settings/model-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (err) {
      console.warn('[SettingsPanel] Failed to sync to backend:', err);
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Events
  // ────────────────────────────────────────────────────────────────

  _bindEvents() {
    // Close on overlay click
    this._overlayEl.addEventListener('click', (e) => {
      if (e.target === this._overlayEl) this.close();
    });

    // Close buttons (header ✕ and footer 关闭) — outside modal body
    this._modalEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="close"]');
      if (btn) this.close();
    });

    // Close on Escape
    this._boundKeydown = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._boundKeydown);
  }

  // ────────────────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────────────────

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  destroy() {
    this.close();
  }
}

// Auto-initialize model badge on first import
updateModelUI();
