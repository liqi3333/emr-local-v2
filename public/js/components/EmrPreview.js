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
  workup: '拟诊讨论',
  diff: '鉴别诊断',
  plan: '治疗计划',
};
const FIRST_COURSE_KEYS = ['chief', 'hpi', 'past', 'exam', 'lab', 'diag', 'workup', 'diff', 'plan'];

/** Ensure a value is a displayable string (convert arrays/objects) */
function _normalizeValue(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        return Object.values(item).join('：');
      }
      return String(item);
    }).join('\n');
  }
  if (typeof v === 'object') {
    return JSON.stringify(v, null, 2);
  }
  return String(v);
}

/** Display labels for 主治医师首次查房病程录 fields */
const ATTENDING_LABELS = {
  supplementHistory: '补充病史',
  summary: '病情摘要',
  diagnosis: '诊断',
  analysis: '病情分析',
  treatment: '诊疗计划',
  signed: '医师签名',
};
const ATTENDING_KEYS = ['supplementHistory', 'summary', 'diagnosis', 'analysis', 'treatment', 'signed'];

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

/** Display labels for 术前讨论 fields */
const DISCUSSION_LABELS = {
  discussionParticipants: '参加人员',
  discussionCaseSummary: '病例摘要',
  discussionDiagnosis: '诊断',
  discussionContent: '讨论内容',
  discussionConclusion: '讨论结论',
  discussionSigned: '记录者签名',
};
const DISCUSSION_KEYS = ['discussionParticipants', 'discussionCaseSummary', 'discussionDiagnosis', 'discussionContent', 'discussionConclusion', 'discussionSigned'];

/** Display labels for 手术记录 fields */
const SURGERY_LABELS = {
  surgeryName: '手术名称',
  surgerySurgeon: '手术者',
  surgeryAssistant: '助手',
  surgeryAnesthesia: '麻醉方式',
  surgeryProcess: '手术经过',
  surgeryFindings: '术中发现',
  surgerySigned: '手术者签名',
};
const SURGERY_KEYS = ['surgeryName', 'surgerySurgeon', 'surgeryAssistant', 'surgeryAnesthesia', 'surgeryProcess', 'surgeryFindings', 'surgerySigned'];

/** Display labels for 出院小结 fields */
const DISCHARGE_LABELS = {
  dischargeAdmissionDate: '入院日期',
  dischargeDate: '出院日期',
  dischargeDiagnosis: '出院诊断',
  dischargeTreatment: '治疗经过',
  dischargeOutcome: '出院情况',
  dischargeAdvice: '出院医嘱',
  dischargeSigned: '主治医师签名',
};
const DISCHARGE_KEYS = ['dischargeAdmissionDate', 'dischargeDate', 'dischargeDiagnosis', 'dischargeTreatment', 'dischargeOutcome', 'dischargeAdvice', 'dischargeSigned'];

