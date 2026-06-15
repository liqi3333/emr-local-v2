# AI辅助病历系统参考查询建议

## 一、用户需求记录

> **原始问题**：这个病历系统的 app，GitHub 上面有类似的项目吗？
>
> **用户目的**：做参考。
>
> **后续聚焦方向**：AI 辅助电子病历结构化生成、提示词管理方面的参考。

---

## 二、GitHub 类似项目查询结果

### 1. 国际知名 EMR 项目

| 项目 | 技术栈 | Stars | 参考价值 |
|------|--------|-------|---------|
| **OpenEMR** (openemr/openemr) | PHP | 5.2k | 最流行开源 EMR，功能最全，数据库 schema 设计参考 |
| **Fasten** (fastenhealth/fasten-onprem) | Go | 2.8k | 自托管个人/家庭健康记录，本地优先架构参考 |
| **Juno EMR** (junoemr/junoemr) | Java | 13 | McMaster 大学分支，稳定性导向 |
| **HealthDB** (mishravikas/HealthDB) | Django | 44 | Django 简化版患者/病历 CRUD |

### 2. 与当前项目更相似的轻量项目

- **cosmos-emr-provider**（TypeScript，2 stars）
- **openish-emr**（Python，1 star）

### 3. 中文/国内 EMR 项目现状

GitHub 上中文 EMR 开源项目较少，多数是：
- OpenEMR 汉化 fork
- 医院内部项目未开源
- 小型毕设/练习项目

搜索建议：
- `电子病历系统`
- `医院信息管理系统 HIS`
- `门诊病历`
- `中医病历`

---

## 三、参考维度分类建议

### 1. 完整 EMR 架构参考

| 项目 | 推荐看哪里 |
|------|-----------|
| OpenEMR | 数据库 schema 设计、患者-病历关系、权限模型 |
| Fasten | 自托管本地优先架构、FHIR 数据导入 |
| HealthDB | Django 简化版患者/病历 CRUD |

### 2. AI 临床记录生成

- **OpenAI/Claude 医疗 prompt 示例**：prompt engineering——结构化提取主诉、现病史、鉴别诊断
- **Hippocratic AI / Nuance DAX**（商业）：产品形态参考——语音→结构化病历
- **Abridge**（商业）：AI 临床摘要的产品交互设计
- GitHub 搜索：`clinical-note-generator`、`soap-note-ai`、`medical-scribe`——有很多基于 LLM 的实验项目，值得看 prompt 模板设计

### 3. 轻量单页应用/无构建前端

当前项目走 **原生 JS + 无打包器** 路线，类似项目较少。但可看：
- **Vanilla JS SPA patterns**（非医疗）：路由、状态管理、组件化
- **local-first apps**（如 Actual Budget、Logseq）：离线优先、SQLite 同步

### 4. 中文医疗项目

GitHub 上中文 EMR 开源项目不多，建议搜索：
- `电子病历系统`
- `医院信息管理系统 HIS`
- `门诊病历`

### 5. 最值得参考的具体方向

1. **AI 结构化病历生成**：看 `soap-note-ai`、`medical-scribe-openai` 这类小项目的 prompt 模板
2. **病历数据模型**：看 OpenEMR 的 `forms` + `encounter` 表设计
3. **Registry/插件化字段**：看 FHIR 的 Resource 定义（Observation、Condition、Procedure）
4. **离线 mock/模板系统**：你已经做得不错了，OpenEMR 的 encounter template 也可参考

---

## 四、重点：AI 辅助病历结构化生成 + 提示词管理

### 推荐搜索关键词

```
medical scribe open source
clinical note generator llm
soap note ai
ehr llm structured output
ai discharge summary
medical-scribe-ai
clinical-note-generator
ehr-llm-assistant
soap-note-generator
medical-report-generator
ai-progress-note
电子病历系统
医院信息管理系统 HIS
门诊病历
```

### AI 医疗记录生成项目搜索

