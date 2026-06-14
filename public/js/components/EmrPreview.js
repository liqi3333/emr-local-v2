/**
 * EmrPreview — registry-driven preview panel.
 * Renders content into #dynamicPreview based on active type from store.
 *
 * Usage:
 *   import { EmrPreview } from './components/EmrPreview.js';
 *   const preview = new EmrPreview(document.getElementById('dynamicPreview'));
 *   preview.render();
 */
import { store } from '../store.js';
import { db } from '../db.js';
import * as api from '../services/api.js';

function _normalizeValue(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) return Object.values(item).join('：');
      return String(item);
    }).join('\n');
  }
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

function _createCopyBtn(value) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = '📋';
  btn.title = '复制';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      store.toast('success', '已复制');
    }).catch(() => {
      store.toast('error', '复制失败');
    });
  });
  return btn;
}

export class EmrPreview {
  constructor(containerEl) {
    this.el = containerEl;
    this._unsub = [];
  }

  render() {
    this._subscribe();
    this._renderActiveType();
  }

  destroy() {
    this._unsub.forEach(fn => fn());
    this._unsub = [];
  }

  _subscribe() {
    const keys = [
      'emrData', 'attendingData', 'chiefData', 'preopData',
      'discussionData', 'surgeryData', 'dischargeData',
      'surgeryConsentData', 'bloodTransfusionConsentData', 'anesthesiaConsentData',
      'nursingAssessmentData', 'nursingPlanData', 'nursingRecordSheetData',
      'currentDisease', 'loading', 'activeType',
    ];
    for (const key of keys) {
      this._unsub.push(store.subscribe(key, () => this._renderActiveType()));
    }
    // Re-render when registry changes (fields may have been toggled)
    this._unsub.push(store.subscribe('recordRegistry', () => this._renderActiveType()));
  }

  _renderActiveType() {
    const container = this.el;
    if (!container) return;

    const activeType = store.state.activeType;
    const typeConfig = store.getTypeConfig(activeType);
    if (!typeConfig) {
      container.innerHTML = `<div class="emr-placeholder"><div class="icon">📋</div><div>未知病历类型</div></div>`;
      return;
    }
    if (typeConfig.enabled === false) {
      container.innerHTML = `<div class="emr-placeholder"><div class="icon">🚫</div><div>此病历类型已禁用</div><div style="font-size:12px;color:var(--text-muted)">请在配置页面启用</div></div>`;
      return;
    }

    const data = store.getActiveTypeData();
    const loading = store.state.loading;
    const disease = store.state.currentDisease;

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

    // Render fields from registry
    const content = document.createElement('div');
    content.className = 'emr-content';

    // Show hint banner when no data
    if (!data && disease) {
      const hint = document.createElement('div');
      hint.className = 'emr-hint';
      hint.innerHTML = `📋 点击上方「🔄 重新生成」按钮生成${typeConfig.label}内容`;
      content.appendChild(hint);
    }

    const fields = typeConfig.fields || [];
    for (const field of fields) {
      if (field.enabled === false) continue;
      const value = data ? _normalizeValue(data[field.key]) : '';

      const section = document.createElement('div');
      section.className = 'emr-section';
      section.dataset.field = field.key;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = field.label;
      labelDiv.appendChild(_createCopyBtn(value));
      section.appendChild(labelDiv);

      const valueDiv = document.createElement('div');
      valueDiv.className = 'value';
      valueDiv.contentEditable = 'true';
      valueDiv.textContent = value;
      if (!data) {
        valueDiv.classList.add('value-empty');
      }
      valueDiv.addEventListener('blur', () => {
        const newValue = valueDiv.textContent || '';
        const current = store.getActiveTypeData() || {};
        if (current[field.key] !== newValue) {
          store.setTypeData(activeType, { ...current, [field.key]: newValue });
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
  //  Actions (use unified generateRecord)
  // ──────────────────────────────────────────────

  async _regenerate() {
    if (!store.state.currentDisease) {
      store.toast('info', '请先选择疾病');
      return;
    }
    store.setState({ loading: true, loadingLabel: '重新生成中...' });
    try {
      const activeType = store.state.activeType;
      const disease = store.state.currentDisease;
      const patientInfo = store.state.currentPatient || {};

      // Build context data from dependent types
      const typeConfig = store.getTypeConfig(activeType);
      const contextData = {};
      if (typeConfig?.contextDependencies) {
        const reg = store.state.recordRegistry;
        if (reg) {
          for (const depId of typeConfig.contextDependencies) {
            for (const cat of reg.categories) {
              const depType = cat.types.find(t => t.id === depId);
              if (depType) {
                const depData = store.state[depType.storeKey];
                if (depData) contextData[depType.storeKey] = depData;
                break;
              }
            }
          }
        }
      }

      const result = await api.generateRecord(activeType, {
        disease,
        patientInfo,
        contextData,
      });

      if (result.emr) {
        store.setTypeData(activeType, result.emr);
        store.setState({ loading: false, loadingLabel: '', error: null });
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
      const activeType = store.state.activeType;
      const typeConfig = store.getTypeConfig(activeType);
      const data = store.getActiveTypeData();

      if (!data) {
        store.toast('error', '没有可保存的病历数据');
        return;
      }

      // Build record with type-specific fields
      const record = {
        patientId: patient.id,
        disease,
        type: activeType,
      };
      if (typeConfig?.fields) {
        for (const field of typeConfig.fields) {
          if (field.enabled === false) continue;
          record[field.key] = data[field.key] || '';
        }
      }

      await db.saveRecord(record);
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
      const currentType = store.state.activeType;
      const records = allRecords.filter(r => r.type === currentType);
      const typeConfig = store.getTypeConfig(currentType);
      const typeLabel = typeConfig?.label || currentType;

      const overlay = document.createElement('div');
      overlay.className = 'pm-modal-overlay';
      overlay.innerHTML = `
        <div class="pm-modal" style="max-width: 520px">
          <div class="pm-modal-header">
            <h3>${patient.name} - ${typeLabel} <span class="pm-count">${records.length}</span></h3>
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
              ` : records.map(r => {
                const content = typeof r.content === 'string' ? (() => { try { return JSON.parse(r.content); } catch { return {}; } })() : (r.content || {});
                const firstField = typeConfig?.fields?.[0];
                const preview = firstField ? (content[firstField.key] || '').substring(0, 20) : '';
                return `
                  <div class="pm-history-card" data-id="${r.id}">
                    <div class="pm-history-header">
                      <span class="pm-history-disease">${r.disease}</span>
                      <span class="pm-history-date">${new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div class="pm-history-chief">${preview || '无内容'}</div>
                    <div class="pm-history-actions">
                      <button class="pm-btn pm-btn-sm pm-btn-load" data-id="${r.id}">加载</button>
                      <button class="pm-btn pm-btn-sm pm-btn-delete-record" data-id="${r.id}">删除</button>
                    </div>
                  </div>
                `;
              }).join('')}
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
            const content = typeof record.content === 'string' ? (() => { try { return JSON.parse(record.content); } catch { return {}; } })() : (record.content || {});
            store.setTypeData(record.type, content);
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
            const content = typeof record.content === 'string' ? (() => { try { return JSON.parse(record.content); } catch { return {}; } })() : (record.content || {});
            store.setTypeData(record.type, content);
            close();
            store.toast('success', '已加载病历');
          }
        });
      });
    } catch (err) {
      store.toast('error', '加载历史失败: ' + err.message);
    }
  }
}
