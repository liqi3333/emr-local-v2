# 医疗文书插件系统实施方案（kimi27 版 · 方案 2）

## 1. 项目目标

将现有 7 个病历类型与新增类型（同意书、护理记录等）纳入**完全统一**的插件化框架：

- 所有类型由 **Registry（注册表）** 统一定义
- 所有类型走同一套 **生成 / Mock / 渲染 / 保存 / 加载** 机制
- 旧 7 个类型的行为保持 100% 不变
- 新增、删除、修改类型**零代码改动**

---

## 2. 核心设计原则

| 原则 | 说明 |
|---|---|
| Registry 即真相 | 类型的字段、标签、依赖、模板键全部来自 registry |
| 旧逻辑行为不变 | 旧 7 类型的 templateKey、mock 策略、字段定义与现在完全一致 |
| 统一入口 | 生成端点统一为 `POST /api/records/:typeId/generate` |
| 上下文可配置 | 每个类型通过 `contextDependencies` 声明依赖哪些前置类型 |
| 模板分层 | 有现成模板用现成模板，没有则按 registry 字段自动生成 |
| 数据兼容 | 现有记录不受影响，新字段存 JSON `content` |

---

## 3. Registry 数据模型

### 3.1 分类（Category）

```javascript
{
  id: 'clinicalRecords',        // 一级标签 ID，英文
  label: '临床医师病历',         // 显示名称
  icon: '📋',
  enabled: true,                // 是否启用
  sortOrder: 0,                 // 排序
  types: []                     // 二级类型数组
}
```

### 3.2 类型（Type）

```javascript
{
  id: 'attendingRound',                   // 类型唯一 ID
  label: '主治查房',                       // 显示名称
  icon: '📋',
  storeKey: 'attendingData',              // Store 状态键
  templateKey: 'attending',               // prompt/mock 策略键
  enabled: true,
  sortOrder: 1,
  contextDependencies: ['firstCourse'],   // 生成时需要的前置类型 ID
  fields: [                               // 字段定义
    { key: 'supplementHistory', label: '补充病史', description: '...' },
    { key: 'summary', label: '病情摘要', description: '...' },
  ]
}
```

### 3.3 初始 Registry 结构

```
clinicalRecords（临床医师病历）
  ├── firstCourse（首次病程录）
  ├── attendingRound（主治查房）
  ├── chiefRound（主任查房）
  ├── preop（术前小结）
  ├── discussion（术前讨论）
  ├── surgery（手术记录）
  └── discharge（出院小结）

consentForms（同意书）
  ├── surgeryConsent（手术同意书）
  ├── bloodTransfusionConsent（输血同意书）
  └── anesthesiaConsent（麻醉同意书）

nursingRecords（护理记录）
  ├── nursingAssessment（护理评估）
  ├── nursingPlan（护理计划）
  └── nursingRecordSheet（护理记录单）
```

### 3.4 内置类型的 contextDependencies 映射

```javascript
firstCourse:      contextDependencies: []
attendingRound:   contextDependencies: ['firstCourse']
chiefRound:       contextDependencies: ['firstCourse', 'attendingRound']
preop:            contextDependencies: ['firstCourse', 'attendingRound']
discussion:       contextDependencies: ['firstCourse', 'attendingRound', 'preop']
surgery:          contextDependencies: ['firstCourse', 'preop']
discharge:        contextDependencies: ['firstCourse', 'preop', 'surgery']

surgeryConsent:              contextDependencies: ['firstCourse']
bloodTransfusionConsent:     contextDependencies: ['firstCourse']
anesthesiaConsent:           contextDependencies: ['firstCourse', 'preop']

nursingAssessment:           contextDependencies: ['firstCourse']
nursingPlan:                 contextDependencies: ['firstCourse', 'nursingAssessment']
nursingRecordSheet:          contextDependencies: ['firstCourse', 'nursingPlan']
```

### 3.5 内置类型的 templateKey 与默认 Prompts.json 对应关系

| registry type ID | templateKey | defaultPrompts.json 键 |
|---|---|---|
| firstCourse | `emr` | `emr` |
| attendingRound | `attending` | `attending` |
| chiefRound | `chief` | `chief` |
| preop | `preop` | `preop` |
| discussion | `discussion` | `discussion` |
| surgery | `surgery` | `surgery` |
| discharge | `discharge` | `discharge` |
| surgeryConsent | `surgeryConsent` | 自动按字段生成 |
| bloodTransfusionConsent | `bloodTransfusionConsent` | 自动按字段生成 |
| anesthesiaConsent | `anesthesiaConsent` | 自动按字段生成 |
| nursingAssessment | `nursingAssessment` | 自动按字段生成 |
| nursingPlan | `nursingPlan` | 自动按字段生成 |
| nursingRecordSheet | `nursingRecordSheet` | 自动按字段生成 |

