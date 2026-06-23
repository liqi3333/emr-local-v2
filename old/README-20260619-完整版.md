# 电子病历系统 v2 — 本地部署版

AI 驱动的电子病历系统，支持 **13 种病历文书**（分 3 大类）、多模型 AI 接入、本地数据库持久化、可视化提示词编辑，可完全离线运行。

---

## 界面预览

![主界面](public/screenshots/main-interface.png)
![AI 对话](public/screenshots/chat-area.png)
![病历预览](public/screenshots/emr-preview.png)
![患者管理](public/screenshots/patient-manager.png)

---

## 一、功能特性

### 1. 病历类型 — 3 大类 13 种

| 分类 | 类型 | 字段数 |
|:----|:----|:------:|
| **临床医师病历** | 首次病程录、主治查房、主任查房、术前小结、术前讨论、手术记录、出院小结 | 5-9 |
| **同意书** | 手术同意书、输血同意书、麻醉同意书 | 6-7 |
| **护理记录** | 护理评估、护理计划、护理记录单 | 6-8 |

所有类型通过 **类型注册表（Registry）** 统一管理，支持动态启用/禁用/排序。新增类型只需在注册表中注册，其余各层自动适配。

### 2. AI 模型接入

- **多模型支持**：OpenAI / Claude / Gemini / DeepSeek / Ollama（本地）
- **统一配置**：所有模型配置存储在 `.env` 文件中，通过 GUI 管理，无需手动编辑文件
- **后端安全代理**：API Key 仅存储在服务器端，不暴露在前端
- **多模型切换**：GUI 显示所有已配置的模型，点击即可切换当前使用的模型
- **离线模式**：内置模拟数据（`ai-mock.js`），无需 API Key 即可体验全部功能

### 3. 智能生成

- 通过 AI 对话或自然语言描述自动生成结构化病历
- **一次请求**返回结构化 JSON 输出，大幅提升生成速度
- **SSE 流式输出**逐字渲染，提升交互体验
- 对话系统支持**步骤化提示词**（4 步流程 + 最小改动原则 + 字段联动规则）
- 对话返回的 JSON 代码块可自动合并到病历中
- 所有类型的生成统一通过 `_generateCore` 单一入口，废弃的 7 个旧端点作为向后兼容代理保留

### 4. RAG 知识库系统

- 按疾病名称自动读取 `src/data/medical-files/{疾病名}/*.md` 中的指南文件
- 内容作为临床指南注入 AI 系统提示词，提升生成质量
- 路径遍历防护（拒绝 `../` 等非法路径）
- 单文件最多截取 8000 字符，多文件按文件名排序拼接
- **RAG 自动路由**：配置 `RAG_AUTO_ROUTE=true` 时，有知识库且未显式指定 Provider 的请求自动使用小模型（如 Ollama），用户显式指定 Provider 始终优先
- 后端 API 已完成（6 个端点），前端管理 UI 待补充

### 5. 智能模板进化

- 聚合同一类型的 ≥3 份真实病历记录，通过 AI 分析字段填写模式
- 输出 `fieldInsights`（频繁填写/常为空/特定模式等建议）
- 进化版本历史存储在 SQLite settings 表中，支持查询、回退
- Mock 模式：无 API Key 时返回样本频次统计代替 AI 分析

### 6. 提示词系统

- **可视化编辑器**：访问 `/prompts` 编辑 AI 生成提示词
- **双层结构**：默认模板（只读，版本受控）+ 自定义模板（自由编辑）
- **字段级配置**：每个病历字段可独立编辑 label 和 description
- **活动模板管理**：通过 SQLite settings 表切换当前使用的模板
- **重构优化**：提示词模板从 API 路由中抽离为独立 JSON，支持版本合并与同步
- **自定义类型兼容**：`assembleUserPrompt` 与 `assembleSystemPrompt` 都具备 `findTypeByTemplateKey` 第二层回退，自定义类型不再返回"未知类型"

### 7. 病历类型管理器

- 访问 `/record-types` 打开类型配置页面
- 三栏界面：分类管理 → 类型管理 → 字段配置
- 支持动态启用/禁用病历类型、调整排序
- 所有类型定义源于注册表（`src/data/recordRegistry.js`），是唯一真实来源
- 编辑操作 300ms 防抖，页面关闭时自动刷新未保存修改
- 重置操作需 `{confirm: true}` 确认，防止误操作

