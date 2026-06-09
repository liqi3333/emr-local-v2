/**
 * EmrPreview — bottom-right panel with two tabs:
 *   1. 首次病程录 (First Course Record)
 *   2. 主治医师首次查房病程录 (Attending Physician First Round Progress Note)
 *
 * Usage:
 *   import { EmrPreview } from './components/EmrPreview.js';
 *   const preview = new EmrPreview(document.getElementById('emrPreview'));
 *   await preview.render();
 */
import { store } from '../store.js';
import { db } from '../db.js';
import * as api from '../services/api.js';

/** Display labels for 首次病程录 fields */
const FIRST_COURSE_LABELS = {
  chief: '主诉',
  hpi: '现病史',
  past: '既往史',
  exam: '体格检查',
  lab: '辅助检查',
  diag: '初步诊断',
  diff: '鉴别诊断',
  plan: '治疗计划',
};
const FIRST_COURSE_KEYS = ['chief', 'hpi', 'past', 'exam', 'lab', 'diag', 'diff', 'plan'];

/** Display labels for 主治医师首次查房病程录 fields */
const ATTENDING_LABELS = {
  summary: '病情摘要',
  diagnosis: '诊断',
  analysis: '病情分析',
  treatment: '诊疗计划',
  signed: '医师签名',
};
const ATTENDING_KEYS = ['summary', 'diagnosis', 'analysis', 'treatment', 'signed'];

/** Display labels for 主任医师首次查房病程录 fields */
const CHIEF_LABELS = {
  chiefSummary: '病情摘要',
  chiefDiagnosis: '诊断',
  chiefAnalysis: '病情分析',
  chiefTreatment: '诊疗计划',
  chiefSigned: '医师签名',
};
const CHIEF_KEYS = ['chiefSummary', 'chiefDiagnosis', 'chiefAnalysis', 'chiefTreatment', 'chiefSigned'];

/** Display labels for 术前小结 fields */
const PREOP_LABELS = {
  preopDiagnosis: '术前诊断',
  preopIndication: '手术指征',
  preopPlan: '手术方案',
  preopPreparation: '术前准备',
  preopRisk: '风险评估',
  preopSigned: '医师签名',
};
const PREOP_KEYS = ['preopDiagnosis', 'preopIndication', 'preopPlan', 'preopPreparation', 'preopRisk', 'preopSigned'];

export class EmrPreview {
  constructor(containerEl) {
    this.el = containerEl;
    this._unsub = [];
    this._activeTab = 'firstCourse'; // 'firstCourse' | 'attendingRound' | 'chiefRound' | 'preop'
  }

  render() {
    this._bindTabs();
    this._subscribe();
    this._renderActiveTab();
  }

