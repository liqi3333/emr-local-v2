/**
 * DiseaseManager — GUI for managing the disease category catalog.
 * Two-panel layout: Categories | Diseases
 *
 * Categories support name/icon/color editing via palette + emoji pickers.
 * Diseases support name editing (rename triggers history migration) and sorting.
 */

import { diseaseApi } from '../services/diseaseApi.js';
import { COLOR_PALETTE, EMOJI_LIST, getDefaultStyle, findPaletteByColor } from '../data/diseaseStyles.js';

export class DiseaseManager {
  constructor(containerEl) {
    this.container = containerEl;
    this._state = {
      categories: [],
      selectedCategoryId: null,
      editingCategory: null,
      editingDisease: null,
      newCategory: false,
      newDisease: false,
      loading: false,
    };
  }

  async render() {
    this._renderSkeleton();
    this._bindEvents();
    await this._loadData();
    this._renderAll();
  }

  // ─── Data ───

  async _loadData() {
    this._setLoading(true);
    try {
      this._state.categories = await diseaseApi.getDiseases();
      if (this._state.categories.length > 0 && !this._state.selectedCategoryId) {
        this._state.selectedCategoryId = this._state.categories[0].id;
      }
    } catch (err) {
      this._toast('error', '加载失败: ' + err.message);
    } finally {
      this._setLoading(false);
    }
  }

  // ─── Render ───

  _renderSkeleton() {
    this.container.innerHTML = `
      <div class="dm-header">
        <h1>🏥 疾病目录管理</h1>
        <div class="dm-actions">
          <button class="btn btn-secondary" id="dmImportBtn">导入</button>
          <button class="btn btn-secondary" id="dmExportBtn">导出</button>
          <button class="btn btn-secondary" id="dmResetBtn">恢复默认</button>
          <a href="/" class="btn btn-ghost">返回首页</a>
          <input type="file" id="dmFileInput" accept=".json" style="display:none">
        </div>
      </div>
      <div class="dm-panels">
        <div class="dm-panel" id="dmCategoriesPanel">
          <div class="dm-panel-header">
            <h3>一级分类</h3>
            <button class="btn btn-sm" id="dmAddCategoryBtn">+ 添加</button>
          </div>
          <div class="dm-panel-body" id="dmCategoryList"></div>
        </div>
        <div class="dm-panel" id="dmDiseasesPanel">
          <div class="dm-panel-header">
            <h3>二级疾病</h3>
            <button class="btn btn-sm" id="dmAddDiseaseBtn" disabled>+ 添加</button>
          </div>
          <div class="dm-panel-body" id="dmDiseaseList"></div>
        </div>
      </div>
    `;
  }

  _renderAll() {
    this._renderCategories();
    this._renderDiseases();
  }