### 8. 疾病目录管理器

- 访问 `/diseases` 打开疾病目录管理页面
- 两栏界面：分类管理 → 疾病管理
- 支持添加/删除/修改分类和疾病
- 支持分类图标（21 个医学 emoji）和颜色（12 色系）自定义
- 重命名疾病时自动同步更新历史病历记录（事务内方案 A）
- 支持上移/下移排序、导入/导出 JSON 备份
- 疾病名全局唯一，数据存储在 SQLite，启动时自动初始化

### 9. 患者管理

- Excel 风格的患者列表界面
- 支持搜索、排序、分页
- 完整的患者 CRUD 操作（创建、读取、更新、删除）
- **跨患者数据安全**：`setTypeData` 自动打 `_patientId` 时间戳，`EmrPreview` 在保存/重新生成时校验患者匹配，切患者时自动清空所有病历 slot

### 10. 数据存储

- **SQLite 后端持久化**：`data/emr-local.db`，含 `patients` + `records` + `settings` + `schema_version` 表
- 前端通过后端 API 读写数据，无本地浏览器缓存
- **版本化迁移**：`schema_version` 表记录已应用的迁移版本，启动时自动执行未完成的迁移（事务包装，崩溃安全）
- **索引优化**：`idx_records_patient_id` + `idx_records_disease` + `idx_records_created_at` + `idx_records_type` + `idx_records_category` + `idx_patients_created_at`
- **服务端过滤与分页**：`GET /api/records?patientId=X&type=Y&category=Z&limit=N&offset=M`
- **SQL 注入防护**：所有标识符通过 `_validateIdent()` 正则校验后拼接
- **一次列定义，处处自动**：`src/data/recordColumns.js` 的 77 列数组是 SQL INSERT/UPDATE/ALTER 的唯一真实来源，新增字段无需修改 CRUD 路由

---

## 二、项目架构

