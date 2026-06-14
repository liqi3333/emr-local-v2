/**
 * AI Mock Service
 *
 * Provides mock responses when no API key is configured.
 * Used for offline/development mode.
 *
 * Exports:
 *   mockCallAI(messages) → string
 *   mockStreamAI(messages) → AsyncGenerator<string>
 *   mockGenerate(typeConfig, disease, context) → string
 */

const { getTemplate, getAttendingTemplate, getChiefTemplate, getPreopTemplate, getDiscussionTemplate, getSurgeryTemplate, getDischargeTemplate, getConsentTemplate, getNursingTemplate } = require("../data/templates");

// ──────────────────────────────────────────────
//  Strategy Registry
// ──────────────────────────────────────────────

const MOCK_STRATEGIES = new Map();

/**
 * Extract disease name from prompt text.
 * Looks for the pattern 请为"XXX"生成... in user messages,
 * then falls back to Chinese text in quotes, then 疾病XXX.
 */
function extractDisease(text) {
  // Primary: look for 请为"XXX"生成 pattern (user message format)
  const userMatch = text.match(/请为["\u201c\u201d"]([\u4e00-\u9fff][^\u201c\u201d"]+)["\u201c\u201d"]生成/);
  if (userMatch) return userMatch[1].trim();

  // Fallback: Chinese text in quotes (but skip JSON field descriptions)
  const chineseMatch = text.match(/["\u201c\u201d"]([\u4e00-\u9fff]{2,10})["\u201c\u201d"]/);
  if (chineseMatch) return chineseMatch[1].trim();

  return "示例疾病";
}

/**
 * Generate mock attending round response.
 * Inherits content from emrData if available.
 */
function mockAttendingRound(text) {
  const disease = extractDisease(text);

  let emrData = {};
  try {
    const jsonMatch = text.match(/\{[\s\S]*"chief"[\s\S]*\}/);
    if (jsonMatch) {
      emrData = JSON.parse(jsonMatch[0]);
    }
  } catch { /* ignore parse errors */ }

  const summary = emrData.chief
    ? `1. 患者信息：患者因"${emrData.chief}"入院\n2. 入院诊断：${emrData.diag || disease}\n3. 主诉：${emrData.chief}\n4. 现病史：${(emrData.hpi || "").slice(0, 100)}...\n5. 查体：${(emrData.exam || "").slice(0, 80)}...\n6. 辅查：${(emrData.lab || "").slice(0, 80)}...\n7. 目前治疗：待完善`
    : `1. 患者信息：患者入院\n2. 入院诊断：${disease}\n3. 主诉：待补充\n4. 现病史：待补充\n5. 查体：待补充\n6. 辅查：待补充\n7. 目前治疗：待完善`;

  const diagnosis = emrData.diag
    ? `1. ${emrData.diag}\n2. 伴发诊断：待补充`
    : `${disease}`;

  return JSON.stringify({
    supplementHistory: emrData.hpi ? `根据病史补充：${emrData.hpi.slice(0, 100)}...` : '无特殊补充',
    summary,
    diagnosis,
    analysis: `1. 本病诊断依据：结合病史、查体、辅查综合分析\n2. 鉴别诊断：需与相关疾病鉴别\n3. 病情评估：需进一步评估\n4. 治疗反应：待观察`,
    treatment: `1. 完善相关检查\n2. 根据病情调整治疗方案\n3. 加强病情观察\n4. 必要时请相关科室会诊`,
    signed: "",
  });
}

/**
 * Generate mock first course EMR response.
 * Tries professional templates first, falls back to generic mock.
 */
function mockFirstCourse(text) {
  const disease = extractDisease(text);

  const template = getTemplate(disease);
  if (template) {
    return JSON.stringify(template);
  }

  return JSON.stringify({
    chief: `${disease}患者因「腹痛」就诊，疼痛位于右下腹，呈持续性钝痛，伴恶心、呕吐。`,
    hpi: `患者于3天前无明显诱因出现上腹部隐痛，1天前转移至右下腹，呈持续性钝痛，伴恶心、呕吐2次，为胃内容物。无畏寒、发热。查体：T 37.8℃，右下腹麦氏点压痛阳性，反跳痛阳性。`,
    past: "既往体健，否认高血压、糖尿病史。否认手术外伤史。否认药物过敏史。",
    exam: "T 37.8℃ P 88次/分 R 20次/分 BP 120/80mmHg。腹部平坦，未见胃肠蠕动波及腹壁静脉曲张。右下腹麦氏点压痛阳性，反跳痛阳性，腹肌稍紧张。结肠充气试验阳性。",
    lab: "血常规：WBC 12.5×10^9/L，NEUT% 85%。CRP 35mg/L。腹部B超提示：阑尾增粗，直径约0.8cm，壁厚约0.3cm，可见粪石。",
    diag: disease,
    diff: "1. 急性胃肠炎\n2. 右侧输尿管结石\n3. 异位妊娠破裂（育龄期女性）\n4. 肠系膜淋巴结炎",
    plan: "1. 完善术前检查：凝血功能、心电图、胸片\n2. 急诊行腹腔镜阑尾切除术\n3. 术后抗感染治疗：头孢替安 2g ivgtt bid\n4. 术后禁食、补液、对症支持治疗",
  });
}

/**
 * Generate mock chief round response.
 */
function mockChiefRound(text) {
  const disease = extractDisease(text);

  const template = getChiefTemplate(disease);
  if (template) {
    return JSON.stringify(template);
  }

  return JSON.stringify({
    chiefSummary: `1. 患者基本信息：待补充\n2. 入院诊断：${disease}\n3. 主诉：待补充\n4. 现病史摘要：待补充\n5. 专科查体要点：待补充\n6. 辅助检查关键阳性结果：待补充\n7. 目前治疗方案及效果：待补充`,
    chiefDiagnosis: disease,
    chiefAnalysis: `1. 本病诊断依据：结合病史、查体、辅查综合分析\n2. 鉴别诊断：需与相关疾病鉴别\n3. 病情严重程度评估：待进一步评估\n4. 治疗反应评估：待观察`,
    chiefTreatment: `1. 完善相关检查\n2. 根据病情调整治疗方案\n3. 加强病情观察\n4. 必要时请相关科室会诊`,
    chiefSigned: "",
  });
}

/**
 * Generate mock preop summary response.
 */
function mockPreop(text) {
  const disease = extractDisease(text);

  const template = getPreopTemplate(disease);
  if (template) {
    return JSON.stringify(template);
  }

  return JSON.stringify({
    preopDiagnosis: disease,
    preopIndication: `1. 患者发现${disease}，诊断明确\n2. 具有手术指征\n3. 无明显手术禁忌症`,
    preopPlan: `1. 手术名称：待确定\n2. 麻醉方式：待确定\n3. 手术目的：修补缺损\n4. 手术风险：出血、感染等\n5. 预计手术时间：待定\n6. 预计住院时间：待定`,
    preopPreparation: `1. 完善术前检查：血常规、凝血功能、心电图\n2. 备皮\n3. 禁食6-8小时\n4. 禁饮4小时\n5. 签署手术知情同意书`,
    preopRisk: `1. 麻醉风险：待评估\n2. 手术风险：出血、感染\n3. 术后风险：切口感染\n4. 患者一般情况：待评估\n5. 风险评估：待定`,
    preopSigned: "",
  });
}

/**
 * Generate mock discussion response.
 */
function mockDiscussion(text) {
  const disease = extractDisease(text);

  const template = getDiscussionTemplate(disease);
  if (template) {
    return JSON.stringify(template);
  }

  return JSON.stringify({
    discussionParticipants: "主持人：XXX主治医师\n参加人员：XXX住院医师、XXX护士长",
    discussionCaseSummary: `患者因${disease}入院，诊断明确，需行手术治疗。`,
    discussionDiagnosis: disease,
    discussionContent: `住院医师汇报病史：患者诊断明确。\n主治医师分析：诊断明确，具有手术指征，拟行手术治疗。\n护士长补充：术前宣教到位，准备完善。`,
    discussionConclusion: `1. 诊断：${disease}\n2. 治疗方案：手术治疗\n3. 术前准备：完善检查，备皮，禁食\n4. 术后处理：抗感染，对症治疗`,
    discussionSigned: "",
  });
}

/**
 * Generate mock surgery record response.
 */
function mockSurgery(text) {
  const disease = extractDisease(text);

  const template = getSurgeryTemplate(disease);
  if (template) {
    return JSON.stringify(template);
  }

  return JSON.stringify({
    surgeryName: `${disease}手术`,
    surgerySurgeon: "",
    surgeryAssistant: "",
    surgeryAnesthesia: "椎管内麻醉",
    surgeryProcess: `1. 麻醉成功后，患者取合适体位，常规消毒铺巾。\n2. 逐层切开，显露术野。\n3. 探查病变部位，行相应手术操作。\n4. 逐层缝合，手术结束。`,
    surgeryFindings: `术中见：病变部位如术前诊断，手术顺利，术中出血约少量。`,
    surgerySigned: "",
  });
}

/**
 * Generate mock discharge summary response.
 */
function mockDischarge(text) {
  const disease = extractDisease(text);

  const template = getDischargeTemplate(disease);
  if (template) {
    return JSON.stringify(template);
  }

  return JSON.stringify({
    dischargeAdmissionDate: "____年____月____日",
    dischargeDate: "____年____月____日",
    dischargeDiagnosis: disease,
    dischargeTreatment: `患者入院后完善相关检查，明确诊断后行手术治疗，术后予抗感染、止痛、补液等对症治疗。`,
    dischargeOutcome: `术后患者一般情况良好，切口愈合良好，无红肿渗液，恢复正常。`,
    dischargeAdvice: `1. 注意休息，避免剧烈运动\n2. 保持大便通畅\n3. 切口保持清洁干燥\n4. 如出现异常情况及时就诊\n5. 术后复查`,
    dischargeSigned: "",
  });
}

/**
 * Generate mock surgery consent response.
 */
function mockSurgeryConsent(text) {
  const disease = extractDisease(text);
  const template = getConsentTemplate('surgeryConsent', disease);
  if (template) return JSON.stringify(template);

  return JSON.stringify({
    surgeryName: `${disease}手术`,
    surgeryIndication: `1. 患者诊断明确，具有手术指征\n2. 无明显手术禁忌症`,
    surgeryRisks: `1. 出血\n2. 感染\n3. 损伤周围组织\n4. 麻醉意外\n5. 复发`,
    alternatives: `1. 保守治疗：疝带压迫\n2. 传统疝修补术\n3. 腹腔镜疝修补术`,
    patientSignature: "",
    consentDate: "____年____月____日",
  });
}

/**
 * Generate mock blood transfusion consent response.
 */
function mockBloodTransfusionConsent(text) {
  const disease = extractDisease(text);
  const template = getConsentTemplate('bloodTransfusionConsent', disease);
  if (template) return JSON.stringify(template);

  return JSON.stringify({
    bloodType: "待查",
    transfusionReason: `术中可能出现出血，需输血补充血容量`,
    bloodProducts: `1. 悬浮红细胞X单位`,
    transfusionRisks: `1. 过敏反应\n2. 溶血反应\n3. 感染风险\n4. 循环超负荷`,
    alternatives: `1. 自体输血\n2. 止血药物应用`,
    patientSignature: "",
    consentDate: "____年____月____日",
  });
}

/**
 * Generate mock anesthesia consent response.
 */
function mockAnesthesiaConsent(text) {
  const disease = extractDisease(text);
  const template = getConsentTemplate('anesthesiaConsent', disease);
  if (template) return JSON.stringify(template);

  return JSON.stringify({
    anesthesiaType: "椎管内麻醉",
    surgeryName: `${disease}手术`,
    anesthesiaRisks: `1. 呼吸系统风险\n2. 心血管系统风险\n3. 神经系统风险\n4. 消化系统风险\n5. 过敏反应`,
    alternatives: `1. 全身麻醉\n2. 局部浸润麻醉`,
    patientCondition: "ASA II级",
    patientSignature: "",
    consentDate: "____年____月____日",
  });
}

/**
 * Generate mock nursing assessment response.
 */
function mockNursingAssessment(text) {
  const disease = extractDisease(text);
  const template = getNursingTemplate('nursingAssessment', disease);
  if (template) return JSON.stringify(template);

  return JSON.stringify({
    admissionTime: "____年____月____日 ____时____分",
    vitalSigns: "T 36.5℃ P 78次/分 R 18次/分 BP 120/80mmHg 疼痛评分0分",
    skinCondition: "皮肤完整，无破损",
    mobility: "活动自如",
    nutrition: "营养中等",
    mentalStatus: "神志清楚，精神可",
    riskAssessment: "1. 跌倒风险：低危\n2. 压疮风险：低危\n3. 管道滑脱风险：无",
    nursingDiagnosis: `1. 疼痛——与疾病有关\n2. 焦虑——与担心预后有关`,
  });
}

/**
 * Generate mock nursing plan response.
 */
function mockNursingPlan(text) {
  const disease = extractDisease(text);
  const template = getNursingTemplate('nursingPlan', disease);
  if (template) return JSON.stringify(template);

  return JSON.stringify({
    nursingDiagnosis: `1. 疼痛——与疾病有关\n2. 焦虑——与担心预后有关`,
    goals: `1. 短期目标：疼痛缓解、焦虑减轻\n2. 长期目标：康复出院`,
    interventions: `1. 疼痛护理\n2. 心理护理\n3. 健康教育`,
    evaluation: `1. 疼痛评分≤3分\n2. 患者满意度≥90%`,
    healthEducation: `1. 疾病知识\n2. 术后注意事项\n3. 复查安排`,
    dischargePlan: `1. 出院标准\n2. 出院指导\n3. 随访安排`,
  });
}

/**
 * Generate mock nursing record sheet response.
 */
function mockNursingRecordSheet(text) {
  const disease = extractDisease(text);
  const template = getNursingTemplate('nursingRecordSheet', disease);
  if (template) return JSON.stringify(template);

  return JSON.stringify({
    recordDate: "____年____月____日",
    recordTime: "____时____分",
    vitalSigns: "T 36.5℃ P 78次/分 R 18次/分 BP 120/80mmHg",
    intakeOutput: "入量：输液Xml；出量：尿量Xml",
    medication: "遵医嘱用药",
    nursingInterventions: "协助患者活动，观察病情变化",
    patientCondition: "患者一般情况可，生命体征平稳",
    nurseSignature: "",
  });
}

// Register old mock functions as strategies
MOCK_STRATEGIES.set('emr', mockFirstCourse);
MOCK_STRATEGIES.set('attending', mockAttendingRound);
MOCK_STRATEGIES.set('chief', mockChiefRound);
MOCK_STRATEGIES.set('preop', mockPreop);
MOCK_STRATEGIES.set('discussion', mockDiscussion);
MOCK_STRATEGIES.set('surgery', mockSurgery);
MOCK_STRATEGIES.set('discharge', mockDischarge);
MOCK_STRATEGIES.set('surgeryConsent', mockSurgeryConsent);
MOCK_STRATEGIES.set('bloodTransfusionConsent', mockBloodTransfusionConsent);
MOCK_STRATEGIES.set('anesthesiaConsent', mockAnesthesiaConsent);
MOCK_STRATEGIES.set('nursingAssessment', mockNursingAssessment);
MOCK_STRATEGIES.set('nursingPlan', mockNursingPlan);
MOCK_STRATEGIES.set('nursingRecordSheet', mockNursingRecordSheet);

/**
 * Build generic mock response from registry fields.
 * @param {Array} fields - Array of { key, label, description }
 * @param {string} disease - Disease name
 * @returns {string} JSON string
 */
function buildGenericMock(fields, disease) {
  const result = {};
  for (const field of fields || []) {
    if (field.enabled === false) continue;
    result[field.key] = `【${field.label}】${disease}患者相关${field.label}内容（模拟）`;
  }
  return JSON.stringify(result);
}

/**
 * Mock generate by typeConfig — unified entry point for new generic endpoint.
 * @param {Object} typeConfig - Registry type config
 * @param {string} disease - Disease name
 * @param {Object} context - Additional context
 * @returns {string} JSON string
 */
function mockGenerate(typeConfig, disease, context) {
  const templateKey = typeConfig.templateKey;

  // Layer 1: Use registered strategy (old 7 types)
  const strategy = MOCK_STRATEGIES.get(templateKey);
  if (strategy) {
    // Build a synthetic prompt for the strategy to parse
    const syntheticText = `请为"${disease}"生成${typeConfig.label}。`;
    return strategy(syntheticText);
  }

  // Layer 2: Generic mock for new types
  return buildGenericMock(typeConfig.fields, disease);
}

/**
 * Mock non-streaming AI call (backward compatible).
 * @param {Array<{role: string, content: string}>} messages
 * @returns {string}
 */
function mockCallAI(messages) {
  const text = messages
    .filter((m) => m.role === "user" || m.role === "system")
    .map((m) => m.content)
    .join("\n");

  // New tab-specific generation endpoints (most specific first)
  if (text.includes("术前讨论") && text.includes("讨论内容")) {
    return mockDiscussion(text);
  }

  if (text.includes("术前小结") && text.includes("术前诊断")) {
    return mockPreop(text);
  }

  if (text.includes("手术记录") && text.includes("手术经过")) {
    return mockSurgery(text);
  }

  if (text.includes("出院小结") && text.includes("出院诊断")) {
    return mockDischarge(text);
  }

  // Original endpoints
  if (text.includes("主任医师") && text.includes("查房")) {
    return mockChiefRound(text);
  }

  if (text.includes("查房病程记录")) {
    return mockAttendingRound(text);
  }

  if (text.includes("电子病历") || text.includes("主诉") || text.includes("chief")) {
    return mockFirstCourse(text);
  }

  return `（模拟回复）您的问题是：${text.slice(0, 100)}。请在 .env 中配置 API Key 或通过前端界面添加模型以获得 AI 真实回复。`;
}

/**
 * Mock streaming AI call — yields chunks progressively.
 * @param {Array<{role: string, content: string}>} messages
 * @yields {string}
 */
async function* mockStreamAI(messages) {
  const full = mockCallAI(messages);
  const chunkSize = 3;
  for (let i = 0; i < full.length; i += chunkSize) {
    yield full.slice(i, i + chunkSize);
    await new Promise((r) => setTimeout(r, 15));
  }
}

module.exports = { mockCallAI, mockStreamAI, mockGenerate, buildGenericMock, MOCK_STRATEGIES };
