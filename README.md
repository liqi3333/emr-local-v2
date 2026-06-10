# 电子病历系统 v2 — 本地部署版

AI 驱动的电子病历系统，支持 7 种病历类型、多模型 AI 接入、本地数据库持久化，可完全离线运行。

---

## 界面预览

![主界面](public/screenshots/main-interface.png)
![AI 对话](public/screenshots/chat-area.png)
![病历预览](public/screenshots/emr-preview.png)
![患者管理](public/screenshots/patient-manager.png)

---

## 一、功能特性

### 1. 七种病历类型

| 类型 | 字段数 | 说明 |
|------|--------|------|
| 首次病程录 | 9 字段 | chief / hpi / past / exam / lab / diag / workup / diff / plan |
| 主治医师查房 | 5 字段 | summary / diagnosis / analysis / treatment / signed，继承首次病程录 |
| 主任医师查房 | 5 字段 | 同上结构，更高层级分析 |
| 术前小结 | - | 术前评估与准备记录 |
| 术前讨论 | - | 多科室讨论记录 |
| 手术记录 | - | 术中及术后记录 |
| 出院小结 | - | 出院总结与随访建议 |

### 2. AI 模型接入

- **多模型支持**：OpenAI / Claude / Gemini / DeepSeek / Ollama（本地）
- **后端安全代理**：API Key 仅存储在服务器端 `.env` 文件中，不暴露在前端
- **前端配置**：支持通过界面临时配置模型（存储在 localStorage，仅限本地开发）
- **离线模式**：内置模拟数据生成，无需 API Key 即可体验全部功能

### 3. 智能生成

- 通过 AI 对话或自然语言描述自动生成结构化病历
- **一次请求**返回结构化 JSON 输出，大幅提升生成速度
- **SSE 流式输出**逐字渲染，提升交互体验
- 对话系统支持**步骤化提示词**（4 步流程 + 最小改动原则 + 字段联动规则）
- 对话返回的 JSON 代码块可自动合并到病历中

### 4. 患者管理

- Excel 风格的患者列表界面
- 支持搜索、排序、分页
- 完整的患者 CRUD 操作（创建、读取、更新、删除）

### 5. 数据存储

- **SQLite 后端持久化**：`data/emr-local.db`，含 `patients` + `records` 表（51 个字段列 + JSON content 列）
- **IndexedDB 离线回退**：前端同时写 IndexedDB，确保离线可用
- **前后端双写机制**：在线时同步 SQLite，离线时自动回退到 IndexedDB

---

## 二、项目架构

```
emr-local-v2/
├── server.js                     # Express 服务器入口
├── package.json                  # 依赖配置
├── .env                          # 环境变量 (API Keys)
├── .env.example                  # 环境变量模板
├── src/
│   ├── routes/
│   │   ├── api.js                # AI 生成 + 模板查询 + 对话（478 行）
│   │   └── crud.js               # 患者/病历 CRUD
│   ├── services/
│   │   ├── ai.js                 # AI 服务层（多模型支持）
│   │   ├── ai-mock.js            # 离线模拟服务
│   │   └── database.js           # SQLite 数据库服务
│   ├── data/
│   │   └── templates.js          # 预置病历模板（40 种疾病）
│   └── middleware/
│       └── rateLimit.js          # 速率限制中间件
├── public/
│   ├── index.html                # 主页面 (语义化 HTML5)
│   ├── css/
│   │   └── style.css             # 设计系统 + 响应式 + 打印样式
│   └── js/
│       ├── app.js                # 应用入口 & 全局初始化
│       ├── store.js              # 可观察状态管理
│       ├── db.js                 # IndexedDB 持久化层
│       ├── services/
│       │   └── api.js            # 后端 API 客户端
│       ├── data/
│       │   └── diseases.js       # 疾病目录数据
│       └── components/
│           ├── EmrPreview.js     # 病历预览 / 编辑 / 保存（7 标签页切换）
│           ├── ChatArea.js       # AI 对话区
│           ├── DiseaseTree.js    # 左侧疾病树
│           └── PatientManager.js # 患者管理
├── data/
│   └── emr-local.db              # SQLite 数据库文件
└── README.md
```

---

## 三、AI 生成提示词体系

| 病历类型 | 字段 | 特点 |
|---------|------|------|
| 首次病程录 | 9 个 | 分号序号格式、伴发诊断强制列出、字段联动规则 |
| 主治查房 | 5 个 | 继承首次病程录内容，追加查房分析 |
| 主任查房 | 5 个 | 更高层级诊疗决策 |
| 对话系统 | 4 步流程 | 最小改动原则 + 字段联动规则，返回 JSON 自动合并 |

---

## 四、已规划待实现功能

### 1. RAG 知识库

- **方案**：在 `src/data/medical-files/` 下按疾病名建目录，存放 MD 格式专业医学文件
- **加载**：`src/services/knowledge.js` 按需读取文件，注入提示词
- **限制**：8000 字符上限，防止超出 LLM 上下文窗口
- **兼容**：在线/离线模式均可使用

### 2. 小模型 + RAG 方案

