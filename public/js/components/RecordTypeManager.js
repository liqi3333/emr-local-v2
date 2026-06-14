/**
 * RecordTypeManager — GUI for managing the record type registry.
 * Three-panel layout: Categories | Types | Fields
 */

import { recordTypeApi } from '../services/recordTypeApi.js';

export class RecordTypeManager {
  constructor(containerEl) {
    this.container = containerEl;
    this._state = {
      registry: null,
      selectedCategory: null,
      selectedType: null,
      editingCategory: null,
      editingType: null,
      editingField: null,
      loading: false,
      newCategory: null,
      newType: null,
      newField: null,
    };
  }

  async render() {
    this._renderSkeleton();
    await this._loadData();
    this._bindEvents();
    this._renderAll();
  }

  // ─── Data ───

  async _loadData() {
    this._setLoading(true);
    try {
      this._state.registry = await recordTypeApi.getRegistry();
      if (this._state.registry.categories.length > 0) {
        this._state.selectedCategory = this._state.registry.categories[0];
        if (this._state.selectedCategory.types.length > 0) {
          this._state.selectedType = this._state.selectedCategory.types[0];
        }
      }
    } catch (err) {
      this._toast('error', '加载失败: ' + err.message);
    } finally {
      this._setLoading(false);
    }
  }

  async _save() {
    this._setLoading(true);
    try {
      await recordTypeApi.saveRegistry(this._state.registry);
      this._toast('success', '保存成功');
    } catch (err) {
      this._toast('error', '保存失败: ' + err.message);
    } finally {
      this._setLoading(false);
    }
  }

  // ─── Render ───

  _renderSkeleton() {
    this.container.innerHTML = `
      <div class="rtm-header">
        <h1>病历类型管理</h1>
        <div class="rtm-actions">
          <button class="btn btn-secondary" id="rtmImportBtn">导入</button>
          <button class="btn btn-secondary" id="rtmExportBtn">导出</button>
          <button class="btn btn-secondary" id="rtmResetBtn">恢复默认</button>
          <button class="btn btn-primary" id="rtmSaveBtn">保存</button>
          <a href="/" class="btn btn-ghost">返回首页</a>
          <input type="file" id="rtmFileInput" accept=".json" style="display:none">
        </div>
      </div>
      <div class="rtm-panels">
        <div class="rtm-panel rtm-categories" id="rtmCategories">
          <div class="rtm-panel-header">
            <h3>一级分类</h3>
            <button class="btn btn-sm" id="rtmAddCategoryBtn">+ 添加</button>
          </div>
          <div class="rtm-panel-body" id="rtmCategoryList"></div>
        </div>
        <div class="rtm-panel rtm-types" id="rtmTypes">
          <div class="rtm-panel-header">
            <h3>二级类型</h3>
            <button class="btn btn-sm" id="rtmAddTypeBtn" disabled>+ 添加</button>
          </div>
          <div class="rtm-panel-body" id="rtmTypeList"></div>
        </div>
        <div class="rtm-panel rtm-fields" id="rtmFields">
          <div class="rtm-panel-header">
            <h3>字段编辑</h3>
            <button class="btn btn-sm" id="rtmAddFieldBtn" disabled>+ 添加</button>
          </div>
          <div class="rtm-panel-body" id="rtmFieldList"></div>
        </div>
      </div>
    `;
  }

  _renderAll() {
    this._renderCategories();
    this._renderTypes();
    this._renderFields();
  }