```
emr-local-v2/
├── AGENTS.md                      # 项目规则与开发约定
├── server.js                      # Express 服务器入口
├── package.json                   # 依赖配置
├── .env                           # 环境变量 (API Keys + 模型配置)
├── .env.example                   # 环境变量模板
├── src/
│   ├── routes/
│   │   ├── api.js                 # AI 生成 + 模板查询 + 对话（_generateCore 单一入口）
│   │   ├── crud.js                # 患者/病历 CRUD（RECORD_DATA_COLUMNS 动态驱动）
│   │   ├── prompts.js             # 提示词模板管理 API（11 个端点）
│   │   ├── recordTypes.js         # 类型注册表 REST API（9 个端点，含 confirm 守卫）
│   │   ├── settings.js            # 模型配置 API（.env 文件管理）
│   │   ├── diseases.js            # 疾病目录 REST API（10 个端点）
│   │   ├── knowledge.js           # RAG 知识库 API（6 个端点）
│   │   └── evolution.js           # 模板进化 API（4 个端点）
│   ├── services/
│   │   ├── ai.js                  # AI 服务层（多模型，从 process.env 读取）
│   │   ├── ai-mock.js             # 离线模拟服务（13 种类型通用 mock）
│   │   ├── database.js            # SQLite 数据库服务（含迁移系统 + 分页过滤）
│   │   ├── envWriter.js           # .env 文件读写服务
│   │   ├── promptTemplates.js     # 提示词模板管理（3 层解析 + Layer2 回退）
│   │   ├── recordRegistry.js      # 类型注册表服务层（验证/存储/查询）
│   │   ├── diseaseRegistry.js     # 疾病目录服务层（验证/存储/重命名事务）
│   │   ├── knowledge.js           # 知识库文件服务（遍历/读取/防路径穿越）
│   │   └── templateEvolution.js   # AI 模板进化服务（聚合+分析+版本历史）
│   ├── data/
│   │   ├── templates.js           # 预置病历模板（40+ 种疾病）
│   │   ├── defaultPrompts.json    # 默认提示词（只读，版本受控）
│   │   ├── recordRegistry.js      # 默认类型注册表常量（3 分类 13 类型）
│   │   ├── recordColumns.js       # SSOT：77 列定义（DB schema 唯一来源）
│   │   ├── diseaseCategories.js   # 默认疾病目录常量（10 分类 40 疾病）
│   │   └── medical-files/         # RAG 知识库 Markdown 文件（按疾病分类）
│   └── middleware/
│       └── rateLimit.js           # 速率限制中间件（60 次/分钟）
├── public/
│   ├── index.html                 # 主页面
│   ├── prompts.html               # 提示词编辑器页面
│   ├── record-types.html          # 病历类型配置页面
│   ├── diseases.html              # 疾病目录管理页面
│   ├── css/
│   │   └── style.css              # 设计系统 + 响应式 + 打印样式
│   ├── screenshots/               # 界面截图
│   └── js/
│       ├── app.js                 # 应用入口 & 全局初始化
│       ├── store.js               # 可观察状态管理 + registry 辅助方法（含 _patientId 安全标记）
│       ├── db.js                  # 后端 API 客户端
│       ├── services/
│       │   ├── api.js             # 后端 API 客户端（2 个通用函数替代 13 个遗留函数）
│       │   ├── recordTypeApi.js   # 类型注册表 API 客户端
│       │   └── diseaseApi.js      # 疾病目录 API 客户端
│       ├── data/
│       │   ├── diseases.js        # 疾病目录加载器（动态加载 + 兜底）
│       │   └── diseaseStyles.js   # 预设调色板 + emoji 列表
│       └── components/
│           ├── EmrPreview.js      # 病历预览/编辑/保存（动态 storeKey 订阅 + 患者匹配守卫）
│           ├── ChatArea.js        # AI 对话区（通用 _tryParseEMR 路由）
│           ├── DiseaseTree.js     # 左侧疾病树（从 store 动态读取）
│           ├── PatientManager.js  # 患者管理（3 个 switch 点自动清空病历槽）
│           ├── SettingsPanel.js   # 模型管理弹窗
│           ├── RecordTypeManager.js# 病历类型配置器（300ms 防抖 + pagehide 刷新）
│           ├── DiseaseManager.js  # 疾病目录管理器
│           └── PromptEditor.js    # 提示词编辑器（_resolveTypeDefaults 回退）
├── data/
│   ├── emr-local.db               # SQLite 数据库文件（WAL 模式）
│   ├── prompt-templates/          # 自定义提示词模板（不被 Git 追踪）
│   └── backup/                    # 数据库自动备份
├── scripts/
│   ├── verify-integrity.js        # 完整性检查脚本（6 项检查）
│   ├── e2e-phase1.js              # E2E 回归测试脚本（9 项检查）
│   └── backfill-category.js       # 一次性历史数据修复脚本
├── old/                           # 旧版本 README 存档
├── summarize log/                 # 开发日志与计划
└── README.md
```

---

## 三、类型注册表系统

**核心思路**：所有病历类型通过注册表统一管理，渲染/AI/模拟逻辑均从注册表派生。

```
src/data/recordRegistry.js（常量定义）
       ↓
src/services/recordRegistry.js（服务层：验证/存储/查询）
       ↓
src/routes/recordTypes.js（REST API：9 个端点，reset 需 confirm）
       ↓
public/js/components/RecordTypeManager.js（前端三栏配置器，300ms 防抖）
       ↓
public/js/services/recordTypeApi.js（前端 API 客户端）
```

- **分类管理**：CRUD、启用/禁用、排序
- **类型管理**：CRUD、启用/禁用、排序、字段配置
- **前端派生**：store 中的 `getTypeConfig()` / `getActiveTypeData()` / `setTypeData()` / `setActiveType()` 等辅助方法从注册表动态生成标签页和字段渲染
- **动态订阅**：EmrPreview 按当前 activeType 动态切换 storeKey 订阅，不再硬编码 13 个订阅

---

## 四、疾病注册表系统

**核心思路**：疾病目录通过注册表服务统一管理，初始数据在启动时自动写入 SQLite，支持运行时动态增删改。

```
src/data/diseaseCategories.js（默认常量，10 分类 40 疾病 + UUID）
       ↓
src/services/diseaseRegistry.js（服务层：验证/存储/查询/重命名事务）
       ↓
src/routes/diseases.js（REST API：10 个端点）
       ↓
public/js/components/DiseaseManager.js（前端两栏管理页面）
       ↓
public/js/services/diseaseApi.js（前端 API 客户端）
```

