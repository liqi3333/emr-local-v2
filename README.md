# 电子病历系统 v2 — 本地部署版

AI 驱动的电子病历系统，支持 **13 种病历文书**（3 大类）、多模型 AI 接入、SQLite 本地持久化，可完全离线运行。

---

![主界面](public/img/main-interface.png)
*主界面 — 疾病树 + AI 对话 + 病历预览*

![AI 对话](public/img/chat-area.png)
*AI 对话 — SSE 流式生成 + 结构化病历输出*

---

## 快速开始

```bash
cp .env.example .env   # 可选，无 Key 时自动使用 Mock 模式
npm install
npm run dev            # http://localhost:8000
```

端口冲突时：`lsof -ti:8000 | xargs kill -9`

> 需 Node.js 18+。首次运行自动创建 `data/emr-local.db`，无需手动配置。

---

## 功能概览

| 功能 | 说明 |
|------|------|
| **13 种病历类型** | 首次病程录、主治查房、主任查房、术前小结、术前讨论、手术记录、出院小结、手术/输血/麻醉同意书、护理评估/计划/记录单 |
| **多模型 AI** | OpenAI / Claude / Gemini / DeepSeek / Ollama，GUI 切换，无 Key 自动 Mock |
| **SSE 流式生成** | AI 对话逐字渲染 + 结构化 JSON 输出 |
| **RAG 知识库** | `src/data/medical-files/{疾病}/*.md` 作为指南注入，支持自动路由小模型 |
| **模板进化** | 聚合 ≥3 条真实记录 → AI 分析字段填写模式 → 版本历史 |
| **提示词编辑器** | 访问 `/prompts` 可视化编辑双层提示词（只读默认模板 + 自定义模板） |
| **病历类型管理器** | 访问 `/record-types` 三栏配置：分类→类型→字段，支持动态启用/排序 |
| **疾病目录管理器** | 访问 `/diseases` 管理疾病分类/图标/颜色，重命名自动同步历史记录 |
| **患者管理** | Excel 风格列表，搜索/排序/分页，跨患者数据安全守卫 |
| **SQLite 持久化** | 版本化迁移、服务端过滤与分页、6 个索引、SQL 注入防护 |

---

## 项目结构

```
emr-local-v2/
├── server.js                 # Express 入口
├── src/
│   ├── routes/               # API 路由（crud / api / prompts / recordTypes / diseases / knowledge / evolution / settings）
│   ├── services/             # 服务层（database / ai / ai-mock / promptTemplates / recordRegistry / diseaseRegistry / knowledge / templateEvolution / envWriter）
│   ├── data/                 # 数据定义（templates / defaultPrompts / recordRegistry / recordColumns / diseaseCategories / medical-files）
│   └── middleware/           # rateLimit
├── public/
│   ├── index.html / prompts.html / record-types.html / diseases.html
│   ├── css/style.css
│   └── js/                   # ES Modules 无框架（app / store / db / components / services / data）
├── data/                     # SQLite DB + prompt-templates + backup
└── scripts/                  # 完整性检查 / E2E 测试 / 数据修复
```

---

## 配置

### 模型配置

编辑 `.env` 或点击顶部 **🧠 模型** 按钮通过 GUI 管理：

```env
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
DEFAULT_PROVIDER=gemini
RAG_AUTO_ROUTE=false
```

> 无 API Key 时自动进入模拟模式，可正常体验全部功能。

### 常用页面

| 页面 | 访问路径 |
|------|----------|
| 主界面 | `http://localhost:8000` |
| 提示词编辑器 | `http://localhost:8000/prompts` |
| 病历类型配置 | `http://localhost:8000/record-types` |
| 疾病目录管理 | `http://localhost:8000/diseases` |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js 18+ / Express (CommonJS) |
| 前端 | Vanilla JS (ES Modules) / CSS Custom Properties |
| 数据库 | SQLite (better-sqlite3, WAL 模式) |
| AI | OpenAI / Claude / Gemini / DeepSeek / Ollama |
| 流式 | Server-Sent Events (SSE) |

---

## API 端点速览

| 分类 | 主要端点 |
|------|----------|
| **病历生成** | `POST /api/records/:typeId/generate`（统一入口） |
| **模板** | `GET /api/templates/:key/:disease`（统一入口） |
| **患者 CRUD** | `GET/POST /api/patients` `PUT/DELETE /api/patients/:id` |
| **病历 CRUD** | `GET /api/records?...` `POST /api/records` |
| **注册表** | `GET/PUT /api/record-types/registry` + 分类/类型 CRUD |
| **疾病目录** | `GET/PUT /api/diseases` + 分类/疾病 CRUD + reset |
| **提示词** | 11 个端点：模板 CRUD + 活动模板 + 合并 + 同步 |
| **知识库** | 6 个端点：按疾病查询/读写文件 |
| **模板进化** | 4 个端点：版本历史 + 触发分析 |
| **模型配置** | `GET/PUT /api/settings/env` |

---

## 关键设计决策

| 决策 | 选择 |
|------|------|
| 病历类型管理 | 注册表驱动 + 动态订阅，新增类型零改动前端组件 |
| 生成端点 | `_generateCore` 单一入口，旧端点为 thin proxy 向后兼容 |
| 列定义 | `RECORD_DATA_COLUMNS` 数组为唯一真实来源，INSERT/UPDATE/ALTER 自动生成 |
| 数据库 | SQLite + JSON 列 + 版本化迁移（事务包裹） |
| 模型配置 | `.env` 文件统一管理，API Key 不暴露到前端 |
| 离线方案 | Mock + Ollama，无需网络 |
| 提示词管理 | 独立 JSON + 3 层解析 + 合并算法 |
