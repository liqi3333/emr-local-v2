/**
 * 普外科疾病目录（2级分类）
 * Each category has a name, colors, and list of diseases.
 */
export const DISEASE_CATEGORIES = [
  {
    name: '腹部急症',
    icon: '🔥',
    color: '#fee2e2',
    textColor: '#b91c1c',
    bgColor: '#fef2f2',
    diseases: ['急性阑尾炎', '急性胆囊炎', '急性胰腺炎', '消化道穿孔', '肠梗阻'],
  },
  {
    name: '肝胆胰',
    icon: '🫁',
    color: '#dcfce7',
    textColor: '#166534',
    bgColor: '#f0fdf4',
    diseases: ['胆囊结石', '胆总管结石', '肝囊肿', '肝癌', '胰腺癌'],
  },
  {
    name: '胃肠',
    icon: '🫃',
    color: '#fef3c7',
    textColor: '#854d0e',
    bgColor: '#fefce8',
    diseases: ['胃溃疡穿孔', '结肠癌', '直肠癌', '肠套叠', '憩室炎'],
  },
  {
    name: '甲状腺',
    icon: '🔬',
    color: '#e0e7ff',
    textColor: '#3730a3',
    bgColor: '#eef2ff',
    diseases: ['甲状腺结节', '甲状腺癌', '甲亢', '桥本甲状腺炎'],
  },
  {
    name: '乳腺',
    icon: '🎗️',
    color: '#fce7f3',
    textColor: '#9d174d',
    bgColor: '#fdf4ff',
    diseases: ['乳腺癌', '乳腺纤维腺瘤', '乳腺增生', '乳腺炎'],
  },
  {
    name: '肛肠',
    icon: '🩺',
    color: '#f3e8ff',
    textColor: '#6b21a8',
    bgColor: '#faf5ff',
    diseases: ['痔疮', '肛瘘', '肛裂', '直肠脱垂'],
  },
  {
    name: '血管',
    icon: '❤️',
    color: '#e0f2fe',
    textColor: '#0369a1',
    bgColor: '#f0f9ff',
    diseases: ['下肢静脉曲张', '动脉硬化闭塞症', '深静脉血栓'],
  },
  {
    name: '疝气',
    icon: '⚕️',
    color: '#fefce8',
    textColor: '#854d0e',
    bgColor: '#fefce8',
    diseases: ['腹股沟疝', '股疝', '脐疝', '切口疝', '造口旁疝'],
  },
  {
    name: '创伤',
    icon: '🚑',
    color: '#fee2e2',
    textColor: '#9f1239',
    bgColor: '#fef2f2',
    diseases: ['软组织损伤', '骨折', '烧伤'],
  },
  {
    name: '肿瘤',
    icon: '🧬',
    color: '#f0fdf4',
    textColor: '#166534',
    bgColor: '#f0fdf4',
    diseases: ['腹膜后肿瘤', '淋巴瘤'],
  },
];

/** Flatten disease list for search */
export function getAllDiseases() {
  return DISEASE_CATEGORIES.flatMap((cat) =>
    cat.diseases.map((d) => ({ name: d, category: cat.name }))
  );
}