- **分类管理**：CRUD、图标/颜色自定义（12 色系 + 21 emoji）
- **疾病管理**：CRUD、重命名（事务内同步更新 `records.disease`）、上移/下移
- **导入/导出**：JSON 备份与恢复
- **兜底机制**：API 不可用时自动使用 3 分类精简兜底数据
- **DiseaseTree**：从 `store.state.diseaseCategories` 动态读取，支持 `visibilitychange` 自动刷新

---

## 五、提示词模板系统

**核心思路**：提示词从硬编码抽离为独立的 JSON 模板，支持版本管理和可视化编辑。

```
src/data/defaultPrompts.json（默认模板，只读，版本受控）
       ↓
src/services/promptTemplates.js（服务层：加载/合并/同步/组装，3 层解析）
       ↓
src/routes/prompts.js（REST API：11 个端点）
       ↓
public/js/components/PromptEditor.js（前端可视化编辑器）
```

**模板结构**（每个病历类型）：
- `rolePrompt` — 角色设定
- `outputFormat` — 输出格式要求
- `fields` — 字段列表（key / label / description）
- `endingPrompt` — 结尾要求
- `userPrompt` — 用户提示词模板（含 `{{disease}}`、`{{patientContext}}` 占位符）

**3 层解析顺序**：
1. 现有自定义模板
2. `findTypeByTemplateKey` 回退（自动根据 registry 字段定义生成提示词）
3. 抛出"未知类型"错误

**合并算法**：
- 自定义模板仅存储与默认模板不同的字段
- 生成时合并：默认字段顺序 + 自定义覆盖值
- 默认模板更新时：检测版本差异 → 查看差异 / 自动合并 / 忽略

---

## 六、RAG 知识库系统

**核心思路**：按疾病名称从本地 Markdown 文件中读取诊疗指南，作为上下文注入 AI 提示词。

```
src/data/medical-files/{疾病名}/*.md（知识库文件）
       ↓
src/services/knowledge.js（服务层：遍历/读取/防路径穿越/拼接）
       ↓
src/routes/knowledge.js（REST API：6 个端点）
       ↓
（注入点）src/routes/api.js → _generateCore → systemPrompt
```

**注入策略**（`_generateCore` 第 2 阶段）：
- 调用 `knowledge.getKnowledge(disease)`
- 有内容时追加 `请参考以下临床指南：\n{kb.text}` 到 systemPrompt
- `RAG_AUTO_ROUTE=true` + 有知识库 + 无显式 Provider → 自动选择小模型

---

## 七、智能模板进化系统

**核心思路**：聚合同一类型的多份真实记录，通过 AI 分析字段填写模式，生成进化建议。

```
src/services/templateEvolution.js（服务层：采样/AI 分析/版本管理）
       ↓
src/routes/evolution.js（REST API：4 个端点）
```

**进化流程**：
1. `GET /api/evolution/{typeId}` — 查询进化版本历史
2. `POST /api/evolution/{typeId}` — 触发进化分析（需 ≥3 份记录）
3. 采样分析 → AI 生成 `fieldInsights` → 保存版本历史
4. `GET /api/evolution/{typeId}/{version}` — 查看特定版本详情
5. `DELETE /api/evolution/{typeId}/{version}` — 删除版本

**Mock 降级**：无 API Key 时返回基于样本频次的统计分析（无需 AI）。

---

## 八、安全与数据完整性保障

| 机制 | 位置 | 说明 |
|------|------|------|
| **_patientId 患者匹配守卫** | `store.setTypeData` + `EmrPreview._showHistory`/`save`/`regenerate` | 防止将病历数据保存到错误患者名下 |
| **clearAllTypeData** | `PatientManager.js` 3 个 switch 点 + `store.js` | 切患者时自动清空所有病历 slot |
| **SQL 标识符验证** | `database.js._validateIdent()` | 正则 `^[a-zA-Z_][a-zA-Z0-9_]*$`，防止 SQL 注入 |
| **参数化查询** | `database.js` / `crud.js` | 所有用户输入通过 `?` 占位符绑定 |
| **路径遍历防护** | `knowledge.js._sanitizePath()` | 拒绝含 `../` 等目录回溯的路径 |
| **重置确认守卫** | `recordTypes.js` | `POST /record-types/reset` 需 `{confirm: true}` |
| **API 速率限制** | `rateLimit.js` | 60 次/分钟，全局作用于所有 `/api` 路由 |
| **SSE 错误传递** | `api.js` 流式路由 | 流式错误必须传递到前端，不能静默吞掉 |
| **ALTER 幂等性** | `database.js._runMigrations()` | 所有迁移运行在事务中，已执行的自动跳过 |