---

## 4. 后端改造计划

### 4.1 新建文件

#### `src/data/recordRegistry.js`

- 定义并导出 `DEFAULT_REGISTRY` 常量
- 包含旧 7 类型 + 同意书 3 类型 + 护理记录 3 类型
- 每个 type 配齐 id / label / icon / storeKey / templateKey / contextDependencies / fields

#### `src/services/recordRegistry.js`

- `getDefaultRegistry()` — 返回默认 registry
- `getRegistry()` — 从 SQLite settings 读取
- `saveRegistry(registry)` — 保存到 settings
- `ensureDefaultRegistry()` — 首次启动时写入默认值
- `findType(id)` / `findCategory(id)` — 按 ID 查找
- `validateRegistry(registry)` — 校验结构
- `migrateLegacyTypes()` — 旧记录回填 category

#### `src/routes/recordTypes.js`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/record-types/registry` | 获取完整 registry |
| PUT | `/api/record-types/registry` | 更新完整 registry |
| POST | `/api/record-types/category` | 添加一级分类 |
| PUT | `/api/record-types/category/:id` | 更新一级分类 |
| DELETE | `/api/record-types/category/:id` | 删除一级分类 |
| POST | `/api/record-types/category/:id/type` | 添加二级类型 |
| PUT | `/api/record-types/category/:id/type/:typeId` | 更新二级类型 |
| DELETE | `/api/record-types/category/:id/type/:typeId` | 删除二级类型 |

### 4.2 修改文件

#### `server.js`

- 引入并注册 `recordTypesRouter`
- 启动时调用 `ensureDefaultRegistry()` 和 `migrateLegacyTypes()`

#### `src/services/database.js`

- `CREATE TABLE records` 增加 `category TEXT DEFAULT 'clinicalRecords'`
- 已有库通过 `ALTER TABLE` 添加 `category` 列
- 启动时回填旧记录 category
- `_buildRecordContent(record, typeConfig)` 按 registry 字段构建 JSON
- `saveRecord()` 根据 `record.type` 查找 typeConfig 并传入

#### `src/routes/crud.js`

- 保存记录时透传 `category`
- 不再硬编码 48 个字段参数，改为从请求体动态读取

#### `src/routes/api.js`

- 新增统一端点 `POST /api/records/:typeId/generate`
- 处理流程：校验 typeId → 查 registry → 按 contextDependencies 组装 context → 调 promptTemplates → 调 ai → 解析归一化
- 原有 7 个生成端点删除

#### `src/services/promptTemplates.js`

- `assembleSystemPrompt(templateKey, context, typeConfig)` 改为三层逻辑：
  1. 有模板用模板（旧 7 类型走 defaultPrompts.json）
  2. 无模板按 registry 字段自动生成（新类型走这里）
  3. 都没有报错
- 新增 `buildFromRegistryFields(typeConfig, context)` 辅助函数

#### `src/services/ai-mock.js`

- 引入策略注册表 `MOCK_STRATEGIES` Map
- 旧 7 个 mock 函数注册为策略
- `mockGenerate(typeConfig, disease, context)` 统一 mock 入口
- 通用字段占位生成器 `buildGenericMock(fields, disease)`

---

## 5. 前端改造计划

### 5.1 新建文件

#### `public/js/data/recordRegistry.js`

- 导出默认 registry 常量，供配置器和启动兜底使用

#### `public/js/services/recordTypeApi.js`

- 封装 registry API：`getRegistry()` / `saveRegistry()` / category CRUD / type CRUD

#### `public/js/components/RecordTypeManager.js`

- 病历类型管理器组件
- 三栏布局：分类列表 / 类型列表 / 字段编辑器
- 增删改查、排序、启用开关、导入导出 JSON

#### `public/record-types.html`

- 独立配置页面，类似 `prompts.html`

### 5.2 修改文件

#### `public/index.html`

- 顶部 actions 加「病历类型」按钮
- pane-header 改为 `categoryTabs` + `typeTabs`
- 7 个 preview 容器合并为 `dynamicPreview`

#### `public/js/store.js`

- 新增 `recordRegistry`、`activeCategory`、`activeTab`
- 动态初始化各 `*Data` 键

#### `public/js/app.js`

