/**
 * ChatArea — streaming AI chat panel.
 *
 * Manages the chat input, send button, and message display.
 * Uses api.chatStream() for real-time streaming responses.
 *
 * Usage:
 *   import { ChatArea } from './components/ChatArea.js';
 *   const chat = new ChatArea(
 *     document.getElementById('chatMessages'),
 *     document.getElementById('chatInput'),
 *     document.getElementById('btnSend'),
 *   );
 *   await chat.render();
 */
import { store } from '../store.js';
import * as api from '../services/api.js';

export class ChatArea {
  constructor(containerEl, inputEl, sendBtnEl) {
    this.container = containerEl;
    this.input = inputEl;
    this.sendBtn = sendBtnEl;
    this._unsub = [];
    this._abortController = null;
  }

  // ────────────────────────────────────────────────────────────────
  //  Initialisation
  // ────────────────────────────────────────────────────────────────

  async render() {
    this._setupEventListeners();
    this._subscribeToStore();
    this._updateInputState();
  }

  // ────────────────────────────────────────────────────────────────
  //  Event bindings
  // ────────────────────────────────────────────────────────────────

  _setupEventListeners() {
    // Send button
    this._boundSend = () => this.sendMessage();
    this.sendBtn.addEventListener('click', this._boundSend);

    // Keyboard – Enter or Ctrl+Enter sends, Shift+Enter reserved for newline
    this._boundKeydown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) {
        e.preventDefault();
        this.sendMessage();
      }
    };
    this.input.addEventListener('keydown', this._boundKeydown);
  }

  // ────────────────────────────────────────────────────────────────
  //  Store subscriptions
  // ────────────────────────────────────────────────────────────────

  _subscribeToStore() {
    this._unsub.push(
      store.subscribe('chatMessages', () => this.renderMessages()),
    );
    this._unsub.push(
      store.subscribe('loading', () => this._updateInputState()),
    );
    this._unsub.push(
      store.subscribe('currentDisease', () => this._updateInputState()),
    );
  }

  // ────────────────────────────────────────────────────────────────
  //  Input state
  // ────────────────────────────────────────────────────────────────

  _updateInputState() {
    const loading = store.state.loading;
    const hasDisease = !!store.state.currentDisease;

    this.input.disabled = loading || !hasDisease;
    this.sendBtn.disabled = loading || !hasDisease;

    if (loading) {
      this.input.placeholder = 'AI 处理中...';
    } else if (!hasDisease) {
      this.input.placeholder = '请先选择疾病以开始对话';
    } else {
      this.input.placeholder = '输入消息... (Enter 发送)';
    }
  }

  // ────────────────────────────────────────────────────────────────
  //  Send message (streaming)
  // ────────────────────────────────────────────────────────────────

  async sendMessage() {
    const text = this.input.value.trim();
    if (!text || store.state.loading) return;

    // 1. Append user message
    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    store.setState({ chatMessages: [...store.state.chatMessages, userMsg] });
    this.input.value = '';

    // 2. Create placeholder AI message for streaming
    const aiMsg = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
    };
    let msgs = [...store.state.chatMessages, aiMsg];
    store.setState({ chatMessages: msgs, loading: true, loadingLabel: 'AI 思考中...', error: null });

    // 3. Build messages array for the API (skip empty streaming placeholders)
    const apiMessages = store.state.chatMessages
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    // Build system context: disease + current EMR data based on active tab
    if (store.state.currentDisease) {
      let systemContent = `当前患者疾病：${store.state.currentDisease}。`;

      const activeTab = store.state.activeTab || 'firstCourse';
      let currentData = null;
      let tabLabel = '';
      let fieldDesc = '';

      switch (activeTab) {
        case 'firstCourse':
          currentData = store.state.emrData;
          tabLabel = '首次病程录';
          fieldDesc = '字段说明：\n- chief: 主诉\n- hpi: 现病史\n- past: 既往史\n- exam: 体格检查\n- lab: 辅助检查\n- diag: 初步诊断\n- workup: 拟诊讨论\n- diff: 鉴别诊断\n- plan: 治疗计划';
          break;
        case 'attendingRound':
          currentData = store.state.attendingData;
          tabLabel = '主治医师首次查房';
          fieldDesc = '字段说明：\n- supplementHistory: 补充病史\n- summary: 病情摘要\n- diagnosis: 诊断\n- analysis: 病情分析\n- treatment: 诊疗计划\n- signed: 医师签名';
          break;
        case 'chiefRound':
          currentData = store.state.chiefData;
          tabLabel = '主任医师首次查房';
          fieldDesc = '字段说明：\n- chiefSummary: 病情摘要\n- chiefDiagnosis: 诊断\n- chiefAnalysis: 病情分析\n- chiefTreatment: 诊疗计划\n- chiefNotes: 主任指示\n- chiefSigned: 医师签名';
          break;
        case 'preop':
          currentData = store.state.preopData;
          tabLabel = '术前小结';
          fieldDesc = '字段说明：\n- preopDiagnosis: 术前诊断\n- preopIndication: 手术指征\n- preopPlan: 手术方案\n- preopPreparation: 术前准备\n- preopRisk: 风险评估\n- preopSigned: 医师签名';
          break;
        case 'discussion':
          currentData = store.state.discussionData;
          tabLabel = '术前讨论';
          fieldDesc = '字段说明：\n- discussionParticipants: 参加人员\n- discussionCaseSummary: 病例摘要\n- discussionDiagnosis: 诊断\n- discussionContent: 讨论内容\n- discussionConclusion: 讨论结论\n- discussionSigned: 记录者签名';
          break;
        case 'surgery':
          currentData = store.state.surgeryData;
          tabLabel = '手术记录';
          fieldDesc = '字段说明：\n- surgeryName: 手术名称\n- surgerySurgeon: 手术者\n- surgeryAssistant: 助手\n- surgeryAnesthesia: 麻醉方式\n- surgeryProcess: 手术经过\n- surgeryFindings: 术中发现\n- surgerySigned: 手术者签名';
          break;
        case 'discharge':
          currentData = store.state.dischargeData;
          tabLabel = '出院小结';
          fieldDesc = '字段说明：\n- dischargeAdmissionDate: 入院日期\n- dischargeDate: 出院日期\n- dischargeDiagnosis: 出院诊断\n- dischargeTreatment: 治疗经过\n- dischargeOutcome: 出院情况\n- dischargeAdvice: 出院医嘱\n- dischargeSigned: 主治医师签名';
          break;
      }

      if (currentData) {
        systemContent += `\n当前病历内容（${tabLabel}）：\n${JSON.stringify(currentData, null, 2)}`;
      }

      systemContent += `\n\n你是一位经验丰富的普外科主治医师。请回答用户的问题或按其要求修改【${tabLabel}】的病历。\n\n${fieldDesc}\n\n如果用户要求修改病历，请严格按以下步骤执行：\n\n**步骤1：修改用户指定的字段**\n\n**步骤2：保持格式**\n确保每个字段保持专业医学文书格式。\n\n**原则：最小改动**\n只修改与用户要求直接相关的字段。\n\n在回复末尾附加以下格式的 JSON 代码块，包含所有被你**修改过**的字段（完整值，不是增量）：\n\`\`\`json\n{"fieldName": "修改后完整内容"}\n\`\`\`\n字段名必须与上方字段说明中的英文名一致。如果没有字段被修改，则不要输出 JSON 代码块。`;
      apiMessages.unshift({ role: 'system', content: systemContent });
    }

    try {
      // 4. Streaming call
      const fullContent = await api.chatStream(apiMessages, (chunk) => {
        const current = [...store.state.chatMessages];
        const last = current[current.length - 1];
        if (last && last.role === 'assistant') {
          last.content += chunk;
          store.setState({ chatMessages: current });
        }
      });

      // 5. Mark streaming as complete
      const final = [...store.state.chatMessages];
      const last = final[final.length - 1];
      if (last && last.role === 'assistant') {
        delete last.streaming;

        // Try to parse JSON response as EMR data
        if (store.state.currentDisease) {
          this._tryParseEMR(fullContent);
        }

        store.setState({ chatMessages: final });
      }
    } catch (err) {
      // 6. Error — toast + stop streaming UI
      store.toast('error', err.message);

      const msgs = [...store.state.chatMessages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && last.streaming) {
        if (!last.content) {
          // Empty placeholder — remove it
          msgs.pop();
        } else {
          // Partial content — keep but stop streaming indicator
          delete last.streaming;
        }
      }
      store.setState({ chatMessages: msgs, error: err.message });
    } finally {
      store.setState({ loading: false, loadingLabel: '' });
    }
  }

  /**
   * Parse AI response for EMR updates.
   * Looks for a ```json ... ``` code block first, then merges with existing emrData.
   * Falls back to full-response JSON parse for backward compatibility.
   */
  _tryParseEMR(content) {
    let parsed;

    // 1. Try to extract JSON from ```json ... ``` block
    const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      try {
        parsed = JSON.parse(match[1].trim());
      } catch { /* not valid JSON, fall through */ }
    }

    // 2. Fallback: try to parse the entire response as JSON
    if (!parsed) {
      try {
        const cleaned = content
          .replace(/```(?:json)?\s*/gi, '')
          .replace(/```\s*$/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch { return; }
    }

    // 3. Route parsed data to the correct store state based on active tab
    if (!parsed) return;
    const activeTab = store.state.activeTab || 'firstCourse';
    const stateKey = {
      firstCourse: 'emrData',
      attendingRound: 'attendingData',
      chiefRound: 'chiefData',
      preop: 'preopData',
      discussion: 'discussionData',
      surgery: 'surgeryData',
      discharge: 'dischargeData',
    }[activeTab] || 'emrData';
    const current = store.state[stateKey] || {};
    store.setState({ [stateKey]: { ...current, ...parsed } });
    store.toast('info', '病历已更新');
  }

  // ────────────────────────────────────────────────────────────────
  //  Render messages
  // ────────────────────────────────────────────────────────────────

  renderMessages() {
    this.container.innerHTML = '';

    const messages = store.state.chatMessages;

    if (!messages || messages.length === 0) {
      this.container.innerHTML = `
        <div class="chat-welcome">
          <div class="icon">💬</div>
          <div>点击左侧疾病生成结构化病历</div>
          <div style="font-size:12px;color:var(--text-muted)">或直接在下方输入对话</div>
        </div>
      `;
      return;
    }

    for (const msg of messages) {
      const div = document.createElement('div');
      div.className = `msg msg-${msg.role === 'user' ? 'user' : 'ai'}`;
      if (msg.streaming) {
        div.classList.add('streaming');
      }

      // Content
      const contentDiv = document.createElement('div');
      contentDiv.className = 'msg-content';

      if (msg.role === 'user') {
        contentDiv.textContent = msg.content;
      } else {
        const displayText = msg.content || (msg.streaming ? '思考中...' : '');
        contentDiv.textContent = displayText;

        // Blinking cursor for active streaming
        if (msg.streaming && msg.content) {
          const cursor = document.createElement('span');
          cursor.className = 'cursor';
          cursor.textContent = '▌';
          contentDiv.appendChild(cursor);
        }
      }
      div.appendChild(contentDiv);

      // Timestamp
      if (msg.timestamp) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'msg-time';
        timeDiv.textContent = new Date(msg.timestamp).toLocaleTimeString(
          'zh-CN',
          { hour: '2-digit', minute: '2-digit' },
        );
        div.appendChild(timeDiv);
      }

      this.container.appendChild(div);
    }

    // Auto-scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  // ────────────────────────────────────────────────────────────────
  //  Cleanup
  // ────────────────────────────────────────────────────────────────

  destroy() {
    this._unsub.forEach((fn) => fn());
    this._unsub = [];

    if (this._boundSend) {
      this.sendBtn.removeEventListener('click', this._boundSend);
    }
    if (this._boundKeydown) {
      this.input.removeEventListener('keydown', this._boundKeydown);
    }

    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    this.container.innerHTML = '';
  }
}