---

## 九、代码质量与工程实践

| 实践 | 说明 |
|------|------|
| **SSOT（单一真实来源）** | `src/data/recordColumns.js` 的 77 列定义驱动所有 INSERT/UPDATE/ALTER SQL 生成。新增字段只改一处。 |
| **单一入口生成** | 所有类型通过 `_generateCore` 统一生成，7 个旧端点为 thin proxy 向后兼容 |
| **动态订阅** | EmrPreview 按 activeType 切换 storeKey 订阅，新增类型无需改动 |
| **防抖保存** | RecordTypeManager toggle/移动操作 300ms 防抖 + `pagehide` 刷新 |
| **Schema 迁移** | `schema_version` 表 + 事务包装，未来 schema 变更自动执行 |
| **服务端过滤** | `getRecords` 支持 `type/category/limit/offset` 参数，前端逐步适配 |
| **数据库索引** | 6 个索引覆盖患者/疾病/类型/分类/创建时间查询 |
| **版本化提示词** | 默认模板 version 字段，检测更新后支持差分合并 |
| **兜底机制** | 疾病目录加载失败时返回 3 分类精简版，不崩溃 |

---

## 十、快速开始

### 1. 安装 Node.js

本项目需要 **Node.js 18+**（附带 npm）。如果你还没有安装：

- **Windows / macOS**：从 https://nodejs.org 下载 LTS 版本，双击安装即可。
- **macOS（推荐 nvm）**：
  ```bash
  # 安装 nvm（Node 版本管理器）
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  # 重启终端后执行
  nvm install 18
  nvm use 18
  ```
- **Linux**：
  ```bash
  # 推荐使用 nvm（同上），或通过包管理器安装
  sudo apt install nodejs npm   # Debian/Ubuntu
  ```

**验证安装成功**：
```bash
node -v   # 应显示 v18.x.x 或更高
npm -v    # 应显示 9.x.x 或更高
```

### 2. 下载项目

```bash
git clone <仓库地址>
cd emr-local-v2
```

> 如果没有安装 Git，也可以在 GitHub 页面点击 **Code → Download ZIP**，解压后在终端进入该目录。

### 3. 安装依赖

```bash
npm install
```

> 如遇 `better-sqlite3` 编译错误：
> - macOS：`xcode-select --install`
> - Linux：`sudo apt install build-essential`
> - Windows：安装 Visual Studio Build Tools（勾选 C++ 桌面开发）

### 4. 启动

```bash
npm run dev
# 或生产模式：npm start
```

启动成功后终端会显示 `Server is running on http://localhost:8000`。

> 首次运行会自动创建 `data/` 目录和 `data/emr-local.db` 数据库文件，无需手动配置。

### 5. 打开浏览器

访问 http://localhost:8000