- 启动流程：先拉 registry → 再初始化 EmrPreview / ChatArea

#### `public/js/services/api.js`

- 新增 `generateRecord(typeId, context)` 统一生成函数
- 删除/废弃 7 个旧生成函数

#### `public/js/components/EmrPreview.js`

- 完全重构，移除 7 套硬编码 LABELS/KEYS 和 7 个渲染函数
- 新增 `_renderCategoryTabs()` / `_renderTypeTabs()` / `_renderType(typeConfig)`
- `_regenerate()` / `_saveRecord()` / `_showHistory()` / `_loadRecord()` 全部 registry 驱动

#### `public/js/components/ChatArea.js`

- 字段描述从 registry 读取
- `_tryParseEMR()` 按 registry 的 storeKey 分发

#### `public/css/style.css`

- 新增 `.category-tabs` / `.category-tab` 样式
- 新增配置器页面样式 `.rtm-*`

---

## 6. 子阶段实施计划

### 阶段一：Registry 数据层 + API（约 4 小时）

| 子阶段 | 工作内容 | 预估时间 | 交付物 |
|---|---|---|---|
| **1.1** | 新建 `src/data/recordRegistry.js`，定义 `DEFAULT_REGISTRY` | 30 分钟 | registry 数据常量可正确读取 |
| **1.2** | 新建 `src/services/recordRegistry.js`，实现 load/save/find/ensure | 45 分钟 | settings 表出现 registry |
| **1.3** | `database.js` 加 `category` 列，启动时回填旧记录 | 45 分钟 | records 表有 category 列 |
| **1.4** | `saveRecord` 改为 registry 驱动，`_buildRecordContent` 动态构建 | 45 分钟 | 保存首次病程录 content JSON 正确 |
| **1.5** | 新建 `src/routes/recordTypes.js`，实现完整 REST API | 45 分钟 | curl 能获取/修改 registry |
| **1.6** | `server.js` 注册路由，启动初始化 | 30 分钟 | `/api/record-types/registry` 可访问 |

### 阶段二：AI 与 Mock 统一（约 4.5 小时）

| 子阶段 | 工作内容 | 预估时间 | 交付物 |
|---|---|---|---|
| **2.1** | `api.js` 新增 `POST /api/records/:typeId/generate` 骨架 | 45 分钟 | 请求返回 200 |
| **2.2** | 按 `contextDependencies` 自动组装 context | 45 分钟 | context 包含正确依赖数据 |
| **2.3** | `promptTemplates.js` 增加 registry 字段自动生成分支 | 60 分钟 | 旧 prompt 不变，新类型有可用 prompt |
| **2.4** | `ai-mock.js` 引入策略注册表，注册旧 7 类型策略 | 45 分钟 | mock 模式旧类型输出正确 |
| **2.5** | 实现 `buildGenericMock`，新类型占位 mock | 45 分钟 | 新类型返回 JSON |
| **2.6** | 删除旧 7 个生成端点，前端切到通用端点，回归 | 60 分钟 | firstCourse → discharge 全部正常 |

### 阶段三：配置器 UI（约 5.5 小时）

| 子阶段 | 工作内容 | 预估时间 | 交付物 |
|---|---|---|---|
| **3.1** | 新建 `record-types.html` 骨架 + `recordTypeApi.js` | 30 分钟 | 页面加载能拉取 registry |
| **3.2** | 一级分类面板：列表 + 增删改 + 启用开关 | 60 分钟 | 能管理分类 |
| **3.3** | 二级类型面板：列表 + 增删改 + 启用开关 | 60 分钟 | 能管理类型 |
| **3.4** | 字段编辑器面板：增删改 key/label/description | 60 分钟 | 能管理字段 |
| **3.5** | 保存 / 导入导出 / 重置 / 校验 | 60 分钟 | 配置可持久化 |
| **3.6** | `public/js/components/RecordTypeManager.js` 组件整合 | 60 分钟 | 完整管理器可运行 |
| **3.7** | 配置器 CSS 样式 | 45 分钟 | 界面美观可用 |

### 阶段四：首页双层标签改造（约 7 小时）