  _renderCategories() {
    const list = document.getElementById('rtmCategoryList');
    const registry = this._state.registry;
    if (!registry) { list.innerHTML = '<p class="rtm-empty">加载中...</p>'; return; }

    let html = '';
    for (const cat of registry.categories) {
      const selected = this._state.selectedCategory?.id === cat.id;
      const editing = this._state.editingCategory === cat.id;
      if (editing) {
        html += `
          <div class="rtm-item rtm-item-editing" data-id="${cat.id}">
            <input class="rtm-input" id="editCatLabel" value="${this._esc(cat.label)}" placeholder="分类名称">
            <input class="rtm-input rtm-input-sm" id="editCatIcon" value="${this._esc(cat.icon)}" placeholder="图标">
            <div class="rtm-item-actions">
              <button class="btn btn-sm btn-primary" data-action="saveCategory" data-id="${cat.id}">保存</button>
              <button class="btn btn-sm btn-ghost" data-action="cancelEdit">取消</button>
            </div>
          </div>`;
      } else {
        html += `
          <div class="rtm-item ${selected ? 'rtm-item-selected' : ''} ${!cat.enabled ? 'rtm-item-disabled' : ''}" data-id="${cat.id}">
            <span class="rtm-item-icon">${cat.icon}</span>
            <span class="rtm-item-label" data-action="selectCategory" data-id="${cat.id}">${this._esc(cat.label)}</span>
            <span class="rtm-item-count">${cat.types.length}</span>
            <label class="rtm-toggle">
              <input type="checkbox" ${cat.enabled ? 'checked' : ''} data-action="toggleCategory" data-id="${cat.id}">
              <span class="rtm-toggle-slider"></span>
            </label>
            <button class="btn btn-icon" data-action="moveCategoryUp" data-id="${cat.id}" title="上移">⬆️</button>
            <button class="btn btn-icon" data-action="moveCategoryDown" data-id="${cat.id}" title="下移">⬇️</button>
            <button class="btn btn-icon" data-action="editCategory" data-id="${cat.id}" title="编辑">✏️</button>
            <button class="btn btn-icon" data-action="deleteCategory" data-id="${cat.id}" title="删除">🗑️</button>
          </div>`;
      }
    }

    if (this._state.newCategory) {
      html += `
        <div class="rtm-item rtm-item-editing">
          <input class="rtm-input" id="newCatLabel" value="" placeholder="分类名称" autofocus>
          <input class="rtm-input rtm-input-sm" id="newCatIcon" value="📁" placeholder="图标">
          <div class="rtm-item-actions">
            <button class="btn btn-sm btn-primary" data-action="confirmAddCategory">添加</button>
            <button class="btn btn-sm btn-ghost" data-action="cancelAdd">取消</button>
          </div>
        </div>`;
    }

    list.innerHTML = html || '<p class="rtm-empty">暂无分类</p>';
  }