  _bindTabs() {
    const tabs = document.querySelectorAll('.pane-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === this._activeTab) return;

        // Update tab active state
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        this._activeTab = target;
        this._renderActiveTab();
      });
    });
  }

  _subscribe() {
    this._unsub.push(
      store.subscribe('emrData', () => {
        if (this._activeTab === 'firstCourse') this._renderActiveTab();
      })
    );
    this._unsub.push(
      store.subscribe('attendingData', () => {
        if (this._activeTab === 'attendingRound') this._renderActiveTab();
      })
    );
    this._unsub.push(
      store.subscribe('chiefData', () => {
        if (this._activeTab === 'chiefRound') this._renderActiveTab();
      })
    );
    this._unsub.push(
      store.subscribe('preopData', () => {
        if (this._activeTab === 'preop') this._renderActiveTab();
      })
    );
    this._unsub.push(
      store.subscribe('currentDisease', () => this._renderActiveTab())
    );
    this._unsub.push(
      store.subscribe('loading', () => this._renderActiveTab())
    );
  }

  _renderActiveTab() {
    const emrPreview = document.getElementById('emrPreview');
    const attendingPreview = document.getElementById('attendingPreview');
    const chiefPreview = document.getElementById('chiefPreview');
    const preopPreview = document.getElementById('preopPreview');

    if (this._activeTab === 'firstCourse') {
      emrPreview.style.display = '';
      attendingPreview.style.display = 'none';
      chiefPreview.style.display = 'none';
      preopPreview.style.display = 'none';
      this._renderFirstCourse(emrPreview);
    } else if (this._activeTab === 'attendingRound') {
      emrPreview.style.display = 'none';
      attendingPreview.style.display = '';
      chiefPreview.style.display = 'none';
      preopPreview.style.display = 'none';
      this._renderAttendingRound(attendingPreview);
    } else if (this._activeTab === 'chiefRound') {
      emrPreview.style.display = 'none';
      attendingPreview.style.display = 'none';
      chiefPreview.style.display = '';
      preopPreview.style.display = 'none';
      this._renderChiefRound(chiefPreview);
    } else {
      emrPreview.style.display = 'none';
      attendingPreview.style.display = 'none';
      chiefPreview.style.display = 'none';
      preopPreview.style.display = '';
      this._renderPreop(preopPreview);
    }
  }

  // ──────────────────────────────────────────────
  //  首次病程录
  // ──────────────────────────────────────────────

  _renderFirstCourse(container) {
    const emrData = store.state.emrData;
    const loading = store.state.loading;

    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'emr-toolbar';
    toolbar.innerHTML = `
      <button class="btn-primary" data-action="regenerate">🔄 重新生成</button>
      <button data-action="save">💾 保存记录</button>
      <button data-action="history">📋 查看历史</button>
      <button data-action="export">📄 导出 PDF</button>
    `;
    container.appendChild(toolbar);

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'regenerate') this._regenerate();
      else if (action === 'save') this._saveRecord();
      else if (action === 'history') this._showHistory();
      else if (action === 'export') window.print();
    });

    // Loading
    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    // Placeholder
    if (!emrData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
        <div style="font-size:12px;color:var(--text-muted)">AI 将一次性生成完整结构化病历</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    // Content
    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of FIRST_COURSE_KEYS) {
      const label = FIRST_COURSE_LABELS[key] || key;
      const value = emrData[key] || '';

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.emrData;
        if (current && current[key] !== newValue) {
          store.setState({ emrData: { ...current, [key]: newValue } });
        }
      });
      valueDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          valueDiv.blur();
        }
      });

      section.appendChild(valueDiv);
      content.appendChild(section);
    }

    container.appendChild(content);
  }

  // ──────────────────────────────────────────────
  //  主治医师首次查房病程录
  // ──────────────────────────────────────────────

  _renderAttendingRound(container) {
    const attendingData = store.state.attendingData;
    const loading = store.state.loading;

    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'emr-toolbar';
    toolbar.innerHTML = `
      <button data-action="save">💾 保存记录</button>
      <button data-action="history">📋 查看历史</button>
      <button data-action="export">📄 导出 PDF</button>
    `;
    container.appendChild(toolbar);

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'save') this._saveRecord();
      else if (action === 'history') this._showHistory();
      else if (action === 'export') window.print();
    });

    // Loading
    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    // Placeholder
    if (!attendingData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
        <div style="font-size:12px;color:var(--text-muted)">主治医师首次查房病程记录</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    // Content
    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of ATTENDING_KEYS) {
      const label = ATTENDING_LABELS[key] || key;
      const value = attendingData[key] || '';

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.attendingData;
        if (current && current[key] !== newValue) {
          store.setState({ attendingData: { ...current, [key]: newValue } });
        }
      });
      valueDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          valueDiv.blur();
        }
      });

      section.appendChild(valueDiv);
      content.appendChild(section);
    }

    container.appendChild(content);
  }

  // ──────────────────────────────────────────────
  //  主任医师首次查房病程录
  // ──────────────────────────────────────────────

  _renderChiefRound(container) {
    const chiefData = store.state.chiefData;
    const loading = store.state.loading;

    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'emr-toolbar';
    toolbar.innerHTML = `
      <button data-action="save">💾 保存记录</button>
      <button data-action="history">📋 查看历史</button>
    `;
    container.appendChild(toolbar);

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'save') this._saveRecord();
      else if (action === 'history') this._showHistory();
    });

    // Loading
    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    // Placeholder
    if (!chiefData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后点击"加载模板"</div>
        <div style="font-size:12px;color:var(--text-muted)">主任医师首次查房病程记录</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    // Content
    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of CHIEF_KEYS) {
      const label = CHIEF_LABELS[key] || key;
      const value = chiefData[key] || '';

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.chiefData;
        if (current && current[key] !== newValue) {
          store.setState({ chiefData: { ...current, [key]: newValue } });
        }
      });
      valueDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          valueDiv.blur();
        }
      });

      section.appendChild(valueDiv);
      content.appendChild(section);
    }

    container.appendChild(content);
  }

  // ──────────────────────────────────────────────
  //  术前小结
  // ──────────────────────────────────────────────

  _renderPreop(container) {
    const preopData = store.state.preopData;
    const loading = store.state.loading;

    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'emr-toolbar';
    toolbar.innerHTML = `
      <button data-action="save">💾 保存记录</button>
      <button data-action="history">📋 查看历史</button>
    `;
    container.appendChild(toolbar);

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'save') this._saveRecord();
      else if (action === 'history') this._showHistory();
    });

    // Loading
    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    // Placeholder
    if (!preopData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
        <div style="font-size:12px;color:var(--text-muted)">术前小结</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    // Content
    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of PREOP_KEYS) {
      const label = PREOP_LABELS[key] || key;
      const value = preopData[key] || '';

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.preopData;
        if (current && current[key] !== newValue) {
          store.setState({ preopData: { ...current, [key]: newValue } });
        }
      });
      valueDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          valueDiv.blur();
        }
      });

      section.appendChild(valueDiv);
      content.appendChild(section);
    }

    container.appendChild(content);
  }

  // ──────────────────────────────────────────────
  //  Actions
  // ──────────────────────────────────────────────

  async _regenerate() {
    if (!store.state.currentDisease) {
      store.toast('info', '请先选择疾病');
      return;
    }
    store.setState({ loading: true, loadingLabel: '重新生成中...' });
    try {
      const result = await api.generateEMR(
        store.state.currentDisease,
        store.state.currentPatient || {},
      );
      if (result.emr) {
        store.setState({ emrData: result.emr, loading: false, loadingLabel: '', error: null });
        store.toast('success', '病历已更新');
      } else {
        store.setState({ loading: false, loadingLabel: '', error: 'AI 返回空数据，请重试' });
        store.toast('error', '生成失败，请重试');
      }
    } catch (err) {
      store.setState({ loading: false, loadingLabel: '', error: err.message });
      store.toast('error', err.message);
    }
  }

  async _saveRecord() {
    let patient = store.state.currentPatient;
    const disease = store.state.currentDisease;

    if (!disease) {
      store.toast('error', '请先选择疾病');
      return;
    }

    // Auto-create patient if none exists
    if (!patient || !patient.id) {
      const g = (id) => document.getElementById(id);
      patient = {
        name: g('patientName')?.value || '示例患者',
        gender: g('patientGender')?.value || '男',
        age: parseInt(g('patientAge')?.value) || 0,
        bedNo: g('patientBed')?.value || '',
      };
      const id = await db.savePatient(patient);
      patient.id = id;
      store.setState({ currentPatient: patient });
      const patients = await db.getPatients();
      store.setState({ patients });
    }

    try {
      if (this._activeTab === 'firstCourse') {
        const emrData = store.state.emrData;
        if (!emrData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'firstCourse',
          chief: emrData.chief || '',
          hpi: emrData.hpi || '',
          past: emrData.past || '',
          exam: emrData.exam || '',
          lab: emrData.lab || '',
          diag: emrData.diag || '',
          diff: emrData.diff || '',
          plan: emrData.plan || '',
        });
      } else if (this._activeTab === 'attendingRound') {
        const attendingData = store.state.attendingData;
        if (!attendingData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'attendingRound',
          summary: attendingData.summary || '',
          diagnosis: attendingData.diagnosis || '',
          analysis: attendingData.analysis || '',
          treatment: attendingData.treatment || '',
          signed: attendingData.signed || '',
        });
      } else if (this._activeTab === 'chiefRound') {
        const chiefData = store.state.chiefData;
        if (!chiefData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'chiefRound',
          chiefSummary: chiefData.chiefSummary || '',
          chiefDiagnosis: chiefData.chiefDiagnosis || '',
          chiefAnalysis: chiefData.chiefAnalysis || '',
          chiefTreatment: chiefData.chiefTreatment || '',
          chiefSigned: chiefData.chiefSigned || '',
        });
      } else {
        const preopData = store.state.preopData;
        if (!preopData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'preop',
          preopDiagnosis: preopData.preopDiagnosis || '',
          preopIndication: preopData.preopIndication || '',
          preopPlan: preopData.preopPlan || '',
          preopPreparation: preopData.preopPreparation || '',
          preopRisk: preopData.preopRisk || '',
          preopSigned: preopData.preopSigned || '',
        });
      }
      store.toast('success', '病历已保存');
    } catch (err) {
      store.toast('error', '保存失败: ' + err.message);
    }
  }

  async _showHistory() {
    const patient = store.state.currentPatient;
    if (!patient) {
      store.toast('info', '请先选择患者');
      return;
    }

    try {
      const records = await db.getRecords(patient.id);

      const overlay = document.createElement('div');
      overlay.className = 'pm-modal-overlay';
      overlay.innerHTML = `
        <div class="pm-modal" style="max-width: 520px">
          <div class="pm-modal-header">
            <h3>${patient.name} - 病历记录 <span class="pm-count">${records.length}</span></h3>
            <button class="pm-modal-close">&times;</button>
          </div>
          <div class="pm-modal-body">
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
                  <div class="pm-history-chief">
                    <span class="pm-history-type ${r.type === 'attendingRound' ? 'pm-type-attending' : r.type === 'chiefRound' ? 'pm-type-chief' : r.type === 'preop' ? 'pm-type-preop' : 'pm-type-first'}">
                      ${r.type === 'attendingRound' ? '主治查房' : r.type === 'chiefRound' ? '主任查房' : r.type === 'preop' ? '术前小结' : '首次病程'}
                    </span>
                    ${r.chief || (r.diagnosis ? r.diagnosis.substring(0, 20) : r.chiefDiagnosis ? r.chiefDiagnosis.substring(0, 20) : r.preopDiagnosis ? r.preopDiagnosis.substring(0, 20) : '无内容')}
                  </div>
                  <div class="pm-history-actions">
                    <button class="pm-btn pm-btn-sm pm-btn-load" data-id="${r.id}">加载</button>
                    <button class="pm-btn pm-btn-sm pm-btn-delete-record" data-id="${r.id}">删除</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const close = () => {
        overlay.classList.add('pm-modal-closing');
        setTimeout(() => overlay.remove(), 200);
      };

      overlay.querySelector('.pm-modal-close').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      if (records.length === 0) return;

      overlay.querySelectorAll('.pm-btn-load').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const recordId = btn.dataset.id;
          const record = await db.getRecordById(recordId);
          if (record) {
            if (record.type === 'attendingRound') {
              store.setState({
                attendingData: {
                  summary: record.summary || '',
                  diagnosis: record.diagnosis || '',
                  analysis: record.analysis || '',
                  treatment: record.treatment || '',
                  signed: record.signed || '',
                }
              });
            } else if (record.type === 'chiefRound') {
              store.setState({
                chiefData: {
                  chiefSummary: record.chiefSummary || '',
                  chiefDiagnosis: record.chiefDiagnosis || '',
                  chiefAnalysis: record.chiefAnalysis || '',
                  chiefTreatment: record.chiefTreatment || '',
                  chiefSigned: record.chiefSigned || '',
                }
              });
            } else if (record.type === 'preop') {
              store.setState({
                preopData: {
                  preopDiagnosis: record.preopDiagnosis || '',
                  preopIndication: record.preopIndication || '',
                  preopPlan: record.preopPlan || '',
                  preopPreparation: record.preopPreparation || '',
                  preopRisk: record.preopRisk || '',
                  preopSigned: record.preopSigned || '',
                }
              });
            } else {
              store.setState({ emrData: record });
            }
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
              this._showHistory();
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
            if (record.type === 'attendingRound') {
              store.setState({
                attendingData: {
                  summary: record.summary || '',
                  diagnosis: record.diagnosis || '',
                  analysis: record.analysis || '',
                  treatment: record.treatment || '',
                  signed: record.signed || '',
                }
              });
            } else {
              store.setState({ emrData: record });
            }
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
    this._showHistory();
  }

  destroy() {
    this._unsub.forEach((fn) => fn());
    this._unsub = [];
    this.el.innerHTML = '';
  }
}