一般这些项目会有：
- `prompts/` 目录：按专科/病历类型分类的 prompt 文件
- `schemas/` 目录：输出 JSON schema
- `examples/` 目录：few-shot 示例
- `eval/` 目录：输出质量评测脚本

### Prompt 管理参考工具/框架

| 项目/工具 | 参考价值 |
|-----------|---------|
| **LangChain Prompt Templates** | 模板变量替换、FewShotPromptTemplate、ChatPromptTemplate |
| **PromptLayer** | prompt 版本管理、A/B 测试（商业，但思路可参考） |
| **Helicone** | prompt 版本、调用追踪、成本分析 |
| **LangSmith** | prompt 版本 + 评测 |
| **Dify / Flowise** | 可视化 prompt 编排 + 版本管理 |

### 轻量自研 Prompt 管理方案参考设计

1. **模板版本化**：每个 prompt 有 version + hash
2. **变量插值**：`{{disease}}`、`{{patientContext}}`
3. **分层模板**：系统提示 + 类型提示 + 字段描述 + 用户输入
4. **Few-shot 示例库**：按疾病分类保存示例对
5. **Prompt 效果追踪**：保存生成结果，人工标注质量，用于迭代

### 医疗结构化生成核心模式

1. **角色设定**
   ```
   你是一位经验丰富的[科室]主任医师，请基于病历资料生成...
   ```

2. **输出格式强制 JSON**
   - 用 `response_format: { type: "json_object" }`（OpenAI）
   - 或 system prompt 里明确 JSON schema + 字段说明
   - 后端清洗：`replace(/```json?/g, '').trim()`

3. **字段级指令**
   - 每个字段写清楚"要包含什么、格式要求、注意事项"
   - 例如鉴别诊断要求"列出需排除的疾病及排除依据"

4. **Few-shot 示例**
   - 常见病给 1-2 个高质量示例
   - 可显著提升输出稳定性

5. **上下文传递**
   - 首次病程录 → 查房 → 术前小结 → 手术记录 → 出院小结
   - 每一步都带上前面已生成的内容作为上下文

---

## 五、针对当前项目的升级建议

你现在的架构已经不错：

```
defaultPrompts.json（默认模板）
data/prompt-templates/（用户自定义模板）
promptTemplates.js（3 层组装逻辑）
/prompts（可视化编辑器）
```

如果要参考外部项目做升级，优先看：

1. **模板版本管理** — 类似 Dify 的版本切换
2. **按疾病/类型细分 prompt** — 当前按 type，可以细化到 disease × type
3. **Few-shot 示例管理** — 把高质量历史病历作为示例喂给模型
4. **生成结果评分/反馈循环** — 医生修改后自动沉淀为 better example

---

## 六、当前项目 Prompt 管理现状

| 组件 | 说明 |
|------|------|
| `defaultPrompts.json` | 默认提示词模板（只读，版本控制） |
| `data/prompt-templates/` | 用户自定义模板存储（JSON 文件） |
| `promptTemplates.js` | 3 层组装逻辑：现有模板 → buildFromRegistryFields 自动生成 → 错误 |
| `GET /api/prompts/templates` | 获取模板列表 |
| `POST /api/prompts/templates` | 创建/更新模板 |
| `GET /api/prompts/merged` | 获取合并后模板 |
| `POST /api/prompts/preview/:templateKey` | 预览组装后 prompt |
| `/prompts` 页面 | 可视化编辑器 |

### 可借鉴的升级路径

1. **版本管理**：给每个模板加 `version` 和 `hash` 字段，支持回滚
2. **效果追踪**：每次生成记录 prompt_id + 输出结果 + 人工评分
3. **Few-shot 注入**：从高质量历史记录中检索相似病例作为示例
4. **A/B 测试**：同一疾病随机选择不同 prompt 版本，对比效果
5. **模板分类**：按 `疾病 × 病历类型 × 版本` 组织模板