  _renderTypes() {
    const list = document.getElementById('rtmTypeList');
    const addBtn = document.getElementById('rtmAddTypeBtn');
    const cat = this._state.selectedCategory;

    if (!cat) {
      list.innerHTML = '<p class="rtm-empty">请先选择一个分类</p>';
      addBtn.disabled = true;
      return;
    }
    addBtn.disabled = false;

    let html = '';
    for (const type of cat.types) {
      const selected = this._state.selectedType?.id === type.id;
      const editing = this._state.editingType === type.id;
      if (editing) {
        html += `
          <div class="rtm-item rtm-item-editing" data-id="${type.id}">
            <input class="rtm-input" id="editTypeLabel" value="${this._esc(type.label)}" placeholder="类型名称">
            <input class="rtm-input rtm-input-sm" id="editTypeStoreKey" value="${this._esc(type.storeKey)}" placeholder="storeKey">
            <input class="rtm-input rtm-input-sm" id="editTypeTemplateKey" value="${this._esc(type.templateKey)}" placeholder="templateKey">
            <div class="rtm-item-actions">
              <button class="btn btn-sm btn-primary" data-action="saveType" data-id="${type.id}">保存</button>
              <button class="btn btn-sm btn-ghost" data-action="cancelEdit">取消</button>
            </div>
          </div>`;
      } else {
        html += `
          <div class="rtm-item ${selected ? 'rtm-item-selected' : ''} ${!type.enabled ? 'rtm-item-disabled' : ''}" data-id="${type.id}">
            <span class="rtm-item-icon">${type.icon}</span>
            <span class="rtm-item-label" data-action="selectType" data-id="${type.id}">${this._esc(type.label)}</span>
            <span class="rtm-item-count">${type.fields.length} 字段</span>
            <label class="rtm-toggle">
              <input type="checkbox" ${type.enabled ? 'checked' : ''} data-action="toggleType" data-id="${type.id}">
              <span class="rtm-toggle-slider"></span>
            </label>
            <button class="btn btn-icon" data-action="moveTypeUp" data-id="${type.id}" title="上移">⬆️</button>
            <button class="btn btn-icon" data-action="moveTypeDown" data-id="${type.id}" title="下移">⬇️</button>
            <button class="btn btn-icon" data-action="editType" data-id="${type.id}" title="编辑">✏️</button>
            <button class="btn btn-icon" data-action="deleteType" data-id="${type.id}" title="删除">🗑️</button>
          </div>`;
      }
    }

    if (this._state.newType) {
      html += `
        <div class="rtm-item rtm-item-editing">
          <input class="rtm-input" id="newTypeLabel" value="" placeholder="类型名称" autofocus>
          <div class="rtm-item-actions">
            <button class="btn btn-sm btn-primary" data-action="confirmAddType">添加</button>
            <button class="btn btn-sm btn-ghost" data-action="cancelAdd">取消</button>
          </div>
        </div>`;
    }

    list.innerHTML = html || '<p class="rtm-empty">暂无类型</p>';
  }

  _renderFields() {
    const list = document.getElementById('rtmFieldList');
    const addBtn = document.getElementById('rtmAddFieldBtn');
    const type = this._state.selectedType;

    if (!type) {
      list.innerHTML = '<p class="rtm-empty">请先选择一个类型</p>';
      addBtn.disabled = true;
      return;
    }
    addBtn.disabled = false;

    let html = '';
    for (const field of type.fields) {
      const editing = this._state.editingField === field.key;
      if (editing) {
        html += `
          <div class="rtm-item rtm-item-editing rtm-field-item" data-key="${field.key}">
            <input class="rtm-input rtm-input-sm" id="editFieldKey" value="${this._esc(field.key)}" placeholder="key">
            <input class="rtm-input" id="editFieldLabel" value="${this._esc(field.label)}" placeholder="标签">
            <textarea class="rtm-input rtm-textarea" id="editFieldDesc" placeholder="描述">${this._esc(field.description)}</textarea>
            <div class="rtm-item-actions">
              <button class="btn btn-sm btn-primary" data-action="saveField" data-key="${field.key}">保存</button>
              <button class="btn btn-sm btn-ghost" data-action="cancelEdit">取消</button>
            </div>
          </div>`;
      } else {
        html += `
          <div class="rtm-item rtm-field-item ${field.enabled === false ? 'rtm-item-disabled' : ''}" data-key="${field.key}">
            <span class="rtm-field-key">${this._esc(field.key)}</span>
            <span class="rtm-field-label">${this._esc(field.label)}</span>
            <label class="rtm-toggle">
              <input type="checkbox" ${field.enabled !== false ? 'checked' : ''} data-action="toggleField" data-key="${field.key}">
              <span class="rtm-toggle-slider"></span>
            </label>
            <button class="btn btn-icon" data-action="moveFieldUp" data-key="${field.key}" title="上移">⬆️</button>
            <button class="btn btn-icon" data-action="moveFieldDown" data-key="${field.key}" title="下移">⬇️</button>
            <button class="btn btn-icon" data-action="editField" data-key="${field.key}" title="编辑">✏️</button>
            <button class="btn btn-icon" data-action="deleteField" data-key="${field.key}" title="删除">🗑️</button>
          </div>`;
      }
    }

    if (this._state.newField) {
      html += `
        <div class="rtm-item rtm-item-editing rtm-field-item">
          <input class="rtm-input" id="newFieldLabel" value="" placeholder="字段名称" autofocus>
          <textarea class="rtm-input rtm-textarea" id="newFieldDesc" placeholder="描述（可选，给AI的提示）"></textarea>
          <div class="rtm-item-actions">
            <button class="btn btn-sm btn-primary" data-action="confirmAddField">添加</button>
            <button class="btn btn-sm btn-ghost" data-action="cancelAdd">取消</button>
          </div>
        </div>`;
    }

    list.innerHTML = html || '<p class="rtm-empty">暂无字段</p>';
  }

