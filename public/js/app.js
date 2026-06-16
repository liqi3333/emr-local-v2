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
import { recordTypeApi } from './services/recordTypeApi.js';

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
async function updateModelBadge() {
  const badge = document.getElementById('modelBadge');
  if (!badge) return;
  const activeId = localStorage.getItem('activeModelId') || '';
  if (activeId === '__offline__') {
    badge.textContent = '📴 离线模式';
    return;
  }
  try {
    const res = await fetch('/api/settings/env');
    const config = await res.json();
    if (config && config.defaultProvider) {
      const providerLabel = { openai: 'OpenAI', claude: 'Claude', gemini: 'Gemini', deepseek: 'DeepSeek', ollama: 'Ollama' };
      const providerConfig = config[config.defaultProvider];
      if (providerConfig && providerConfig.model) {
        badge.textContent = `🧠 ${providerLabel[config.defaultProvider] || config.defaultProvider} - ${providerConfig.model}`;
        return;
      }
    }
    badge.textContent = '⚙️ 未配置模型';
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
    const hasData = store.state.emrData || store.getActiveTypeData();
    if (hasData) {
      window.print();
    } else {
      store.toast('info', '请先生成病历');
    }
  });
}



// ─── Prompts Button ───
function setupPromptsButton() {
  const btn = document.getElementById('btnPrompts');
  btn?.addEventListener('click', () => {
    window.open('/prompts', '_blank');
  });
}

// ─── Record Types Button ───
function setupRecordTypesButton() {
  const btn = document.getElementById('btnRecordTypes');
  btn?.addEventListener('click', () => {
    window.open('/record-types', '_blank');
  });
}

// ─── Load Registry from API ───
async function loadRegistry() {
  try {
    const registry = await recordTypeApi.getRegistry();
    store.setState({ recordRegistry: registry });
    console.log('[EMR v2] Registry loaded:', registry.categories.length, 'categories');
  } catch (err) {
    console.error('[EMR v2] Failed to load registry:', err);
    store.toast('error', '加载病历类型配置失败');
  }
}

// ─── Render category tabs + type tabs from registry ───
function renderCategoryTabs() {
  const categoryTabs = document.getElementById('categoryTabs');
  const typeTabs = document.getElementById('typeTabs');
  if (!categoryTabs || !typeTabs) return;

  const reg = store.state.recordRegistry;
  if (!reg) return;

  const activeCategory = store.state.activeCategory;
  const activeType = store.state.activeType;

  // Render only enabled categories
  categoryTabs.innerHTML = reg.categories
    .filter(cat => cat.enabled !== false)
    .map(cat => {
      const isActive = cat.id === activeCategory;
      return `<button class="cat-tab ${isActive ? 'active' : ''}" data-category="${cat.id}">${cat.icon || ''} ${cat.label}</button>`;
    }).join('');

  // Bind category tab clicks
  categoryTabs.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const catId = tab.dataset.category;
      const cat = store.state.recordRegistry?.categories.find(c => c.id === catId);
      if (cat && cat.types.length > 0) {
        const firstEnabledType = cat.types.find(t => t.enabled !== false);
        if (firstEnabledType) {
          store.setState({ activeCategory: catId, activeType: firstEnabledType.id });
          store.setActiveType(firstEnabledType.id);
          renderCategoryTabs();
          renderTypeTabs();
        }
      }
    });
  });

  // Render type tabs for active category
  renderTypeTabs();
}

function renderTypeTabs() {
  const typeTabs = document.getElementById('typeTabs');
  if (!typeTabs) return;

  const reg = store.state.recordRegistry;
  if (!reg) return;

  const activeCategory = store.state.activeCategory;
  const activeType = store.state.activeType;
  const cat = reg.categories.find(c => c.id === activeCategory);
  if (!cat) {
    typeTabs.innerHTML = '';
    return;
  }

  typeTabs.innerHTML = cat.types
    .filter(t => t.enabled !== false)
    .map(t => {
      const isActive = t.id === activeType;
      return `<button class="type-tab ${isActive ? 'active' : ''}" data-type="${t.id}">${t.label}</button>`;
    }).join('');

  // Bind type tab clicks
  typeTabs.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const typeId = tab.dataset.type;
      store.setActiveType(typeId);
      renderTypeTabs();
    });
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

    // Load registry from API (must be before component init)
    await loadRegistry();

    // Setup basic UI
    setupKeyboardShortcuts();
    setupSidebarToggle();
    setupExport();
    setupPromptsButton();
    setupRecordTypesButton();
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

    // Render category/type tabs from registry
    renderCategoryTabs();
    store.subscribe('recordRegistry', () => renderCategoryTabs());
    store.subscribe('activeCategory', () => renderCategoryTabs());
    store.subscribe('activeType', () => renderTypeTabs());

  // Re-render when registry changes (fields may have been toggled)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      await loadRegistry();
      // If active type is now disabled, switch to first enabled type
      const activeType = store.state.activeType;
      const typeConfig = store.getTypeConfig(activeType);
      if (typeConfig && typeConfig.enabled === false) {
        const reg = store.state.recordRegistry;
        for (const cat of reg.categories) {
          const firstEnabled = cat.types.find(t => t.enabled !== false);
          if (firstEnabled) {
            store.setActiveType(firstEnabled.id);
            break;
          }
        }
      }
    }
  });

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

    const emrPreview = new EmrPreview(document.getElementById('dynamicPreview'));
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
