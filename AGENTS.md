# AGENTS.md — emr-local-v2

## 快速开始

```bash
npm install
cp .env.example .env   # 可选，无 Key 时自动使用 mock 模式
npm run dev             # node --watch 热重载，端口 8000
# 打开 http://localhost:8000
```

## 端口冲突

端口 8000 经常卡死，启动前先杀进程：
```bash
lsof -ti:8000 | xargs kill -9
```

## 架构

- **后端**：Express + CommonJS（`server.js` → `src/routes/api.js`、`src/routes/crud.js`）
- **前端**：原生 JS ES Modules（`public/js/`），无构建步骤，无打包器
- **数据库**：SQLite（`better-sqlite3`）存储在 `data/emr-local.db`；浏览器端 IndexedDB 做离线回退
- **AI**：后端代理所有 AI 调用（API Key 仅在 `.env` 中，不暴露到前端）。聊天使用 SSE 流式输出。

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/services/database.js` | `RECORD_DATA_COLUMNS` 数组是 DB schema 的**唯一真实来源**。新增列只改这里——INSERT/UPDATE SQL 从该数组自动生成。 |
| `src/data/templates.js` | 离线疾病模板。导出 `getTemplate` / `getAttendingTemplate` / `getChiefTemplate` / `getPreopTemplate` / `getDiscussionTemplate` / `getSurgeryTemplate` / `getDischargeTemplate` / `getTemplateDiseases` 以及对应 `TEMPLATES` / `ATTENDING_TEMPLATES` / ... 对象。 |
| `src/services/ai.js` | 多模型 AI 服务层。Provider 别名：`anthropic` → `claude`。支持 `openai` / `claude` / `gemini` / `deepseek` / `ollama`。 |
| `public/js/store.js` | 自定义可观察状态管理。只在实际变化时通知。 |
| `public/js/db.js` | IndexedDB 封装。`_syncOfflineToBackend()` 在后端恢复时自动迁移数据。 |
| `public/js/components/EmrPreview.js` | 7 标签页 EMR 编辑器。`_activeTab` 取值：`firstCourse\|attendingRound\|chiefRound\|preop\|discussion\|surgery\|discharge`。 |
| `public/js/components/SettingsPanel.js` | 模型管理面板。`__offline__` 哨兵值 = 离线/mock 模式。 |

## 开发约定

- 后端：CommonJS `require()`，无 TypeScript
- 前端：ES Module `import/export`，无框架，无构建
- CSS：全部在 `public/css/style.css`（CSS custom properties 设计系统）
- 无测试套件，无 linter
- Node 18+（使用内置 `fetch` + `AbortSignal.timeout()`）

## 注意事项

- **模板修改需重启**：`src/data/templates.js` 是 CommonJS `require()` 加载；`npm run dev`（`node --watch`）会自动重启，但 `npm start` 不会热重载，修改后需手动重启。
- **`RECORD_DATA_COLUMNS` 是权威来源**：`saveRecord()` 从该数组动态生成 SQL。不要手动数 `?` 占位符或硬编码列数。
- **`content` 列保持同步**：`saveRecord()` 在 INSERT 和 UPDATE 时都会写入 `content` JSON（由 `_buildRecordContent` 生成）。`_buildRecordContent` 新增字段后，UPDATE 时 `content` 会同步更新，但旧记录中未触发 UPDATE 的 `content` 仍可能保持旧值。
- **`.env.example` 不完整**：`ai.js` 会读取 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` / `OLLAMA_API_KEY` / `OLLAMA_BASE_URL` / `OLLAMA_MODEL`，但 `.env.example` 中未列出。新增 provider 时记得同步到 `.env.example`。
- **Provider ID 不一致**：前端 SettingsPanel 用 `claude`，后端 `resolveProvider()` 映射 `anthropic` → `claude`。新增 provider 时两边要同步。
- **速率限制跳过 mock**：`skipIf: (req) => !req.body?.apiKey`——mock/离线请求绕过限制；真实 API 调用限 60 次/分钟。
- **离线哨兵值**：模型配置中 `__offline__` 触发 mock 模式 → `getModelConfig()` 返回 null → 回退到模板。
- **SSE 错误处理**：流式错误必须传递到前端（不能静默吞掉）。POST/SSE 路由用 `res.on('close')` 而非 `req.on('close')`。
- **IndexedDB ↔ SQLite 同步**：前端双写；`db.js` 的 `_syncOfflineToBackend()` 在后端恢复时自动迁移。
- **历史记录按标签过滤**：`EmrPreview.js` 的 `_showHistory()` 按 `_activeTab` 过滤（如 `attendingRound`），只显示当前标签类型的记录。
- **`_buildRecordContent` 必须覆盖所有字段**：`database.js` 的 `_buildRecordContent()` 按 type 分支返回 content JSON。新增字段时必须同步更新对应 case（如 `chiefRound` 需包含 `chiefNotes`），否则 INSERT 时字段丢失。
- **AI 对话可修改所有病历类型**：`ChatArea.js` 的系统提示词包含所有 7 种病历类型的上下文，`_tryParseEMR()` 根据字段前缀分发到对应的 store 状态（`emrData`/`attendingData`/`chiefData`/`preopData`/`discussionData`/`surgeryData`/`dischargeData`）。新增字段时需同步更新 `knownFields` 数组和字段分组逻辑。