  // ─── Events ───

  _bindEvents() {
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const key = btn.dataset.key;
        this._handleAction(action, id, key);
        return;
      }
      // Top-level buttons
      if (e.target.id === 'rtmSaveBtn') this._save().then(() => this._renderAll());
      if (e.target.id === 'rtmExportBtn') recordTypeApi.exportRegistry().catch(err => this._toast('error', err.message));
      if (e.target.id === 'rtmImportBtn') document.getElementById('rtmFileInput').click();
      if (e.target.id === 'rtmResetBtn' && confirm('确定恢复默认？所有自定义配置将丢失。')) {
        recordTypeApi.resetRegistry().then(async () => {
          await this._loadData();
          this._renderAll();
          this._toast('success', '已恢复默认');
        }).catch(err => this._toast('error', err.message));
      }
      // Add buttons
      if (e.target.id === 'rtmAddCategoryBtn') this._handleAction('addCategory');
      if (e.target.id === 'rtmAddTypeBtn') this._handleAction('addType');
      if (e.target.id === 'rtmAddFieldBtn') this._handleAction('addField');
    });

    const fileInput = document.getElementById('rtmFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          await recordTypeApi.importRegistry(file);
          await this._loadData();
          this._renderAll();
          this._toast('success', '导入成功');
        } catch (err) {
          this._toast('error', '导入失败: ' + err.message);
        }
        fileInput.value = '';
      });
    }
  }

  async _handleAction(action, id, key) {
    const registry = this._state.registry;
    switch (action) {

      // ─── Categories ───
      case 'selectCategory':
        this._state.selectedCategory = registry.categories.find(c => c.id === id);
        this._state.selectedType = this._state.selectedCategory?.types[0] || null;
        this._renderAll();
        break;

      case 'editCategory':
        this._state.editingCategory = id;
        this._state.editingType = null;
        this._state.editingField = null;
        this._renderAll();
        break;

      case 'saveCategory': {
        const cat = registry.categories.find(c => c.id === id);
        if (cat) {
          cat.label = document.getElementById('editCatLabel').value.trim() || cat.label;
          cat.icon = document.getElementById('editCatIcon').value.trim() || cat.icon;
          await this._save();
        }
        this._state.editingCategory = null;
        this._renderAll();
        break;
      }

      case 'toggleCategory': {
        const cat = registry.categories.find(c => c.id === id);
        if (cat) {
          cat.enabled = !cat.enabled;
          // When disabling category, disable all its types
          if (!cat.enabled) {
            for (const t of cat.types) {
              t.enabled = false;
            }
          }
          await this._save();
          this._renderCategories();
          this._renderTypes();
        }
        break;
      }

      case 'deleteCategory': {
        if (!confirm('确定删除此分类及其所有类型？')) break;
        registry.categories = registry.categories.filter(c => c.id !== id);
        if (this._state.selectedCategory?.id === id) {
          this._state.selectedCategory = registry.categories[0] || null;
          this._state.selectedType = this._state.selectedCategory?.types[0] || null;
        }
        await this._save();
        this._renderAll();
        break;
      }

      // ─── Types ───
      case 'selectType': {
        const cat = this._state.selectedCategory;
        this._state.selectedType = cat?.types.find(t => t.id === id) || null;
        this._renderTypes();
        this._renderFields();
        break;
      }

      case 'editType':
        this._state.editingType = id;
        this._state.editingCategory = null;
        this._state.editingField = null;
        this._renderAll();
        break;

      case 'saveType': {
        const cat = this._state.selectedCategory;
        const type = cat?.types.find(t => t.id === id);
        if (type) {
          type.label = document.getElementById('editTypeLabel').value.trim() || type.label;
          type.storeKey = document.getElementById('editTypeStoreKey').value.trim() || type.storeKey;
          type.templateKey = document.getElementById('editTypeTemplateKey').value.trim() || type.templateKey;
          await this._save();
        }
        this._state.editingType = null;
        this._renderAll();
        break;
      }

      case 'toggleType': {
        const cat = this._state.selectedCategory;
        const type = cat?.types.find(t => t.id === id);
        if (type) {
          type.enabled = !type.enabled;
          await this._save();
          this._renderTypes();
        }
        break;
      }

      case 'deleteType': {
        if (!confirm('确定删除此类型？')) break;
        const cat = this._state.selectedCategory;
        cat.types = cat.types.filter(t => t.id !== id);
        if (this._state.selectedType?.id === id) {
          this._state.selectedType = cat.types[0] || null;
        }
        await this._save();
        this._renderAll();
        break;
      }

      // ─── Fields ───
      case 'editField':
        this._state.editingField = key;
        this._state.editingCategory = null;
        this._state.editingType = null;
        this._renderFields();
        break;

      case 'saveField': {
        const type = this._state.selectedType;
        const field = type?.fields.find(f => f.key === key);
        if (field) {
          const newKey = document.getElementById('editFieldKey').value.trim() || field.key;
          field.key = newKey;
          field.label = document.getElementById('editFieldLabel').value.trim() || field.label;
          field.description = document.getElementById('editFieldDesc').value.trim() || field.description;
          await this._save();
        }
        this._state.editingField = null;
        this._renderFields();
        break;
      }

      case 'toggleField': {
        const type = this._state.selectedType;
        const field = type.fields.find(f => f.key === key);
        if (field) {
          field.enabled = field.enabled === false ? true : false;
          await this._save();
          this._renderFields();
        }
        break;
      }

      case 'deleteField': {
        if (!confirm('确定删除此字段？')) break;
        const type = this._state.selectedType;
        type.fields = type.fields.filter(f => f.key !== key);
        await this._save();
        this._renderFields();
        break;
      }

      case 'moveFieldUp': {
        const type = this._state.selectedType;
        const idx = type.fields.findIndex(f => f.key === key);
        if (idx > 0) {
          [type.fields[idx - 1], type.fields[idx]] = [type.fields[idx], type.fields[idx - 1]];
          await this._save();
          this._renderFields();
        }
        break;
      }

      case 'moveFieldDown': {
        const type = this._state.selectedType;
        const idx = type.fields.findIndex(f => f.key === key);
        if (idx < type.fields.length - 1) {
          [type.fields[idx], type.fields[idx + 1]] = [type.fields[idx + 1], type.fields[idx]];
          await this._save();
          this._renderFields();
        }
        break;
      }

      case 'moveCategoryUp': {
        const registry = this._state.registry;
        const idx = registry.categories.findIndex(c => c.id === id);
        if (idx > 0) {
          [registry.categories[idx - 1], registry.categories[idx]] = [registry.categories[idx], registry.categories[idx - 1]];
          await this._save();
          this._renderAll();
        }
        break;
      }

      case 'moveCategoryDown': {
        const registry = this._state.registry;
        const idx = registry.categories.findIndex(c => c.id === id);
        if (idx < registry.categories.length - 1) {
          [registry.categories[idx], registry.categories[idx + 1]] = [registry.categories[idx + 1], registry.categories[idx]];
          await this._save();
          this._renderAll();
        }
        break;
      }

      case 'moveTypeUp': {
        const cat = this._state.selectedCategory;
        const idx = cat.types.findIndex(t => t.id === id);
        if (idx > 0) {
          [cat.types[idx - 1], cat.types[idx]] = [cat.types[idx], cat.types[idx - 1]];
          await this._save();
          this._renderAll();
        }
        break;
      }

      case 'moveTypeDown': {
        const cat = this._state.selectedCategory;
        const idx = cat.types.findIndex(t => t.id === id);
        if (idx < cat.types.length - 1) {
          [cat.types[idx], cat.types[idx + 1]] = [cat.types[idx + 1], cat.types[idx]];
          await this._save();
          this._renderAll();
        }
        break;
      }

      // ─── Add ───
      case 'addCategory':
        this._state.newCategory = true;
        this._renderCategories();
        setTimeout(() => document.getElementById('newCatLabel')?.focus(), 50);
        break;

      case 'confirmAddCategory': {
        const label = document.getElementById('newCatLabel').value.trim();
        const icon = document.getElementById('newCatIcon').value.trim() || '📁';
        if (!label) { this._toast('error', '分类名称不能为空'); break; }
        const id = label.replace(/\s+/g, '');
        if (registry.categories.find(c => c.id === id)) {
          this._toast('error', '分类ID已存在'); break;
        }
        registry.categories.push({ id, label, icon, enabled: true, sortOrder: registry.categories.length, types: [] });
        this._state.newCategory = null;
        await this._save();
        this._renderAll();
        break;
      }

      case 'addType':
        if (!this._state.selectedCategory) { this._toast('info', '请先选择一个分类'); break; }
        this._state.newType = true;
        this._renderTypes();
        setTimeout(() => document.getElementById('newTypeLabel')?.focus(), 50);
        break;

      case 'confirmAddType': {
        const label = document.getElementById('newTypeLabel').value.trim();
        if (!label) { this._toast('error', '类型名称不能为空'); break; }
        const cat = this._state.selectedCategory;
        const seq = cat.types.length + 1;
        const storeKey = cat.id + '_custom_' + seq;
        const templateKey = 'generic_' + storeKey;
        if (cat.types.find(t => t.id === storeKey)) {
          this._toast('error', '类型ID已存在'); break;
        }
        cat.types.push({
          id: storeKey, label, icon: '📄', storeKey, templateKey,
          enabled: true, sortOrder: cat.types.length,
          contextDependencies: [], fields: [],
        });
        this._state.newType = null;
        await this._save();
        this._renderAll();
        break;
      }

      case 'addField':
        if (!this._state.selectedType) { this._toast('info', '请先选择一个类型'); break; }
        this._state.newField = true;
        this._renderFields();
        setTimeout(() => document.getElementById('newFieldKey')?.focus(), 50);
        break;

      case 'confirmAddField': {
        const label = document.getElementById('newFieldLabel').value.trim();
        const description = document.getElementById('newFieldDesc').value.trim();
        if (!label) { this._toast('error', '字段名称不能为空'); break; }
        const type = this._state.selectedType;
        let key = 'field_' + (type.fields.length + 1);
        if (type.fields.find(f => f.key === key)) {
          key = 'field_' + Date.now();
        }
        type.fields.push({ key, label, description });
        this._state.newField = null;
        await this._save();
        this._renderFields();
        break;
      }

      // ─── Cancel / Global ───
      case 'cancelEdit':
        this._state.editingCategory = null;
        this._state.editingType = null;
        this._state.editingField = null;
        this._renderAll();
        break;

      case 'cancelAdd':
        this._state.newCategory = null;
        this._state.newType = null;
        this._state.newField = null;
        this._renderAll();
        break;
    }
  }

  // ─── Utils ───

  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _setLoading(v) {
    this._state.loading = v;
  }

  _toast(type, msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}
