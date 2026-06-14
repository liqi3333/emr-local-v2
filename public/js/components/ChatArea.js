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

    // Build system context: disease + current EMR data based on active type
    if (store.state.currentDisease) {
      let systemContent = `当前患者疾病：${store.state.currentDisease}。`;

      const activeType = store.state.activeType || 'firstCourse';
      const typeConfig = store.getTypeConfig(activeType);
      const tabLabel = typeConfig?.label || activeType;
      const currentData = store.getActiveTypeData();

      // Build field description from registry
      let fieldDesc = '';
      if (typeConfig?.fields) {
        fieldDesc = '字段说明：\n' + typeConfig.fields.filter(f => f.enabled !== false).map(f => `- ${f.key}: ${f.label}`).join('\n');
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

    // 3. Route parsed data to the correct store state based on active type
    if (!parsed) return;
    const activeType = store.state.activeType || 'firstCourse';
    const current = store.getActiveTypeData() || {};
    store.setTypeData(activeType, { ...current, ...parsed });
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