export class EmrPreview {
  constructor(containerEl) {
    this.el = containerEl;
    this._unsub = [];
    this._activeTab = 'firstCourse'; // 'firstCourse' | 'attendingRound' | 'chiefRound' | 'preop' | 'discussion' | 'surgery' | 'discharge'
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
        store.setState({ activeTab: target });
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
      store.subscribe('discussionData', () => {
        if (this._activeTab === 'discussion') this._renderActiveTab();
      })
    );
    this._unsub.push(
      store.subscribe('surgeryData', () => {
        if (this._activeTab === 'surgery') this._renderActiveTab();
      })
    );
    this._unsub.push(
      store.subscribe('dischargeData', () => {
        if (this._activeTab === 'discharge') this._renderActiveTab();
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
    const discussionPreview = document.getElementById('discussionPreview');
    const surgeryPreview = document.getElementById('surgeryPreview');
    const dischargePreview = document.getElementById('dischargePreview');

    const allPreviews = [emrPreview, attendingPreview, chiefPreview, preopPreview, discussionPreview, surgeryPreview, dischargePreview];
    allPreviews.forEach(p => p.style.display = 'none');

    if (this._activeTab === 'firstCourse') {
      emrPreview.style.display = '';
      this._renderFirstCourse(emrPreview);
    } else if (this._activeTab === 'attendingRound') {
      attendingPreview.style.display = '';
      this._renderAttendingRound(attendingPreview);
    } else if (this._activeTab === 'chiefRound') {
      chiefPreview.style.display = '';
      this._renderChiefRound(chiefPreview);
    } else if (this._activeTab === 'preop') {
      preopPreview.style.display = '';
      this._renderPreop(preopPreview);
    } else if (this._activeTab === 'discussion') {
      discussionPreview.style.display = '';
      this._renderDiscussion(discussionPreview);
    } else if (this._activeTab === 'surgery') {
      surgeryPreview.style.display = '';
      this._renderSurgery(surgeryPreview);
    } else if (this._activeTab === 'discharge') {
      dischargePreview.style.display = '';
      this._renderDischarge(dischargePreview);
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
      const value = _normalizeValue(emrData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
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
    if (!attendingData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>点击上方按钮生成病历</div>
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
      const value = _normalizeValue(attendingData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
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
    if (!chiefData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
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
      const value = _normalizeValue(chiefData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
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
      const value = _normalizeValue(preopData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
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
  //  术前讨论
  // ──────────────────────────────────────────────

  _renderDiscussion(container) {
    const discussionData = store.state.discussionData;
    const loading = store.state.loading;

    container.innerHTML = '';

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

    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    if (!discussionData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
        <div style="font-size:12px;color:var(--text-muted)">术前讨论记录</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of DISCUSSION_KEYS) {
      const label = DISCUSSION_LABELS[key] || key;
      const value = _normalizeValue(discussionData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.discussionData;
        if (current && current[key] !== newValue) {
          store.setState({ discussionData: { ...current, [key]: newValue } });
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
  //  手术记录
  // ──────────────────────────────────────────────

  _renderSurgery(container) {
    const surgeryData = store.state.surgeryData;
    const loading = store.state.loading;

    container.innerHTML = '';

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

    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    if (!surgeryData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
        <div style="font-size:12px;color:var(--text-muted)">手术记录</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of SURGERY_KEYS) {
      const label = SURGERY_LABELS[key] || key;
      const value = _normalizeValue(surgeryData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.surgeryData;
        if (current && current[key] !== newValue) {
          store.setState({ surgeryData: { ...current, [key]: newValue } });
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
  //  出院小结
  // ──────────────────────────────────────────────

  _renderDischarge(container) {
    const dischargeData = store.state.dischargeData;
    const loading = store.state.loading;

    container.innerHTML = '';

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

    if (loading) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><span style="color:var(--text-secondary)">生成中...</span>`;
      container.appendChild(overlay);
      return;
    }

    if (!dischargeData) {
      const placeholder = document.createElement('div');
      placeholder.className = 'emr-placeholder';
      placeholder.innerHTML = `
        <div class="icon">📋</div>
        <div>选择疾病后自动生成</div>
        <div style="font-size:12px;color:var(--text-muted)">出院小结</div>
      `;
      container.appendChild(placeholder);
      return;
    }

    const content = document.createElement('div');
    content.className = 'emr-content';

    for (const key of DISCHARGE_KEYS) {
      const label = DISCHARGE_LABELS[key] || key;
      const value = _normalizeValue(dischargeData[key]);

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      labelDiv.appendChild(this._createCopyBtn(value));
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.state.dischargeData;
        if (current && current[key] !== newValue) {
          store.setState({ dischargeData: { ...current, [key]: newValue } });
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
      const disease = store.state.currentDisease;
      const patientInfo = store.state.currentPatient || {};
      const emrData = store.state.emrData || {};
      const attendingData = store.state.attendingData || {};
      const preopData = store.state.preopData || {};
      const surgeryData = store.state.surgeryData || {};

      let result;
      if (this._activeTab === 'attendingRound') {
        result = await api.generateAttendingRound(disease, patientInfo, emrData);
      } else if (this._activeTab === 'chiefRound') {
        result = await api.generateChiefRound(disease, patientInfo, emrData, attendingData);
      } else if (this._activeTab === 'preop') {
        result = await api.generatePreop(disease, patientInfo, emrData, attendingData);
      } else if (this._activeTab === 'discussion') {
        result = await api.generateDiscussion(disease, patientInfo, emrData, attendingData, preopData);
      } else if (this._activeTab === 'surgery') {
        result = await api.generateSurgery(disease, patientInfo, emrData, preopData);
      } else if (this._activeTab === 'discharge') {
        result = await api.generateDischarge(disease, patientInfo, emrData, preopData, surgeryData);
      } else {
        result = await api.generateEMR(disease, patientInfo);
      }

      if (result.emr) {
        const storeKey = {
          attendingRound: 'attendingData',
          chiefRound: 'chiefData',
          preop: 'preopData',
          discussion: 'discussionData',
          surgery: 'surgeryData',
          discharge: 'dischargeData',
        }[this._activeTab] || 'emrData';
        store.setState({ [storeKey]: result.emr, loading: false, loadingLabel: '', error: null });
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
          workup: emrData.workup || '',
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
          supplementHistory: attendingData.supplementHistory || '',
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
      } else if (this._activeTab === 'preop') {
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
      } else if (this._activeTab === 'discussion') {
        const discussionData = store.state.discussionData;
        if (!discussionData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'discussion',
          discussionParticipants: discussionData.discussionParticipants || '',
          discussionCaseSummary: discussionData.discussionCaseSummary || '',
          discussionDiagnosis: discussionData.discussionDiagnosis || '',
          discussionContent: discussionData.discussionContent || '',
          discussionConclusion: discussionData.discussionConclusion || '',
          discussionSigned: discussionData.discussionSigned || '',
        });
      } else if (this._activeTab === 'surgery') {
        const surgeryData = store.state.surgeryData;
        if (!surgeryData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'surgery',
          surgeryName: surgeryData.surgeryName || '',
          surgerySurgeon: surgeryData.surgerySurgeon || '',
          surgeryAssistant: surgeryData.surgeryAssistant || '',
          surgeryAnesthesia: surgeryData.surgeryAnesthesia || '',
          surgeryProcess: surgeryData.surgeryProcess || '',
          surgeryFindings: surgeryData.surgeryFindings || '',
          surgerySigned: surgeryData.surgerySigned || '',
        });
      } else if (this._activeTab === 'discharge') {
        const dischargeData = store.state.dischargeData;
        if (!dischargeData) {
          store.toast('error', '没有可保存的病历数据');
          return;
        }
        await db.saveRecord({
          patientId: patient.id,
          disease,
          type: 'discharge',
          dischargeAdmissionDate: dischargeData.dischargeAdmissionDate || '',
          dischargeDate: dischargeData.dischargeDate || '',
          dischargeDiagnosis: dischargeData.dischargeDiagnosis || '',
          dischargeTreatment: dischargeData.dischargeTreatment || '',
          dischargeOutcome: dischargeData.dischargeOutcome || '',
          dischargeAdvice: dischargeData.dischargeAdvice || '',
          dischargeSigned: dischargeData.dischargeSigned || '',
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
      const allRecords = await db.getRecords(patient.id);
      // Filter records by current tab type
      const typeMap = {
        firstCourse: 'firstCourse',
        attendingRound: 'attendingRound',
        chiefRound: 'chiefRound',
        preop: 'preop',
        discussion: 'discussion',
        surgery: 'surgery',
        discharge: 'discharge',
      };
      const currentType = typeMap[this._activeTab] || this._activeTab;
      const records = allRecords.filter(r => r.type === currentType);

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
                    <span class="pm-history-type ${r.type === 'attendingRound' ? 'pm-type-attending' : r.type === 'chiefRound' ? 'pm-type-chief' : r.type === 'preop' ? 'pm-type-preop' : r.type === 'discussion' ? 'pm-type-discussion' : r.type === 'surgery' ? 'pm-type-surgery' : r.type === 'discharge' ? 'pm-type-discharge' : 'pm-type-first'}">
                      ${r.type === 'attendingRound' ? '主治查房' : r.type === 'chiefRound' ? '主任查房' : r.type === 'preop' ? '术前小结' : r.type === 'discussion' ? '术前讨论' : r.type === 'surgery' ? '手术记录' : r.type === 'discharge' ? '出院小结' : '首次病程'}
                    </span>
                    ${r.chief || (r.diagnosis ? r.diagnosis.substring(0, 20) : r.chiefDiagnosis ? r.chiefDiagnosis.substring(0, 20) : r.preopDiagnosis ? r.preopDiagnosis.substring(0, 20) : r.discussionDiagnosis ? r.discussionDiagnosis.substring(0, 20) : r.surgeryName ? r.surgeryName.substring(0, 20) : r.dischargeDiagnosis ? r.dischargeDiagnosis.substring(0, 20) : '无内容')}
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
                  supplementHistory: record.supplementHistory || '',
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
            } else if (record.type === 'discussion') {
              store.setState({
                discussionData: {
                  discussionParticipants: record.discussionParticipants || '',
                  discussionCaseSummary: record.discussionCaseSummary || '',
                  discussionDiagnosis: record.discussionDiagnosis || '',
                  discussionContent: record.discussionContent || '',
                  discussionConclusion: record.discussionConclusion || '',
                  discussionSigned: record.discussionSigned || '',
                }
              });
            } else if (record.type === 'surgery') {
              store.setState({
                surgeryData: {
                  surgeryName: record.surgeryName || '',
                  surgerySurgeon: record.surgerySurgeon || '',
                  surgeryAssistant: record.surgeryAssistant || '',
                  surgeryAnesthesia: record.surgeryAnesthesia || '',
                  surgeryProcess: record.surgeryProcess || '',
                  surgeryFindings: record.surgeryFindings || '',
                  surgerySigned: record.surgerySigned || '',
                }
              });
            } else if (record.type === 'discharge') {
              store.setState({
                dischargeData: {
                  dischargeAdmissionDate: record.dischargeAdmissionDate || '',
                  dischargeDate: record.dischargeDate || '',
                  dischargeDiagnosis: record.dischargeDiagnosis || '',
                  dischargeTreatment: record.dischargeTreatment || '',
                  dischargeOutcome: record.dischargeOutcome || '',
                  dischargeAdvice: record.dischargeAdvice || '',
                  dischargeSigned: record.dischargeSigned || '',
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
                  supplementHistory: record.supplementHistory || '',
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
            } else if (record.type === 'discussion') {
              store.setState({
                discussionData: {
                  discussionParticipants: record.discussionParticipants || '',
                  discussionCaseSummary: record.discussionCaseSummary || '',
                  discussionDiagnosis: record.discussionDiagnosis || '',
                  discussionContent: record.discussionContent || '',
                  discussionConclusion: record.discussionConclusion || '',
                  discussionSigned: record.discussionSigned || '',
                }
              });
            } else if (record.type === 'surgery') {
              store.setState({
                surgeryData: {
                  surgeryName: record.surgeryName || '',
                  surgerySurgeon: record.surgerySurgeon || '',
                  surgeryAssistant: record.surgeryAssistant || '',
                  surgeryAnesthesia: record.surgeryAnesthesia || '',
                  surgeryProcess: record.surgeryProcess || '',
                  surgeryFindings: record.surgeryFindings || '',
                  surgerySigned: record.surgerySigned || '',
                }
              });
            } else if (record.type === 'discharge') {
              store.setState({
                dischargeData: {
                  dischargeAdmissionDate: record.dischargeAdmissionDate || '',
                  dischargeDate: record.dischargeDate || '',
                  dischargeDiagnosis: record.dischargeDiagnosis || '',
                  dischargeTreatment: record.dischargeTreatment || '',
                  dischargeOutcome: record.dischargeOutcome || '',
                  dischargeAdvice: record.dischargeAdvice || '',
                  dischargeSigned: record.dischargeSigned || '',
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

  _createCopyBtn(text) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.title = '复制';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
          btn.classList.remove('copied');
        }, 1500);
      }).catch(() => {
        store.toast('error', '复制失败');
      });
    });
    return btn;
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