> 可选：配置 AI 模型后使用真实生成，不配置则自动进入离线模拟模式。
> 如需配置，请先执行 `cp .env.example .env`，再填入你的 API Key。详见 [十二、API 密钥配置](#十二api-密钥配置)。

---

## 常见问题

**端口被占用**（`EADDRINUSE` 错误）：
```bash
# macOS / Linux
lsof -ti:8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000    # 找到 PID
taskkill /PID <PID> /F          # 杀掉进程
```
或在 `.env` 中修改端口号：`PORT=8001`

---

## 十一、API 端点总览

### 病历生成

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/records/:typeId/generate` | **统一生成端点**（所有类型） |
| POST | `/api/emr/generate` | 首次病程录生成（DEPRECATED，代理到统一端） |
| POST | `/api/attending/generate` | 主治查房生成（DEPRECATED，代理到统一端） |
| POST | `/api/chief/generate` | 主任查房生成（DEPRECATED，代理到统一端） |
| POST | `/api/preop/generate` | 术前小结生成（DEPRECATED，代理到统一端） |
| POST | `/api/discussion/generate` | 术前讨论生成（DEPRECATED，代理到统一端） |
| POST | `/api/surgery/generate` | 手术记录生成（DEPRECATED，代理到统一端） |
| POST | `/api/discharge/generate` | 出院小结生成（DEPRECATED，代理到统一端） |
| POST | `/api/emr/generate/stream` | SSE 流式生成（仅 firstCourse） |

### 病历模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates/:key/:disease` | **统一模板端点**（所有类型） |
| GET | `/api/templates/emr/:disease` | 首次病程录模板（DEPRECATED） |
| GET | `/api/templates/attending/:disease` | 主治查房模板（DEPRECATED） |
| GET | `/api/templates/chief/:disease` | 主任查房模板（DEPRECATED） |
| GET | `/api/templates/preop/:disease` | 术前小结模板（DEPRECATED） |
| GET | `/api/templates/discussion/:disease` | 术前讨论模板（DEPRECATED） |
| GET | `/api/templates/surgery/:disease` | 手术记录模板（DEPRECATED） |
| GET | `/api/templates/discharge/:disease` | 出院小结模板（DEPRECATED） |

### 患者/病历 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/patients` | 患者列表 |
| POST | `/api/patients` | 创建患者 |
| PUT | `/api/patients/:id` | 更新患者 |
| DELETE | `/api/patients/:id` | 删除患者 |
| GET | `/api/records?patientId=X&type=Y&category=Z&limit=N&offset=M` | 病历列表（支持过滤+分页） |
| POST | `/api/records` | 创建/更新病历 |
| GET | `/api/stats` | 统计数据 |

### 类型注册表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/record-types/registry` | 获取注册表 |
| PUT | `/api/record-types/registry` | 保存注册表 |
| POST | `/api/record-types/category` | 添加分类 |
| PUT | `/api/record-types/category/:id` | 更新分类 |
| DELETE | `/api/record-types/category/:id` | 删除分类 |
| POST | `/api/record-types/category/:id/type` | 添加类型 |
| PUT | `/api/record-types/category/:id/type/:typeId` | 更新类型 |
| DELETE | `/api/record-types/category/:id/type/:typeId` | 删除类型 |
| POST | `/api/record-types/reset` | 重置（需 `{confirm: true}`） |

### 疾病目录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/diseases` | 获取完整目录 |
| PUT | `/api/diseases` | 替换目录（导入） |
| POST | `/api/diseases/reset` | 重置为默认 |
| POST | `/api/diseases/category` | 添加分类 |
| PUT | `/api/diseases/category/:id` | 更新分类 |
| DELETE | `/api/diseases/category/:id` | 删除分类 |
| POST | `/api/diseases/category/:id/disease` | 添加疾病 |
| PUT | `/api/diseases/category/:id/disease/:diseaseId` | 更新疾病（重命名走事务） |
| DELETE | `/api/diseases/category/:id/disease/:diseaseId` | 删除疾病 |
| GET | `/api/diseases/:diseaseName/record-count` | 历史记录计数 |

### 提示词管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/prompts/templates` | 模板列表 |
| GET | `/api/prompts/templates/:name` | 获取模板 |
| POST | `/api/prompts/templates` | 创建模板 |
| PUT | `/api/prompts/templates/:name` | 更新模板 |
| POST | `/api/prompts/templates/:name/duplicate` | 另存为 |
| DELETE | `/api/prompts/templates/:name` | 删除模板 |
| GET | `/api/prompts/active` | 获取活动模板 |
| POST | `/api/prompts/active` | 设置活动模板 |
| GET | `/api/prompts/merged` | 获取合并后模板 |
| POST | `/api/prompts/templates/:name/sync` | 同步默认更新 |
| GET | `/api/prompts/templates/:name/status` | 状态检查 |

### 知识库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge` | 疾病列表（有知识库的） |
| GET | `/api/knowledge/:disease` | 获取知识库内容 |
| GET | `/api/knowledge/:disease/files` | 文件列表 |
| GET | `/api/knowledge/:disease/:filename` | 读取文件 |
| PUT | `/api/knowledge/:disease/:filename` | 保存文件 |
| DELETE | `/api/knowledge/:disease/:filename` | 删除文件 |

### 模板进化

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/evolution` | 进化版本列表 |
| GET | `/api/evolution/:templateKey` | 某类型的版本历史 |
| POST | `/api/evolution/:templateKey` | 触发进化分析 |
| GET | `/api/evolution/:templateKey/:version` | 查看特定版本 |
| DELETE | `/api/evolution/:templateKey/:version` | 删除版本 |

### 模型配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/env` | 获取 .env 配置 |
| PUT | `/api/settings/env` | 更新 .env 配置 |

---

## 十二、API 密钥配置

所有模型配置统一存储在 `.env` 文件中，可通过 GUI 管理，无需手动编辑文件。

### 方式一：编辑 .env 文件（推荐）

```env
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
DEFAULT_PROVIDER=gemini
RAG_AUTO_ROUTE=false
```

### 方式二：通过 GUI 管理

点击顶部 **🧠 模型** 按钮，在弹窗中：
- 查看所有已配置的模型（显示为 `••••••••`）
- 点击 **✓** 切换当前使用的模型
- 点击 **✎** 编辑模型配置
- 点击 **+ 添加模型** 配置新模型

> GUI 保存时会自动写入 `.env` 文件，重启服务器后生效。

> 💡 未配置任何 API Key 时，系统自动使用**模拟模式**生成示例病历数据，无需 API Key 即可体验全部功能。

---

## 十三、功能快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+B` | 切换侧栏 |
| `Ctrl+M` | 打开模型管理 |
| `Enter` | 发送聊天消息 |
| `Ctrl+P` | 打印 / 导出 PDF |
| `Escape` | 关闭弹窗 |

---

## 十四、技术栈

- **后端**：Node.js + Express (CommonJS)
- **前端**：Vanilla JS (ES Modules) + CSS Custom Properties
- **数据库**：SQLite（better-sqlite3，WAL 模式）
- **AI 提供商**：OpenAI / Claude / Gemini / DeepSeek / Ollama
- **流式输出**：Server-Sent Events (SSE)
- **Node 版本要求**：18+（安装：https://nodejs.org 或 nvm install 18）

---

## 十五、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据库 | SQLite + JSON 列 + 版本化迁移 | 轻量、单机部署、schema 可演进 |
| 病历类型管理 | 注册表驱动 + 动态订阅 | 新增类型零改动前端组件 |
| 生成端点 | `_generateCore` 单一入口 + thin proxy | 废弃端点向后兼容，新逻辑只写一处 |
| 列定义 | 单一阵列 `RECORD_DATA_COLUMNS` | SSOT：INSERT/UPDATE/ALTER 自动生成 |
| 数据安全 | `_patientId` 时间戳 + 保存守卫 | 防止致命临床差错（切患者误存） |
| 提示词管理 | 独立 JSON + 3 层解析 + 合并算法 | 可版本控制、可自定义、可恢复默认 |
| RAG 知识库 | 文件系统 Markdown + 注入 system prompt | 简单、版本控制友好、AI 输出更规范 |
| 模型策略 | `RAG_AUTO_ROUTE` 标志位（默认关闭） | 用户显式选择始终优先，不破坏现有行为 |
| 模板进化 | ≥3 样本聚合 + AI 分析 + 版本历史 | 模板越用越精准，适应本地临床习惯 |
| 离线方案 | Mock + Ollama | 无需网络、本地运行 |
| 模型配置 | .env 文件统一管理 | 安全（Key 不暴露）、持久化、可版本控制 |

---

## 十六、更新日志

### 2026-06-18 — 代码审计 4 阶段改进（Phase 1-4）

**Phase 1 — 数据完整性**（A6 + B1-B4）：
- 患者数据隔离：`setTypeData` 自动打 `_patientId` 时间戳，`EmrPreview` 保存/重新生成时校验患者匹配，`PatientManager` 3 个 switch 点自动清空病历 slot
- UPDATE 修复：`saveRecord` 的 UPDATE 分支现在同时写入 `category` 和 `content` JSON
- typeConfig 传递：`saveRecord(patientId, record, typeConfig)` 第三参数传入，确保 registry 字段定义正确注入
- 列定义 SSOT：`src/data/recordColumns.js` 提取为 77 列共享数组，ALTER TABLE 改为 `PRAGMA table_info` 动态比对
- 历史数据回填：`scripts/backfill-category.js` 修复 6 条遗留的 `surgeryConsent` 记录
- 验证脚本：新增 `scripts/verify-integrity.js`（6 项检查）和 `scripts/e2e-phase1.js`（9 项 E2E 测试）

**Phase 2 — 架构债务**（A1-A5, A7）：
- crud.js 从 284→216 行（-24%）：60 字段手动解构→`RECORD_DATA_COLUMNS.reduce()` 动态提取
- api.js 从 450→368 行（-18%）：6 模板端点→统一 `GET /templates/:key/:disease`，7 废弃生成端点→thin proxy→`_generateCore`
- 前端 api.js 从 689→415 行（-40%）：删除 13 个遗留 fetch 函数，替换为 `generateRecord` + `getTemplate`
- EmrPreview 硬编码 13 storeKey 订阅→动态 `_resubscribeDataKey()`，新增类型无需改动
- RecordTypeManager 300ms 防抖 + `pagehide` 刷新

**Phase 3 — 性能与安全**（P1-P5）：
- `getRecords` 支持 `type/category/limit/offset` 服务端过滤与分页
- `schema_version` 表 + `_runMigrations()` 事务包装迁移系统（v1 已创建）
- `_validateIdent()` SQL 标识符正则校验
- 新增 `idx_records_type` + `idx_records_category` 索引
- `POST /record-types/reset` 需 `{confirm: true}` 确认

**Phase 4 — 新功能**（F1-F4）：
- RAG 知识库：`src/services/knowledge.js` + `src/routes/knowledge.js`，Markdown 文件按疾病分类，注入系统提示词
- RAG 自动路由：`RAG_AUTO_ROUTE` 环境变量，有知识库+无 Provider→自动走小模型
- 智能模板进化：`src/services/templateEvolution.js` + `src/routes/evolution.js`，≥3 样本 AI 分析→`fieldInsights`→版本历史
- 提示词修复：`assembleUserPrompt` 增加 `findTypeByTemplateKey` Layer2 回退，自定义类型不再返回"未知类型"

**验证结果**：
- E2E 回归测试：9/9 ✅
- 完整性检查：0 异常 ✅
- 端点冒烟测试：15/15 ✅
- 记录完整性：39 条记录全部保留 ✅
- 数据库备份：已创建 ✅

### 2026-06-17 — 疾病目录管理插件

**核心功能**：
- 新增疾病目录管理页面（访问 `/diseases`），支持自由添加/删除/修改分类和疾病
- 重命名疾病时自动同步更新所有历史病历记录（事务内方案 A）
- 支持分类图标（21 个医学 emoji）和颜色（12 色系调色板）自定义
- 支持上移/下移排序、导入/导出 JSON 备份、恢复默认

**架构**：
- 后端：`src/data/diseaseCategories.js` + `src/services/diseaseRegistry.js` + `src/routes/diseases.js`（10 个端点）
- 前端：`public/js/services/diseaseApi.js` + `public/js/data/diseaseStyles.js` + `public/js/components/DiseaseManager.js` + `public/diseases.html`
- 疾病目录存储在 SQLite settings 表，启动时自动初始化 10 分类 40 疾病
- API 不可用时自动使用 3 分类精简兜底数据，不会崩溃
- 疾病名全局唯一校验，DiseaseTree 改为从 store 动态读取，支持 visibilitychange 自动刷新

### 2026-06-15 — 模型配置系统重构

**架构变更**：
- 模型配置统一到 `.env` 文件，移除 SQLite `model_config` 存储
- 移除 `settings.js` 中的 4 个旧 `model-config` 端点，只保留 `.env` 管理端点
- `ai.js` 移除 SQLite 回退逻辑，直接从 `process.env` 读取配置

**GUI 改进**：
- 模型管理弹窗只显示已配置 API Key 的模型（隐藏未配置项）
- API Key 密码化显示（`••••••••`），区分已配置/未配置
- `[当前]` 标签随离线/在线模式变化
- 已选中模型显示绿色 ✓，未选中显示灰色 ✓
- 按钮点击添加缩放动画反馈

**Bug 修复**：
- 修复离线→在线切换后模型失效的问题（API Key masking 导致）
- 恢复丢失的 localStorage 辅助函数
- 修复 `updateModelBadge()` 异步读取后端配置

**修改的文件**：
- `src/services/ai.js` — 移除 SQLite 依赖
- `src/routes/settings.js` — 移除旧端点和 API Key masking
- `public/js/components/SettingsPanel.js` — 核心重写
- `public/js/app.js` — 异步更新 badge
- `public/css/style.css` — 添加按钮动画和选中样式
