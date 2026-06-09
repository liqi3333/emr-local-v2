/**
 * PatientManager — patient CRUD and selection.
 * Usage: import { PatientManager } from './components/PatientManager.js'
 */
import { store } from '../store.js';
import { db } from '../db.js';

export class PatientManager {
  constructor() {
    this._unsub = [];
    this._patientListState = {
      search: '',
      sortField: 'createdAt',
      sortDir: 'desc',
      filterGender: '',
      filterAgeMin: '',
      filterAgeMax: '',
      page: 1,
      pageSize: 20,
    };
  }

  async render() {
    const patients = await db.getPatients();
    store.setState({ patients });

    if (patients.length > 0 && !store.state.currentPatient) {
      store.setState({ currentPatient: patients[0] });
      this._syncFormToStore();
    }

    this._bindEvents();
  }

  _bindEvents() {
    const nameEl = document.getElementById('patientName');
    const genderEl = document.getElementById('patientGender');
    const ageEl = document.getElementById('patientAge');
    const bedEl = document.getElementById('patientBed');
    const saveBtn = document.getElementById('btnSavePatient');
    const addBtn = document.getElementById('btnAddPatient');
    const allBtn = document.getElementById('btnAllPatients');

    [nameEl, genderEl, ageEl, bedEl].forEach((el) => {
      el?.addEventListener('change', () => this._autoSave());
      el?.addEventListener('blur', () => this._autoSave());
    });

    saveBtn?.addEventListener('click', () => {
      this._saveCurrentPatient();
      store.toast('success', '患者信息已保存');
    });

    addBtn?.addEventListener('click', () => this._showAddPatientModal());
    allBtn?.addEventListener('click', () => this._showAllPatientsModal());
  }

  _syncFormToStore() {
    const p = store.state.currentPatient;
    if (!p) return;
    const g = (id) => document.getElementById(id);
    if (g('patientName')) g('patientName').value = p.name || '';
    if (g('patientGender')) g('patientGender').value = p.gender || '男';
    if (g('patientAge')) g('patientAge').value = p.age || '';
    if (g('patientBed')) g('patientBed').value = p.bedNo || '';
  }

  _getFormData() {
    const g = (id) => document.getElementById(id);
    return {
      name: g('patientName')?.value || '',
      gender: g('patientGender')?.value || '男',
      age: parseInt(g('patientAge')?.value) || 0,
      bedNo: g('patientBed')?.value || '',
    };
  }

  async _autoSave() {
    if (!store.state.currentPatient) return;
    const data = this._getFormData();
    if (!data.name) return;
    try {
      await db.savePatient({ ...store.state.currentPatient, ...data });
    } catch (err) {
      console.warn('Auto-save failed:', err);
    }
  }

  async _saveCurrentPatient() {
    const data = this._getFormData();
    if (!data.name) {
      store.toast('error', '请输入患者姓名');
      return;
    }
    try {
      const patient = store.state.currentPatient;
      if (patient) {
        await db.savePatient({ ...patient, ...data });
        store.setState({ currentPatient: { ...patient, ...data } });
      } else {
        const id = await db.savePatient(data);
        store.setState({ currentPatient: { id, ...data } });
      }
      const patients = await db.getPatients();
      store.setState({ patients });
    } catch (err) {
      store.toast('error', '保存失败: ' + err.message);
    }
  }

