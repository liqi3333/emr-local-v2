# 电子病历系统 v2 — 本地部署版

## 项目架构

```
emr-local-v2/
├── server.js                  # Express 服务器入口
├── package.json               # 依赖配置
├── .env                       # 环境变量 (API Keys)
├── .env.example               # 环境变量模板
├── src/
│   ├── services/
│   │   └── ai.js              # AI 服务抽象层 (OpenAI/Claude/Gemini)
│   ├── routes/
│   │   └── api.js             # API 路由 (代理 AI 调用)
│   └── middleware/
│       └── rateLimit.js       # 速率限制中间件
├── public/
│   ├── index.html             # 主页面 (语义化 HTML5)
│   ├── css/
│   │   └── style.css          # 设计系统 + 响应式 + 打印样式
│   └── js/
│       ├── app.js             # 应用入口 & 全局初始化
│       ├── store.js           # 可观察状态管理
│       ├── db.js              # IndexedDB 持久化层
│       ├── services/
│       │   └── api.js         # 后端 API 客户端
│       ├── data/
│       │   └── diseases.js    # 疾病目录数据
│       └── components/
│           ├── DiseaseTree.js  # 左侧疾病树
│           ├── ChatArea.js     # AI 对话区
│           ├── EmrPreview.js   # 结构化病历预览
│           ├── SettingsPanel.js# 模型管理弹窗
│           └── PatientManager.js# 患者管理
└── README.md
```

## ✨ 优化亮点 vs v1

| 优化维度 | v1 现状 | v2 改进 |
|---------|--------|---------|
| **项目结构** | 单文件 server.js (400+ 行) | 模块化目录，职责分离 |
| **安全性** | API Key 暴露在前端 localStorage | **后端代理**，API Key 配置在 `.env` |
| **AI 调用** | 7 次独立请求 (≈ 21s) | **1 次请求 + JSON 结构化输出** (≈ 3s) |
| **响应方式** | 全部完成后一次性显示 | **SSE 流式输出**，逐字渲染 |
| **数据持久化** | 刷新丢失 | **IndexedDB**，病历/患者持久保存 |
| **患者管理** | 固定示例 | 多患者支持，CRUD 操作 |
| **病历编辑** | 只读 | **contenteditable** 实时编辑 |
| **UI 体验** | 基础样式 | 设计系统 (CSS variables)、动画、骨架屏 |
| **布局** | 固定宽高 | **可拖拽分隔条**、响应式适配 |
| **导出** | 无 | **PDF 打印** 样式 |
| **键盘导航** | 无 | Ctrl+B(侧栏)、Ctrl+M(模型)、Enter(发送) |
| **错误处理** | 无 | Toast 通知、错误边界、加载状态 |
| **后端限流** | 无 | 内存速率限制 |
| **开发体验** | 手动重启 | `node --watch` 热重载 |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key (可选，无 Key 时使用模拟模式)
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 3. 启动
npm start
# 或开发模式 (热重载)
npm run dev

# 4. 浏览器打开
# macOS
open http://localhost:8000
# Linux
xdg-open http://localhost:8000
```

> ⚠️ **端口被占用？** 如果启动时出现 `EADDRINUSE` 错误，
> 说明 8000 端口已被其他进程占用。执行以下命令释放端口：
>
> ```bash
> # 查看占用 8000 端口的进程
> lsof -i :8000
>
> # 强制释放端口（替换 PID 为实际进程号）
> kill -9 <PID>
>
> # 或一行命令自动释放
> lsof -ti:8000 | xargs kill -9
> ```
>
> 如果 8000 端口经常被占用，也可以在 `.env` 中修改端口号：
> ```env
> PORT=8001
> ```

## API 密钥配置

### 方式一：后端 .env（推荐，安全）
```env
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

### 方式二：前端界面
点击顶部 **🧠 模型** 按钮，在弹窗中添加/管理模型配置。
（API Key 存储在 localStorage，仅限本地开发）

> 💡 两种方式都未配置时，系统使用**模拟模式**生成示例病历数据，无需 API Key 即可体验全部功能。

## 功能快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 切换侧栏 |
| `Ctrl+M` | 打开模型管理 |
| `Enter` | 发送聊天消息 |
| `Ctrl+P` | 打印 / 导出 PDF（浏览器默认） |
| `Escape` | 关闭弹窗 |

## 技术栈

- **后端**: Node.js + Express (CommonJS)
- **前端**: Vanilla JS (ES Modules) + CSS Custom Properties
- **存储**: IndexedDB (浏览器端持久化)
- **AI 提供商**: OpenAI 兼容 / Claude / Google Gemini
- **流式**: Server-Sent Events (SSE)
- **Node 版本要求**: 18+ (内置 fetch)