- **思路**：知识库提供专业上下文，小模型（Ollama 1.5B–7B）负责读取和整理信息
- **效果**：有知识库的小模型（80–85 分）≈ 无知识库的大模型（70 分）
- **分级策略**：有知识库的疾病用小模型（免费），无知识库回退到大模型
- **完全离线**：Ollama 本地运行 + 本地知识库，零网络依赖

### 3. 记忆系统（自动聚合模板）

- **触发条件**：某疾病已有 ≥3 份保存病例
- **聚合方式**：AI 分析共同模式（主诉、体征、诊断、治疗方案）
- **存储**：`learned_templates` 表或 `src/data/learned-templates/` 目录
- **使用**：优先使用聚合模板（比预置模板更贴近实际）
- **版本管理**：每次聚合生成新版本，保留历史，支持编辑修正

### 4. 后续规划

- 完善术前讨论、手术记录、出院小结等病历类型的 AI 生成
- TTS 语音实时输入，真正以对话方式输入原始病历资料
- 支持接入移动端，如微信、QQ、iMessage 等

---

## 五、优化亮点（v1 → v2）

| 优化维度 | v1 现状 | v2 改进 |
|---------|--------|---------|
| **项目结构** | 单文件 server.js (400+ 行) | 模块化目录，职责分离 |
| **安全性** | API Key 暴露在前端 localStorage | **后端代理**，API Key 配置在 `.env` |
| **AI 调用** | 7 次独立请求 (≈ 21s) | **1 次请求 + JSON 结构化输出** (≈ 3s) |
| **响应方式** | 全部完成后一次性显示 | **SSE 流式输出**，逐字渲染 |
| **数据持久化** | 刷新丢失 | **SQLite + IndexedDB** 双写持久化 |
| **患者管理** | 固定示例 | 多患者支持，搜索排序分页 |
| **病历编辑** | 只读 | **contenteditable** 实时编辑 |
| **病历类型** | 1 种 | **7 种**病历类型 |
| **AI 模型** | 仅 OpenAI | OpenAI / Claude / Gemini / DeepSeek / Ollama |
| **离线支持** | 无 | **Mock 模式** + Ollama 本地模型 |
| **UI 体验** | 基础样式 | 设计系统 (CSS variables)、动画、骨架屏 |
| **布局** | 固定宽高 | **可拖拽分隔条**、响应式适配 |
| **导出** | 无 | **PDF 打印** 样式 |
| **键盘导航** | 无 | Ctrl+B(侧栏)、Ctrl+M(模型)、Enter(发送) |
| **错误处理** | 无 | Toast 通知、错误边界、加载状态 |
| **后端限流** | 无 | 内存速率限制 |
| **开发体验** | 手动重启 | `node --watch` 热重载 |

---

## 六、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key（可选，无 Key 时使用模拟模式）
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 3. 启动
npm start
# 或开发模式（热重载）
npm run dev

# 4. 浏览器打开
# macOS
open http://localhost:8000
# Linux
xdg-open http://localhost:8000
```

> ⚠️ **端口被占用？** 如果启动时出现 `EADDRINUSE` 错误，说明 8000 端口已被其他进程占用。执行以下命令释放端口：
>
> ```bash
> # 查看占用 8000 端口的进程
> lsof -i :8000
>
> # 强制释放端口（替换 PID 为实际进程号）
> kill -9 <PID>
> ```
>
> 或一行命令自动释放：
>
> ```bash
> lsof -ti:8000 | xargs kill -9
> ```
>
> 如果 8000 端口经常被占用，也可以在 `.env` 中修改端口号：`PORT=8001`

---

## 七、API 密钥配置

### 方式一：后端 .env（推荐，安全）
```env
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

### 方式二：前端界面
点击顶部 **🧠 模型** 按钮，在弹窗中添加/管理模型配置。
（API Key 存储在 localStorage，仅限本地开发）

> 💡 两种方式都未配置时，系统使用**模拟模式**生成示例病历数据，无需 API Key 即可体验全部功能。

---

## 八、功能快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 切换侧栏 |
| `Ctrl+M` | 打开模型管理 |
| `Enter` | 发送聊天消息 |
| `Ctrl+P` | 打印 / 导出 PDF（浏览器默认） |
| `Escape` | 关闭弹窗 |

---

## 九、技术栈

- **后端**：Node.js + Express (CommonJS)
- **前端**：Vanilla JS (ES Modules) + CSS Custom Properties
- **数据库**：SQLite（better-sqlite3）+ IndexedDB（浏览器回退）
- **AI 提供商**：OpenAI / Claude / Gemini / DeepSeek / Ollama
- **流式输出**：Server-Sent Events (SSE)
- **Node 版本要求**：18+（内置 fetch）

---

## 十、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据库 | SQLite + JSON 列 | 轻量、单机部署、灵活扩展 |
| 离线方案 | Mock + Ollama | 无需网络、本地运行 |
| 知识库格式 | MD 文件按疾病分类 | 简单、易维护、版本控制友好 |
| 模板聚合 | 自动触发（≥3 份病例） | 数据驱动、减少人工干预 |
| 模型策略 | 分级（小模型+知识库 / 大模型） | 成本与效果平衡 |
