/**
 * AI Mock Service
 *
 * Provides mock responses when no API key is configured.
 * Used for offline/development mode.
 *
 * Exports:
 *   mockCallAI(messages) → string
 *   mockStreamAI(messages) → AsyncGenerator<string>
 */

const { getTemplate } = require("../data/templates");

/**
 * Extract disease name from prompt text.
 */
function extractDisease(text) {
  const diseaseMatch =
    text.match(/["\u201c\u201d"]([^\u201c\u201d"]+)["\u201c\u201d"]/) ||
    text.match(/疾病["\u201c\u201d"]?([^，。,.！\n]+)/);
  return diseaseMatch ? diseaseMatch[1].trim() : "示例疾病";
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
 * Mock non-streaming AI call.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {string}
 */
function mockCallAI(messages) {
  const lastMsg = messages
    .filter((m) => m.role === "user" || m.role === "system")
    .pop();
  const text = lastMsg?.content || "";

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

module.exports = { mockCallAI, mockStreamAI };