| 子阶段 | 工作内容 | 预估时间 | 交付物 |
|---|---|---|---|
| **4.1** | `index.html`：顶部加按钮，pane-header 改容器，合并 preview | 30 分钟 | 页面结构正确 |
| **4.2** | `store.js`：加 `recordRegistry`、`activeCategory`、动态数据键 | 45 分钟 | store 包含 registry |
| **4.3** | `app.js`：启动时先拉 registry 再初始化组件 | 30 分钟 | 刷新后首页有 registry |
| **4.4** | `api.js` 前端：加 `generateRecord(typeId, context)` | 30 分钟 | 通用函数可调用 |
| **4.5** | `EmrPreview.js`：渲染一级 / 二级标签 | 60 分钟 | 首页有双层标签 |
| **4.6** | `EmrPreview.js`：通用字段渲染器 `_renderType(typeConfig)` | 60 分钟 | 旧类型显示正常 |
| **4.7** | `EmrPreview.js`：统一重新生成 / 保存 / 历史 / 加载 | 60 分钟 | 全流程走通 |
| **4.8** | `ChatArea.js`：字段描述从 registry 读取，`_tryParseEMR` 按 storeKey 分发 | 45 分钟 | AI 修改正确更新 |
| **4.9** | CSS：加双层标签样式，修复细节 | 45 分钟 | 视觉交互顺滑 |

### 阶段五：回归测试与文档（约 4 小时）

| 子阶段 | 工作内容 | 预估时间 | 交付物 |
|---|---|---|---|
| **5.1** | 首次病程录 + 主治查房回归（生成 / 编辑 / 保存 / 历史 / 加载） | 45 分钟 | 通过 |
| **5.2** | 主任查房 + 术前小结 + 术前讨论回归（上下文继承） | 45 分钟 | 通过 |
| **5.3** | 手术记录 + 出院小结回归（依赖传递） | 45 分钟 | 通过 |
| **5.4** | 新类型：同意书（手术 / 输血 / 麻醉）生成保存 | 45 分钟 | 通过 |
| **5.5** | 新类型：护理记录（评估 / 计划 / 记录单）生成保存 | 45 分钟 | 通过 |
| **5.6** | 配置器全流程 + AGENTS.md 更新 | 30 分钟 | 通过 |

---

## 7. 数据库迁移

### 7.1 Schema 变更

```sql
ALTER TABLE records ADD COLUMN category TEXT DEFAULT 'clinicalRecords';
```

### 7.2 数据回填

```javascript
// 启动时执行
db._db.exec("UPDATE records SET category = 'clinicalRecords' WHERE category IS NULL OR category = ''");
```

### 7.3 兼容性

- 旧记录 `content` JSON 保持不变
- 旧记录读取时按 `type` 找 registry typeConfig，字段缺失显示为空
- 保存旧记录时按新 registry 字段重建 `content`

---

## 8. 风险与回滚

| 风险 | 缓解措施 |
|---|---|
| 旧 7 类型生成效果变化 | 保留原有 templateKey 和 mock 策略，端到端回归 |
| Registry 格式错误导致崩溃 | 保存前校验；启动时读取失败回退默认 registry |
| 自定义字段过多导致 prompt 超长 | 限制字段数量和 description 长度 |
| 前端渲染性能下降 | registry 只加载一次缓存；订阅精确到 activeTab |
| 数据库迁移失败 | 迁移脚本 try/catch；不影响已有数据 |

### 回滚方案

1. 从 settings 表删除 `record_registry` 项，回退到默认 registry
2. 如需完全回滚代码，通过 git 恢复
3. 实施前备份 `data/emr-local.db`

---

## 9. 验收标准

1. 首页显示一级标签（临床医师病历 / 同意书 / 护理记录），点击切换二级标签
2. 旧 7 个病历类型的生成、编辑、保存、历史、加载行为与改造前一致
3. 同意书和护理记录的示例类型可正常生成、编辑、保存
4. 配置器可独立管理一级分类、二级类型、字段，保存后首页实时生效
5. 新增一个自定义类型无需修改任何代码即可使用
6. 所有 AI 调用走统一端点 `POST /api/records/:typeId/generate`
7. mock 模式离线可用

---

## 10. 总时间概览

| 阶段 | 子阶段数 | 预估时间 |
|---|---|---|
| 阶段一：Registry 数据层 + API | 6 个 | 约 4 小时 |
| 阶段二：AI 与 Mock 统一 | 6 个 | 约 4.5 小时 |
| 阶段三：配置器 UI | 7 个 | 约 5.5 小时 |
| 阶段四：首页双层标签改造 | 9 个 | 约 7 小时 |
| 阶段五：回归测试与文档 | 6 个 | 约 4 小时 |

**总计：34 个子阶段，约 25 小时。**

每个子阶段独立可验证，可随时叫停或调整优先级。

---

*文档版本：kimi27 版 · 方案 2 · 2026-06-14*