  _renderCategories() {
    const list = document.getElementById('dmCategoryList');
    if (!list) return;
    const cats = this._state.categories;

    if (cats.length === 0 && !this._state.newCategory) {
      list.innerHTML = '<div class="dm-empty">暂无分类，点击右上角添加</div>';
    } else {
      list.innerHTML = cats.map((cat) => {
        const isSelected = cat.id === this._state.selectedCategoryId;
        const isEditing = this._state.editingCategory === cat.id;
        if (isEditing) {
          return this._renderCategoryEditCard(cat);
        }
        return `
          <div class="dm-item ${isSelected ? 'dm-item-selected' : ''}" data-action="selectCategory" data-id="${this._esc(cat.id)}">
            <span class="dm-item-icon">${this._esc(cat.icon || '📁')}</span>
            <span class="dm-item-label">${this._esc(cat.name)}</span>
            <span class="dm-item-count">${cat.diseases.length}</span>
            <div class="dm-item-actions">
              <button class="btn-icon" data-action="moveCategoryUp" data-id="${this._esc(cat.id)}" title="上移">▲</button>
              <button class="btn-icon" data-action="moveCategoryDown" data-id="${this._esc(cat.id)}" title="下移">▼</button>
              <button class="btn-icon" data-action="editCategory" data-id="${this._esc(cat.id)}" title="编辑">✏️</button>
              <button class="btn-icon" data-action="deleteCategory" data-id="${this._esc(cat.id)}" title="删除">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }

    if (this._state.newCategory) {
      list.innerHTML += this._renderNewCategoryCard();
    }

    // Update add-disease button state
    const addDiseaseBtn = document.getElementById('dmAddDiseaseBtn');
    if (addDiseaseBtn) {
      addDiseaseBtn.disabled = !this._state.selectedCategoryId;
    }
  }

  _renderCategoryEditCard(cat) {
    const selectedPalette = findPaletteByColor(cat.color);
    return `
      <div class="dm-item dm-item-editing" data-edit-id="${this._esc(cat.id)}">
        <div class="dm-edit-row">
          <label class="dm-edit-label">分类名称</label>
          <input class="dm-input" id="editCatName" value="${this._esc(cat.name)}" placeholder="分类名称" />
        </div>
        <div class="dm-edit-row">
          <label class="dm-edit-label">图标</label>
          <div class="dm-emoji-grid" id="editCatEmojiGrid">
            ${EMOJI_LIST.map(em => `
              <div class="dm-emoji-item ${em === cat.icon ? 'dm-emoji-item-selected' : ''}" data-emoji="${em}">${em}</div>
            `).join('')}
          </div>
        </div>
        <div class="dm-edit-row">
          <label class="dm-edit-label">颜色</label>
          <div class="dm-palette" id="editCatPalette">
            ${COLOR_PALETTE.map(p => `
              <div class="dm-color-swatch ${p.name === selectedPalette?.name ? 'dm-color-swatch-selected' : ''}"
                   data-color="${p.color}" data-textcolor="${p.textColor}" data-bgcolor="${p.bgColor}"
                   style="background:${p.color};border-color:${p.textColor}"
                   title="${p.name}"></div>
            `).join('')}
          </div>
        </div>
        <div class="dm-edit-row">
          <label class="dm-edit-label">预览</label>
          <div class="dm-preview" id="editCatPreview"
               style="background:${cat.bgColor};color:${cat.textColor};border-left:4px solid ${cat.textColor}">
            <span>${this._esc(cat.icon || '📁')}</span>
            <span>${this._esc(cat.name)}</span>
          </div>
        </div>
        <div class="dm-edit-buttons">
          <button class="btn btn-sm btn-secondary" data-action="cancelEdit">取消</button>
          <button class="btn btn-sm btn-primary" data-action="saveCategory" data-id="${this._esc(cat.id)}">保存</button>
        </div>
      </div>
    `;
  }

  _renderNewCategoryCard() {
    const def = getDefaultStyle();
    return `
      <div class="dm-item dm-item-editing" data-new="category">
        <div class="dm-edit-row">
          <label class="dm-edit-label">分类名称</label>
          <input class="dm-input" id="newCatName" placeholder="输入分类名称" autofocus />
        </div>
        <div class="dm-edit-row">
          <label class="dm-edit-label">图标</label>
          <div class="dm-emoji-grid" id="newCatEmojiGrid">
            ${EMOJI_LIST.map(em => `
              <div class="dm-emoji-item ${em === def.icon ? 'dm-emoji-item-selected' : ''}" data-emoji="${em}">${em}</div>
            `).join('')}
          </div>
        </div>
        <div class="dm-edit-row">
          <label class="dm-edit-label">颜色</label>
          <div class="dm-palette" id="newCatPalette">
            ${COLOR_PALETTE.map(p => `
              <div class="dm-color-swatch ${p.name === '灰' ? 'dm-color-swatch-selected' : ''}"
                   data-color="${p.color}" data-textcolor="${p.textColor}" data-bgcolor="${p.bgColor}"
                   style="background:${p.color};border-color:${p.textColor}"
                   title="${p.name}"></div>
            `).join('')}
          </div>
        </div>
        <div class="dm-edit-buttons">
          <button class="btn btn-sm btn-secondary" data-action="cancelAdd">取消</button>
          <button class="btn btn-sm btn-primary" data-action="confirmAddCategory">添加</button>
        </div>
      </div>
    `;
  }

  _renderDiseases() {
    const list = document.getElementById('dmDiseaseList');
    if (!list) return;
    const cat = this._getSelectedCategory();
    if (!cat) {
      list.innerHTML = '<div class="dm-empty">请先选择左侧分类</div>';
      return;
    }

    const diseases = cat.diseases;
    if (diseases.length === 0 && !this._state.newDisease) {
      list.innerHTML = '<div class="dm-empty">该分类下暂无疾病，点击右上角添加</div>';
      return;
    }

    list.innerHTML = diseases.map((d) => {
      const isEditing = this._state.editingDisease === d.id;
      if (isEditing) {
        return this._renderDiseaseEditCard(cat, d);
      }
      return `
        <div class="dm-item" data-action="selectDisease" data-id="${this._esc(d.id)}">
          <span class="dm-item-label">${this._esc(d.name)}</span>
          <div class="dm-item-actions">
            <button class="btn-icon" data-action="moveDiseaseUp" data-id="${this._esc(d.id)}" title="上移">▲</button>
            <button class="btn-icon" data-action="moveDiseaseDown" data-id="${this._esc(d.id)}" title="下移">▼</button>
            <button class="btn-icon" data-action="editDisease" data-id="${this._esc(d.id)}" title="编辑">✏️</button>
            <button class="btn-icon" data-action="deleteDisease" data-id="${this._esc(d.id)}" title="删除">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    if (this._state.newDisease) {
      list.innerHTML += `
        <div class="dm-item dm-item-editing" data-new="disease">
          <div class="dm-edit-row">
            <label class="dm-edit-label">疾病名称</label>
            <input class="dm-input" id="newDiseaseName" placeholder="输入疾病名称" autofocus />
          </div>
          <div class="dm-edit-buttons">
            <button class="btn btn-sm btn-secondary" data-action="cancelAdd">取消</button>
            <button class="btn btn-sm btn-primary" data-action="confirmAddDisease">添加</button>
          </div>
        </div>
      `;
    }
  }

  _renderDiseaseEditCard(cat, d) {
    return `
      <div class="dm-item dm-item-editing" data-edit-id="${this._esc(d.id)}">
        <div class="dm-edit-row">
          <label class="dm-edit-label">疾病名称（重命名会同步更新历史记录）</label>
          <input class="dm-input" id="editDiseaseName" value="${this._esc(d.name)}" placeholder="疾病名称" />
        </div>
        <div class="dm-edit-buttons">
          <button class="btn btn-sm btn-secondary" data-action="cancelEdit">取消</button>
          <button class="btn btn-sm btn-primary" data-action="saveDisease" data-id="${this._esc(d.id)}">保存</button>
        </div>
      </div>
    `;
  }

  // ─── Events ───

  _bindEvents() {
    this.container.addEventListener('click', (e) => {
      // Emoji selection in edit/new category card
      const emojiItem = e.target.closest('.dm-emoji-item');
      if (emojiItem) {
        this._handleEmojiSelect(emojiItem);
        return;
      }
      // Color swatch selection
      const swatch = e.target.closest('.dm-color-swatch');
      if (swatch) {
        this._handleColorSelect(swatch);
        return;
      }
      // Action buttons
      const btn = e.target.closest('[data-action]');
      if (btn) {
        this._handleAction(btn.dataset.action, btn.dataset.id);
        return;
      }
      // Top-level buttons
      if (e.target.id === 'dmExportBtn') {
        diseaseApi.exportDiseases().catch(err => this._toast('error', err.message));
      }
      if (e.target.id === 'dmImportBtn') {
        document.getElementById('dmFileInput').click();
      }
      if (e.target.id === 'dmResetBtn') {
        if (confirm('确定恢复默认目录？所有自定义配置将丢失。')) {
          diseaseApi.resetDiseases().then(async () => {
            await this._loadData();
            this._state.selectedCategoryId = this._state.categories[0]?.id || null;
            this._renderAll();
            this._toast('success', '已恢复默认目录');
          }).catch(err => this._toast('error', err.message));
        }
      }
      if (e.target.id === 'dmAddCategoryBtn') {
        this._handleAction('addCategory');
      }
      if (e.target.id === 'dmAddDiseaseBtn') {
        this._handleAction('addDisease');
      }
    });

    const fileInput = document.getElementById('dmFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          await diseaseApi.importDiseases(file);
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

  _handleEmojiSelect(item) {
    const grid = item.parentElement;
    grid.querySelectorAll('.dm-emoji-item').forEach(el => el.classList.remove('dm-emoji-item-selected'));
    item.classList.add('dm-emoji-item-selected');
    this._updatePreview();
  }

  _handleColorSelect(swatch) {
    const palette = swatch.parentElement;
    palette.querySelectorAll('.dm-color-swatch').forEach(el => el.classList.remove('dm-color-swatch-selected'));
    swatch.classList.add('dm-color-swatch-selected');
    this._updatePreview();
  }

  _updatePreview() {
    const preview = document.getElementById('editCatPreview');
    if (!preview) return;
    const selectedEmoji = document.querySelector('#editCatEmojiGrid .dm-emoji-item-selected');
    const selectedSwatch = document.querySelector('#editCatPalette .dm-color-swatch-selected');
    const name = document.getElementById('editCatName')?.value || '';
    if (selectedEmoji && selectedSwatch) {
      const icon = selectedEmoji.dataset.emoji;
      const textColor = selectedSwatch.dataset.textcolor;
      const bgColor = selectedSwatch.dataset.bgcolor;
      preview.style.background = bgColor;
      preview.style.color = textColor;
      preview.style.borderLeft = `4px solid ${textColor}`;
      preview.innerHTML = `<span>${icon}</span><span>${this._esc(name)}</span>`;
    }
  }

  async _handleAction(action, id) {
    switch (action) {
      // ─── Category selection ───
      case 'selectCategory':
        this._state.selectedCategoryId = id;
        this._state.editingCategory = null;
        this._state.editingDisease = null;
        this._state.newDisease = false;
        this._renderAll();
        break;

      // ─── Category edit ───
      case 'editCategory':
        this._state.editingCategory = id;
        this._state.editingDisease = null;
        this._renderAll();
        break;

      case 'saveCategory': {
        const cat = this._state.categories.find(c => c.id === id);
        if (!cat) break;
        const name = document.getElementById('editCatName')?.value.trim();
        if (!name) { this._toast('error', '分类名称不能为空'); break; }
        const selectedEmoji = document.querySelector('#editCatEmojiGrid .dm-emoji-item-selected');
        const selectedSwatch = document.querySelector('#editCatPalette .dm-color-swatch-selected');
        try {
          await diseaseApi.updateCategory(id, {
            name,
            icon: selectedEmoji?.dataset.emoji || cat.icon,
            color: selectedSwatch?.dataset.color || cat.color,
            textColor: selectedSwatch?.dataset.textcolor || cat.textColor,
            bgColor: selectedSwatch?.dataset.bgcolor || cat.bgColor,
          });
          await this._loadData();
          this._state.editingCategory = null;
          this._renderAll();
          this._toast('success', '分类已保存');
        } catch (err) {
          this._toast('error', err.message);
        }
        break;
      }

      case 'deleteCategory': {
        const cat = this._state.categories.find(c => c.id === id);
        if (!cat) break;
        const msg = `确定删除分类「${cat.name}」及其下所有疾病？\n该分类下疾病的历史病历记录仍会保留。`;
        if (!confirm(msg)) break;
        try {
          await diseaseApi.deleteCategory(id);
          if (this._state.selectedCategoryId === id) {
            this._state.selectedCategoryId = null;
          }
          await this._loadData();
          if (!this._state.selectedCategoryId && this._state.categories.length > 0) {
            this._state.selectedCategoryId = this._state.categories[0].id;
          }
          this._renderAll();
          this._toast('success', '分类已删除');
        } catch (err) {
          this._toast('error', err.message);
        }
        break;
      }

      case 'moveCategoryUp': {
        const idx = this._state.categories.findIndex(c => c.id === id);
        if (idx <= 0) break;
        // Swap sortOrder and reorder array
        const cats = this._state.categories;
        [cats[idx - 1], cats[idx]] = [cats[idx], cats[idx - 1]];
        cats.forEach((c, i) => c.sortOrder = i);
        try {
          await diseaseApi.saveDiseases(cats);
          this._renderCategories();
        } catch (err) {
          this._toast('error', err.message);
          await this._loadData();
          this._renderCategories();
        }
        break;
      }

      case 'moveCategoryDown': {
        const idx = this._state.categories.findIndex(c => c.id === id);
        const cats = this._state.categories;
        if (idx >= cats.length - 1) break;
        [cats[idx], cats[idx + 1]] = [cats[idx + 1], cats[idx]];
        cats.forEach((c, i) => c.sortOrder = i);
        try {
          await diseaseApi.saveDiseases(cats);
          this._renderCategories();
        } catch (err) {
          this._toast('error', err.message);
          await this._loadData();
          this._renderCategories();
        }
        break;
      }

      // ─── Add category ───
      case 'addCategory':
        this._state.newCategory = true;
        this._renderCategories();
        setTimeout(() => document.getElementById('newCatName')?.focus(), 50);
        break;

      case 'confirmAddCategory': {
        const name = document.getElementById('newCatName')?.value.trim();
        if (!name) { this._toast('error', '分类名称不能为空'); break; }
        const selectedEmoji = document.querySelector('#newCatEmojiGrid .dm-emoji-item-selected');
        const selectedSwatch = document.querySelector('#newCatPalette .dm-color-swatch-selected');
        const newId = crypto.randomUUID();
        try {
          await diseaseApi.addCategory({
            id: newId,
            name,
            icon: selectedEmoji?.dataset.emoji || getDefaultStyle().icon,
            color: selectedSwatch?.dataset.color || getDefaultStyle().color,
            textColor: selectedSwatch?.dataset.textcolor || getDefaultStyle().textColor,
            bgColor: selectedSwatch?.dataset.bgcolor || getDefaultStyle().bgColor,
          });
          this._state.newCategory = false;
          this._state.selectedCategoryId = newId;
          await this._loadData();
          this._renderAll();
          this._toast('success', '分类已添加');
        } catch (err) {
          this._toast('error', err.message);
        }
        break;
      }

      // ─── Disease edit ───
      case 'editDisease':
        this._state.editingDisease = id;
        this._renderDiseases();
        setTimeout(() => document.getElementById('editDiseaseName')?.focus(), 50);
        break;

      case 'saveDisease': {
        const cat = this._getSelectedCategory();
        if (!cat) break;
        const d = cat.diseases.find(d => d.id === id);
        if (!d) break;
        const name = document.getElementById('editDiseaseName')?.value.trim();
        if (!name) { this._toast('error', '疾病名称不能为空'); break; }
        try {
          await diseaseApi.updateDisease(cat.id, id, { name });
          await this._loadData();
          this._state.editingDisease = null;
          this._renderAll();
          this._toast('success', '疾病已保存（历史记录已同步更新）');
        } catch (err) {
          this._toast('error', err.message);
        }
        break;
      }

      case 'deleteDisease': {
        const cat = this._getSelectedCategory();
        if (!cat) break;
        const d = cat.diseases.find(d => d.id === id);
        if (!d) break;
        let msg = `确定删除疾病「${d.name}」？`;
        try {
          const { count } = await diseaseApi.getDiseaseRecordCount(d.name);
          if (count > 0) {
            msg = `「${d.name}」有 ${count} 条历史记录，删除后记录仍保留但侧边栏不再显示。确认删除？`;
          }
        } catch { /* ignore count failure */ }
        if (!confirm(msg)) break;
        try {
          await diseaseApi.deleteDisease(cat.id, id);
          await this._loadData();
          this._renderDiseases();
          this._renderCategories(); // update count
          this._toast('success', '疾病已删除');
        } catch (err) {
          this._toast('error', err.message);
        }
        break;
      }

      case 'moveDiseaseUp': {
        const cat = this._getSelectedCategory();
        if (!cat) break;
        const idx = cat.diseases.findIndex(d => d.id === id);
        if (idx <= 0) break;
        [cat.diseases[idx - 1], cat.diseases[idx]] = [cat.diseases[idx], cat.diseases[idx - 1]];
        cat.diseases.forEach((d, i) => d.sortOrder = i);
        try {
          await diseaseApi.saveDiseases(this._state.categories);
          this._renderDiseases();
        } catch (err) {
          this._toast('error', err.message);
          await this._loadData();
          this._renderDiseases();
        }
        break;
      }

      case 'moveDiseaseDown': {
        const cat = this._getSelectedCategory();
        if (!cat) break;
        const idx = cat.diseases.findIndex(d => d.id === id);
        if (idx >= cat.diseases.length - 1) break;
        [cat.diseases[idx], cat.diseases[idx + 1]] = [cat.diseases[idx + 1], cat.diseases[idx]];
        cat.diseases.forEach((d, i) => d.sortOrder = i);
        try {
          await diseaseApi.saveDiseases(this._state.categories);
          this._renderDiseases();
        } catch (err) {
          this._toast('error', err.message);
          await this._loadData();
          this._renderDiseases();
        }
        break;
      }

      // ─── Add disease ───
      case 'addDisease':
        if (!this._state.selectedCategoryId) { this._toast('info', '请先选择分类'); break; }
        this._state.newDisease = true;
        this._renderDiseases();
        setTimeout(() => document.getElementById('newDiseaseName')?.focus(), 50);
        break;

      case 'confirmAddDisease': {
        const cat = this._getSelectedCategory();
        if (!cat) break;
        const name = document.getElementById('newDiseaseName')?.value.trim();
        if (!name) { this._toast('error', '疾病名称不能为空'); break; }
        const newId = crypto.randomUUID();
        try {
          await diseaseApi.addDisease(cat.id, { diseaseId: newId, name });
          this._state.newDisease = false;
          await this._loadData();
          this._renderAll();
          this._toast('success', '疾病已添加');
        } catch (err) {
          this._toast('error', err.message);
        }
        break;
      }

      // ─── Cancel ───
      case 'cancelEdit':
        this._state.editingCategory = null;
        this._state.editingDisease = null;
        this._renderAll();
        break;

      case 'cancelAdd':
        this._state.newCategory = false;
        this._state.newDisease = false;
        this._renderAll();
        break;
    }
  }

  // ─── Utils ───

  _getSelectedCategory() {
    return this._state.categories.find(c => c.id === this._state.selectedCategoryId) || null;
  }

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
