/**
 * EMR Local v2 — Main Application Entry
 * Initializes all components and wires them together.
 */
import { store } from './store.js';
import { db } from './db.js';
import { DiseaseTree } from './components/DiseaseTree.js';
import { ChatArea } from './components/ChatArea.js';
import { EmrPreview } from './components/EmrPreview.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { PatientManager } from './components/PatientManager.js';

// ─── Global references for cleanup ───
let components = [];

// ─── Toast Renderer ───
function renderToast() {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const msg = store.state.toastMessage;
  container.innerHTML = '';
  if (msg) {
    const el = document.createElement('div');
    el.className = `toast toast-${msg.type}`;
    el.textContent = msg.text;
    container.appendChild(el);
  }
}

// ─── Model Badge Updater ───
function updateModelBadge() {
  const badge = document.getElementById('modelBadge');
  if (!badge) return;
  const activeId = localStorage.getItem('activeModelId') || '';
  if (activeId === '__offline__') {
    badge.textContent = '📴 离线模式';
    return;
  }
  try {
    const models = JSON.parse(localStorage.getItem('models') || '[]');
    const active = models.find((m) => m.id === activeId) || models[0];
    badge.textContent = active
      ? `🤖 ${active.name} (${active.provider})`
      : '⚙️ 未配置模型';
  } catch {
    badge.textContent = '⚙️ 未配置模型';
  }
}

// ─── Loading Overlay ───
function renderLoading() {
  const chatArea = document.getElementById('chatMessages');
  if (!chatArea) return;

  // Remove existing loading overlays
  chatArea.querySelectorAll('.loading-overlay').forEach((el) => el.remove());

  if (store.state.loading && store.state.loadingLabel) {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `<div class="spinner"></div><span>${store.state.loadingLabel}</span>`;
    chatArea.appendChild(overlay);
    chatArea.scrollTop = chatArea.scrollHeight;
  }
}

// ─── Chat Count ───
function updateChatCount() {
  const el = document.getElementById('chatCount');
  if (el) {
    const count = store.state.chatMessages.length;
    el.textContent = `${count} 条消息`;
  }
}

// ─── Keyboard Shortcuts ───
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+B: toggle sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      store.setState({ sidebarCollapsed: !store.state.sidebarCollapsed });
    }
    // Ctrl+M: open model settings
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault();
      const btn = document.getElementById('btnModels');
      btn?.click();
    }
    // Ctrl+P: print (already browser default, but we ensure it works)
    // Escape: already handled by modals
  });
}

// ─── Sidebar Toggle ───
function setupSidebarToggle() {
  const btn = document.getElementById('toggleSidebar');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;

  const update = () => {
    sidebar.classList.toggle('collapsed', store.state.sidebarCollapsed);
  };

  update();
  store.subscribe('sidebarCollapsed', update);

  btn.addEventListener('click', () => {
    store.setState({ sidebarCollapsed: !store.state.sidebarCollapsed });
  });
}

// ─── Export / Print ───
function setupExport() {
  const btn = document.getElementById('btnExport');
  btn?.addEventListener('click', () => {
    if (store.state.emrData) {
      window.print();
    } else {
      store.toast('info', '请先生成病历');
    }
  });
}

// ─── Patient Button (opens patient manager UI, but PatientManager already renders in the bar) ───
function setupPatientButton() {
  const btn = document.getElementById('btnPatients');
  btn?.addEventListener('click', () => {
    // Focus the first patient input
    const nameInput = document.getElementById('patientName');
    nameInput?.focus();
    nameInput?.select();
    store.toast('info', '在顶部患者栏编辑信息，点击患者卡片切换');
  });
}

// ─── Prompts Button ───
function setupPromptsButton() {
  const btn = document.getElementById('btnPrompts');
  btn?.addEventListener('click', () => {
    window.open('/prompts', '_blank');
  });
}

// ─── Pane Divider (draggable resize) ───
function setupPaneDivider() {
  const divider = document.getElementById('paneDivider');
  const chatPane = document.getElementById('chatPane');
  const emrPane = document.getElementById('emrPane');
  const container = document.getElementById('contentSplit');
  if (!divider || !chatPane || !emrPane || !container) return;

  let isDragging = false;

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pct = Math.max(20, Math.min(80, (y / rect.height) * 100));
    chatPane.style.flex = `0 0 ${pct}%`;
    emrPane.style.flex = `0 0 ${100 - pct}%`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// ─── Initialize ───
async function init() {
  try {
    // Wait for DB
    await db.ensureSamplePatient();

    // Setup basic UI
    setupKeyboardShortcuts();
    setupSidebarToggle();
    setupExport();
    setupPatientButton();
    setupPromptsButton();
    setupPaneDivider();

    // Update model badge
    updateModelBadge();
    window.addEventListener('storage', (e) => {
      if (e.key === 'models' || e.key === 'activeModelId') updateModelBadge();
    });

    // Subscribe global renderers
    store.subscribe('toastMessage', renderToast);
    store.subscribe('loading', renderLoading);
    store.subscribe('loadingLabel', renderLoading);
    store.subscribe('chatMessages', updateChatCount);

    // Initialize components
    const diseaseTree = new DiseaseTree(document.getElementById('diseaseTree'));
    await diseaseTree.render();
    components.push(diseaseTree);

    const chatArea = new ChatArea(
      document.getElementById('chatMessages'),
      document.getElementById('chatInput'),
      document.getElementById('btnSend')
    );
    await chatArea.render();
    components.push(chatArea);

    const emrPreview = new EmrPreview(document.getElementById('emrPreview'));
    await emrPreview.render();
    components.push(emrPreview);

    const settings = new SettingsPanel(document.getElementById('btnModels'));
    await settings.render();
    // SettingsPanel is singleton; no need to store for destroy
    components.push(settings);

    const patientManager = new PatientManager();
    await patientManager.render();
    components.push(patientManager);

    console.log('[EMR v2] All components initialized.');
  } catch (err) {
    console.error('[EMR v2] Initialization error:', err);
    store.toast('error', '应用初始化失败: ' + err.message);
  }
}

// ─── Error Boundary ───
window.addEventListener('unhandledrejection', (e) => {
  console.error('[EMR v2] Unhandled rejection:', e.reason);
  store.toast('error', e.reason?.message || '发生未知错误');
});

// ─── Startup ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ─── Hot-reload support (for development) ───
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    components.forEach((c) => c.destroy());
    components = [];
  });
}
