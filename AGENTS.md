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
- **数据库**：SQLite（`better-sqlite3`）存储在 `data/emr-local.db`；前端通过后端 API 读写
- **AI**：后端代理所有 AI 调用（API Key 仅在 `.env` 中，不暴露到前端）。聊天使用 SSE 流式输出。

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/data/recordRegistry.js` | DEFAULT_REGISTRY 常量。3 个分类、13 个类型，所有字段定义。 |
| `src/services/recordRegistry.js` | Registry 服务层。getRegistry/saveRegistry/findType/validateRegistry/ensureDefaultRegistry/migrateLegacyTypes。 |
| `src/services/database.js` | `RECORD_DATA_COLUMNS` 数组是 DB schema 的**唯一真实来源**。新增列只改这里——INSERT/UPDATE SQL 从该数组自动生成。 |
| `src/routes/recordTypes.js` | Registry REST API（9 个端点）。GET/PUT registry、分类 CRUD、类型 CRUD、重置。 |
| `src/routes/api.js` | `POST /api/records/:typeId/generate` — 统一生成端点，支持所有类型。旧 7 个端点已恢复为 DEPRECATED 代理（向后兼容）。 |
| `src/data/templates.js` | 离线疾病模板。导出 `getTemplate` / `getAttendingTemplate` / ... `getConsentTemplate` / `getNursingTemplate` / `getTemplateDiseases` 等 getter。 |
| `src/services/ai.js` | 多模型 AI 服务层。Provider 别名：`anthropic` → `claude`。支持 `openai` / `claude` / `gemini` / `deepseek` / `ollama`。 |
| `src/services/promptTemplates.js` | 提示词模板管理。3 层逻辑：现有模板 → `buildFromRegistryFields()` 自动生成 → 错误。 |
| `src/services/ai-mock.js` | Mock 生成器。`MOCK_STRATEGIES` Map，旧 7 mock 函数 + 6 个同意书/护理记录专用 mock + `buildGenericMock()` 兜底。 |
| `public/js/store.js` | 自定义可观察状态管理 + registry 辅助方法（getTypeConfig/getActiveTypeData/setTypeData/setActiveType）。 |
| `public/js/db.js` | 后端 API 客户端，所有数据通过后端 SQLite 持久化。 |
| `public/js/components/EmrPreview.js` | Registry 驱动的预览面板。动态渲染字段、统一重新生成/保存/历史。 |
| `public/js/components/ChatArea.js` | 流式 AI 聊天。字段描述从 registry 动态生成，`_tryParseEMR()` 使用 `store.setTypeData()`。 |
| `public/js/services/recordTypeApi.js` | 前端 Registry API 客户端（11 个方法）。 |
| `public/js/components/RecordTypeManager.js` | 三栏配置器组件。分类/类型/字段 CRUD，开关启用，上下移动排序。 |
| `public/record-types.html` | 独立配置页面（访问 `/record-types`）。 |

## 开发约定

- 后端：CommonJS `require()`，无 TypeScript
- 前端：ES Module `import/export`，无框架，无构建
- CSS：全部在 `public/css/style.css`（CSS custom properties 设计系统）
- 无测试套件，无 linter
- Node 18+（使用内置 `fetch` + `AbortSignal.timeout()`）

## 注意事项

- **Registry 存储在 SQLite**：Registry 数据存储在 `settings` 表（key `record_registry`），而非 JSON 文件。服务启动时 `server.js:49-50` 调用 `ensureDefaultRegistry()` + `migrateLegacyTypes()` 初始化。
- **`RECORD_DATA_COLUMNS` 是权威来源**：`saveRecord()` 从该数组动态生成 SQL。不要手动数 `?` 占位符或硬编码列数。
- **`content` 列仅 INSERT 时写入**：`saveRecord()` 在 INSERT 时写入 `content` JSON（由 `_buildRecordContent` 生成），UPDATE 时不会更新该列。新增字段后旧记录的 `content` 仍保持旧值。
- **模板缓存清理**：`src/routes/api.js` 中的模板路由使用 `delete require.cache[require.resolve('../data/templates')]` 确保加载最新模板。修改 `templates.js` 后 `npm run dev` 会自动重启，但 `npm start` 不会热重载。
- **提示词编辑页面**：访问 `/prompts` 可打开提示词模板编辑器，用于可视化编辑 AI 生成提示词。
- **Provider 别名映射**：后端 `resolveProvider()` 将 `anthropic` 映射为 `claude`。前端 SettingsPanel 和后端都使用 `claude` 作为 provider ID。新增 provider 时两边要同步。
- **速率限制全局生效**：`createRateLimiter` 应用于所有 `/api` 路由，限 60 次/分钟（包括 mock 请求）。
- **Mock 模式**：当无 API Key 时，`ai.js` 自动使用 `ai-mock.js` 生成模拟数据，无需外部服务。`__offline__` 哨兵值触发 mock 模式。
- **SSE 错误处理**：流式错误必须传递到前端（不能静默吞掉）。POST/SSE 路由用 `res.on('close')` 而非 `req.on('close')`。
- **`_buildRecordContent` 必须覆盖所有字段**：`database.js` 的 `_buildRecordContent()` 按 type 分支返回 content JSON。新增字段时必须同步更新对应 case，否则 INSERT 时字段丢失。
- **AI 对话可修改所有病历类型**：`ChatArea.js` 的系统提示词动态获取当前 active type 的 registry 配置，`_tryParseEMR()` 通过 `store.setTypeData(activeType, ...)` 通用路由写入。新增类型时无需改 `_tryParseEMR()`，但需在 `promptTemplates.js` 中配置提示词模板。