  _createModal(title, contentHtml, options = {}) {
    const { width = '420px', onClose } = options;
    const overlay = document.createElement('div');
    overlay.className = 'pm-modal-overlay';
    overlay.innerHTML = `
      <div class="pm-modal" style="max-width: ${width}">
        <div class="pm-modal-header">
          <h3>${title}</h3>
          <button class="pm-modal-close">&times;</button>
        </div>
        <div class="pm-modal-body">${contentHtml}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => {
      overlay.classList.add('pm-modal-closing');
      setTimeout(() => { overlay.remove(); onClose?.(); }, 200);
    };
    overlay.querySelector('.pm-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    return { overlay, close };
  }

  // ──────────────────────────────────────────────
  //  Add Patient Modal
  // ──────────────────────────────────────────────

  _showAddPatientModal() {
    const { overlay, close } = this._createModal('添加新患者', `
      <form id="addPatientForm" class="pm-form">
        <div class="pm-form-group">
          <label>患者姓名 <span class="required">*</span></label>
          <input type="text" id="newName" placeholder="请输入姓名" required autofocus />
        </div>
        <div class="pm-form-row">
          <div class="pm-form-group">
            <label>性别</label>
            <div class="pm-radio-group">
              <label class="pm-radio"><input type="radio" name="newGender" value="男" checked /><span>男</span></label>
              <label class="pm-radio"><input type="radio" name="newGender" value="女" /><span>女</span></label>
            </div>
          </div>
          <div class="pm-form-group">
            <label>年龄</label>
            <input type="number" id="newAge" placeholder="0" min="0" max="150" />
          </div>
        </div>
        <div class="pm-form-group">
          <label>床号</label>
          <input type="text" id="newBed" placeholder="请输入床号" />
        </div>
        <div class="pm-form-actions">
          <button type="button" class="pm-btn pm-btn-secondary" id="cancelAdd">取消</button>
          <button type="submit" class="pm-btn pm-btn-primary">确认添加</button>
        </div>
      </form>
    `, { width: '380px' });

    const form = overlay.querySelector('#addPatientForm');
    const nameInput = overlay.querySelector('#newName');
    setTimeout(() => nameInput.focus(), 100);

    overlay.querySelector('#cancelAdd').addEventListener('click', close);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('pm-input-error'); return; }
      const patientData = {
        name,
        gender: overlay.querySelector('input[name="newGender"]:checked').value,
        age: parseInt(overlay.querySelector('#newAge').value) || 0,
        bedNo: overlay.querySelector('#newBed').value,
      };
      try {
        const id = await db.savePatient(patientData);
        const newPatient = { id, ...patientData };
        const patients = await db.getPatients();
        store.setState({ patients, currentPatient: newPatient });
        this._syncFormToStore();
        close();
        store.toast('success', `已添加患者「${name}」`);
      } catch (err) {
        store.toast('error', '添加失败: ' + err.message);
      }
    });
  }

  // ──────────────────────────────────────────────
  //  All Patients Modal (Excel-like table)
  // ──────────────────────────────────────────────

  async _showAllPatientsModal() {
    const patients = await db.getPatients();
    this._patientListState.page = 1;

    const { overlay, close } = this._createModal('', `
      <div class="pm-excel">
        <div class="pm-excel-toolbar">
          <div class="pm-excel-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" id="excelSearch" placeholder="搜索姓名、床号..." />
          </div>
          <div class="pm-excel-filters">
            <select id="excelFilterGender">
              <option value="">全部性别</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
            <input type="number" id="excelFilterAgeMin" placeholder="最小年龄" min="0" max="150" style="width:80px" />
            <span class="pm-excel-filter-sep">-</span>
            <input type="number" id="excelFilterAgeMax" placeholder="最大年龄" min="0" max="150" style="width:80px" />
          </div>
          <div class="pm-excel-info">
            <span id="excelCount">0</span> 条记录
          </div>
        </div>
        <div class="pm-excel-table-wrap">
          <table class="pm-excel-table">
            <thead>
              <tr>
                <th class="sortable" data-field="name">姓名 <span class="sort-icon" id="sort-name"></span></th>
                <th class="sortable" data-field="gender">性别 <span class="sort-icon" id="sort-gender"></span></th>
                <th class="sortable" data-field="age">年龄 <span class="sort-icon" id="sort-age"></span></th>
                <th class="sortable" data-field="bedNo">床号 <span class="sort-icon" id="sort-bedNo"></span></th>
                <th class="sortable" data-field="createdAt">创建时间 <span class="sort-icon" id="sort-createdAt"></span></th>
                <th class="th-actions">操作</th>
              </tr>
            </thead>
            <tbody id="excelBody"></tbody>
          </table>
        </div>
        <div class="pm-excel-pagination">
          <button id="excelPrev" class="pm-excel-page-btn">&laquo; 上一页</button>
          <span id="excelPageInfo">第 1 页</span>
          <button id="excelNext" class="pm-excel-page-btn">下一页 &raquo;</button>
          <select id="excelPageSize">
            <option value="10">10条/页</option>
            <option value="20" selected>20条/页</option>
            <option value="50">50条/页</option>
            <option value="100">100条/页</option>
          </select>
        </div>
      </div>
    `, { width: '800px' });

    const state = this._patientListState;

    const getFiltered = () => {
      let list = [...patients];
      // Search
      if (state.search) {
        const q = state.search.toLowerCase();
        list = list.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.bedNo && p.bedNo.toLowerCase().includes(q))
        );
      }
      // Gender filter
      if (state.filterGender) {
        list = list.filter(p => p.gender === state.filterGender);
      }
      // Age filter
      if (state.filterAgeMin !== '') {
        list = list.filter(p => (p.age || 0) >= parseInt(state.filterAgeMin));
      }
      if (state.filterAgeMax !== '') {
        list = list.filter(p => (p.age || 0) <= parseInt(state.filterAgeMax));
      }
      // Sort
      list.sort((a, b) => {
        let va = a[state.sortField] ?? '';
        let vb = b[state.sortField] ?? '';
        if (state.sortField === 'age') {
          va = parseInt(va) || 0;
          vb = parseInt(vb) || 0;
        }
        if (state.sortField === 'createdAt') {
          va = new Date(va).getTime();
          vb = new Date(vb).getTime();
        }
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
        if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      return list;
    };

    const renderTable = () => {
      const filtered = getFiltered();
      const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
      if (state.page > totalPages) state.page = totalPages;
      const start = (state.page - 1) * state.pageSize;
      const pageData = filtered.slice(start, start + state.pageSize);

      const tbody = overlay.querySelector('#excelBody');
      const currentId = store.state.currentPatient?.id;

      tbody.innerHTML = pageData.map(p => `
        <tr class="${p.id === currentId ? 'row-active' : ''}" data-id="${p.id}">
          <td class="td-name">${this._escHtml(p.name)}</td>
          <td>${this._escHtml(p.gender)}</td>
          <td>${p.age || 0}</td>
          <td>${this._escHtml(p.bedNo || '-')}</td>
          <td>${new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
          <td class="td-actions">
            <button class="pm-excel-btn pm-excel-btn-select" data-id="${p.id}" title="选择">✓</button>
            <button class="pm-excel-btn pm-excel-btn-delete" data-id="${p.id}" data-name="${this._escHtml(p.name)}" title="删除">✕</button>
          </td>
        </tr>
      `).join('');

      if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="td-empty">暂无匹配的患者数据</td></tr>`;
      }

      // Count
      overlay.querySelector('#excelCount').textContent = filtered.length;

      // Pagination
      overlay.querySelector('#excelPageInfo').textContent = `第 ${state.page} / ${totalPages} 页`;
      overlay.querySelector('#excelPrev').disabled = state.page <= 1;
      overlay.querySelector('#excelNext').disabled = state.page >= totalPages;

      // Sort icons
      ['name', 'gender', 'age', 'bedNo', 'createdAt'].forEach(f => {
        const icon = overlay.querySelector(`#sort-${f}`);
        if (!icon) return;
        if (state.sortField === f) {
          icon.textContent = state.sortDir === 'asc' ? ' ▲' : ' ▼';
        } else {
          icon.textContent = '';
        }
      });

      // Row click
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.pm-excel-btn')) return;
          selectPatient(row.dataset.id);
        });
      });

      // Select buttons
      tbody.querySelectorAll('.pm-excel-btn-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectPatient(btn.dataset.id);
        });
      });

      // Delete buttons
      tbody.querySelectorAll('.pm-excel-btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deletePatient(btn.dataset.id, btn.dataset.name);
        });
      });
    };

    const selectPatient = async (id) => {
      const patient = patients.find(p => p.id === id);
      if (patient) {
        store.setState({ currentPatient: patient, emrData: null });
        this._syncFormToStore();
        close();
        store.toast('success', `已选择「${patient.name}」`);
      }
    };

    const deletePatient = async (id, name) => {
      const confirmOverlay = document.createElement('div');
      confirmOverlay.className = 'pm-modal-overlay';
      confirmOverlay.innerHTML = `
        <div class="pm-modal pm-confirm-modal">
          <div class="pm-confirm-icon">⚠️</div>
          <div class="pm-confirm-title">确认删除</div>
          <div class="pm-confirm-text">确定要删除患者「${name}」吗？<br/>该操作将同时删除所有相关病历记录，且无法恢复。</div>
          <div class="pm-confirm-actions">
            <button class="pm-btn pm-btn-secondary" id="confirmCancel">取消</button>
            <button class="pm-btn pm-btn-danger" id="confirmDelete">删除</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmOverlay);

      return new Promise((resolve) => {
        confirmOverlay.querySelector('#confirmCancel').addEventListener('click', () => {
          confirmOverlay.remove();
          resolve(false);
        });
        confirmOverlay.querySelector('#confirmDelete').addEventListener('click', async () => {
          try {
            await db.deletePatient(id);
            if (store.state.currentPatient?.id === id) {
              const remaining = patients.filter(p => p.id !== id);
              store.setState({ currentPatient: remaining[0] || null });
              this._syncFormToStore();
            }
            const updatedPatients = await db.getPatients();
            store.setState({ patients: updatedPatients });
            // Update local list
            const idx = patients.findIndex(p => p.id === id);
            if (idx !== -1) patients.splice(idx, 1);
            renderTable();
            confirmOverlay.remove();
            store.toast('success', `已删除「${name}」`);
            resolve(true);
          } catch (err) {
            store.toast('error', '删除失败: ' + err.message);
            confirmOverlay.remove();
            resolve(false);
          }
        });
      });
    };

    // Search
    overlay.querySelector('#excelSearch').addEventListener('input', (e) => {
      state.search = e.target.value;
      state.page = 1;
      renderTable();
    });

    // Gender filter
    overlay.querySelector('#excelFilterGender').addEventListener('change', (e) => {
      state.filterGender = e.target.value;
      state.page = 1;
      renderTable();
    });

    // Age filter
    overlay.querySelector('#excelFilterAgeMin').addEventListener('input', (e) => {
      state.filterAgeMin = e.target.value;
      state.page = 1;
      renderTable();
    });
    overlay.querySelector('#excelFilterAgeMax').addEventListener('input', (e) => {
      state.filterAgeMax = e.target.value;
      state.page = 1;
      renderTable();
    });

    // Sort headers
    overlay.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.field;
        if (state.sortField === field) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortField = field;
          state.sortDir = 'asc';
        }
        renderTable();
      });
    });

    // Pagination
    overlay.querySelector('#excelPrev').addEventListener('click', () => {
      if (state.page > 1) { state.page--; renderTable(); }
    });
    overlay.querySelector('#excelNext').addEventListener('click', () => {
      state.page++;
      renderTable();
    });
    overlay.querySelector('#excelPageSize').addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value);
      state.page = 1;
      renderTable();
    });

    renderTable();
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  async _showHistoryModal() {
    const patient = store.state.currentPatient;
    if (!patient) {
      store.toast('info', '请先选择患者');
      return;
    }
    try {
      const records = await db.getRecords(patient.id);
      const { overlay, close } = this._createModal(`${patient.name} - 病历记录`, `
        <div class="pm-history-list">
          ${records.length === 0 ? `
            <div class="pm-empty-state">
              <div class="pm-empty-icon">📋</div>
              <div class="pm-empty-text">暂无病历记录</div>
              <div class="pm-empty-hint">选择疾病后生成病历</div>
            </div>
          ` : records.map(r => `
            <div class="pm-history-card" data-id="${r.id}">
              <div class="pm-history-header">
                <span class="pm-history-disease">${r.disease}</span>
                <span class="pm-history-date">${new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <div class="pm-history-chief">${r.chief || '无主诉'}</div>
              <div class="pm-history-actions">
                <button class="pm-btn pm-btn-sm pm-btn-load" data-id="${r.id}">加载</button>
                <button class="pm-btn pm-btn-sm pm-btn-delete-record" data-id="${r.id}">删除</button>
              </div>
            </div>
          `).join('')}
        </div>
      `, { width: '520px' });

      if (records.length === 0) return;

      overlay.querySelectorAll('.pm-btn-load').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const recordId = btn.dataset.id;
          const record = await db.getRecordById(recordId);
          if (record) {
            store.setState({ emrData: record });
            close();
            store.toast('success', '已加载病历');
          }
        });
      });

      overlay.querySelectorAll('.pm-btn-delete-record').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const recordId = btn.dataset.id;
          const confirmOverlay = document.createElement('div');
          confirmOverlay.className = 'pm-modal-overlay';
          confirmOverlay.innerHTML = `
            <div class="pm-modal pm-confirm-modal">
              <div class="pm-confirm-icon">⚠️</div>
              <div class="pm-confirm-title">确认删除</div>
              <div class="pm-confirm-text">确定要删除此病历记录吗？<br/>此操作无法恢复。</div>
              <div class="pm-confirm-actions">
                <button class="pm-btn pm-btn-secondary" id="confirmCancel">取消</button>
                <button class="pm-btn pm-btn-danger" id="confirmDelete">删除</button>
              </div>
            </div>
          `;
          document.body.appendChild(confirmOverlay);
          confirmOverlay.querySelector('#confirmCancel').addEventListener('click', () => confirmOverlay.remove());
          confirmOverlay.querySelector('#confirmDelete').addEventListener('click', async () => {
            try {
              await db.deleteRecord(recordId);
              confirmOverlay.remove();
              close();
              this._showHistoryModal();
              store.toast('success', '已删除病历');
            } catch (err) {
              store.toast('error', '删除失败: ' + err.message);
              confirmOverlay.remove();
            }
          });
        });
      });

      overlay.querySelectorAll('.pm-history-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.pm-btn')) return;
          const recordId = card.dataset.id;
          const record = records.find(r => r.id === recordId);
          if (record) {
            store.setState({ emrData: record });
            close();
            store.toast('success', '已加载病历');
          }
        });
      });

    } catch (err) {
      store.toast('error', '加载病历历史失败: ' + err.message);
    }
  }

  showHistory() {
    this._showHistoryModal();
  }

  destroy() {
    this._unsub.forEach((fn) => fn());
    this._unsub = [];
  }
}
