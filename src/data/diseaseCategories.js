/**
 * Default disease categories (2-level: category -> diseases).
 *
 * Each category has a unique id, name, icon, color triplet, sortOrder,
 * and a list of diseases (each with a unique id, name, sortOrder).
 *
 * Disease *names* are the user-facing / AI-facing value; *ids* are used
 * only by the catalog management layer.
 *
 * This is the server-side source of truth. The frontend loads the catalog
 * dynamically from /api/diseases and falls back to a trimmed copy on failure.
 */

const DEFAULT_DISEASE_CATEGORIES = [
  {
    id: '27245344-590a-4de9-834d-9dd7368705ef',
    name: '腹部急症',
    icon: '🔥',
    color: '#fee2e2',
    textColor: '#b91c1c',
    bgColor: '#fef2f2',
    sortOrder: 0,
    diseases: [
      { id: 'f707e557-84ff-4df9-ae2a-f2a09cded5ba', name: '急性阑尾炎', sortOrder: 0 },
      { id: 'a7ad104e-df88-4252-a15a-ceaf69a58b41', name: '急性胆囊炎', sortOrder: 1 },
      { id: '55cf544f-410b-450e-a0e8-d1a55333ecc2', name: '急性胰腺炎', sortOrder: 2 },
      { id: '3b2ca715-9243-48a3-8c8d-c47382f50144', name: '消化道穿孔', sortOrder: 3 },
      { id: '411ca48d-90a0-414b-8973-eecc690062e2', name: '肠梗阻', sortOrder: 4 },
    ],
  },
  {
    id: '2b970f53-a7e6-4051-90d6-95c818da328b',
    name: '肝胆胰',
    icon: '🫁',
    color: '#dcfce7',
    textColor: '#166534',
    bgColor: '#f0fdf4',
    sortOrder: 1,
    diseases: [
      { id: 'b9b9b72a-95c4-4699-b709-8a753359362d', name: '胆囊结石', sortOrder: 0 },
      { id: 'adc27074-797c-4cf7-b487-9d860ccbebb2', name: '胆总管结石', sortOrder: 1 },
      { id: '5ff1ce95-ba40-4769-ba57-7dd4ee78d9fe', name: '肝囊肿', sortOrder: 2 },
      { id: 'ff8b3fb1-d895-4c05-b70f-fd9a859b29f5', name: '肝癌', sortOrder: 3 },
      { id: 'b6dd9888-0740-4d7a-ace9-ca8565fd1799', name: '胰腺癌', sortOrder: 4 },
    ],
  },
  {
    id: 'dd2e463a-0600-4dea-b21c-e909dc8ab41f',
    name: '胃肠',
    icon: '🫃',
    color: '#fef3c7',
    textColor: '#854d0e',
    bgColor: '#fefce8',
    sortOrder: 2,
    diseases: [
      { id: 'ebd9a3f4-c113-4d16-b552-ee38a9cfcaae', name: '胃溃疡穿孔', sortOrder: 0 },
      { id: 'bace522e-108e-47d1-8848-bf8254e67e05', name: '结肠癌', sortOrder: 1 },
      { id: '8bbecfa7-5872-4488-870b-420a454f9e96', name: '直肠癌', sortOrder: 2 },
      { id: 'ada73056-b568-48bf-825b-7af9922c613c', name: '肠套叠', sortOrder: 3 },
      { id: 'fddb6a5a-f529-4c7f-8ae8-0e24a1f777ff', name: '憩室炎', sortOrder: 4 },
    ],
  },
  {
    id: '17cbc83f-e51b-4a4d-bc4e-740fcd7bc0b6',
    name: '甲状腺',
    icon: '🔬',
    color: '#e0e7ff',
    textColor: '#3730a3',
    bgColor: '#eef2ff',
    sortOrder: 3,
    diseases: [
      { id: '8ce660cf-0c32-4fb6-be72-96048fa1ba08', name: '甲状腺结节', sortOrder: 0 },
      { id: 'f06989c3-feb8-44c8-bb89-4bca999e7d47', name: '甲状腺癌', sortOrder: 1 },
      { id: '1f84ca5f-d1c0-44d7-8fe5-1d220e47cad3', name: '甲亢', sortOrder: 2 },
      { id: '7ef35989-3ed0-4e0e-8ed3-6cae232cbd7b', name: '桥本甲状腺炎', sortOrder: 3 },
    ],
  },
  {
    id: 'b908e10d-8cff-4554-af88-3b2227fda5f2',
    name: '乳腺',
    icon: '🎗️',
    color: '#fce7f3',
    textColor: '#9d174d',
    bgColor: '#fdf4ff',
    sortOrder: 4,
    diseases: [
      { id: 'e1dec8db-2053-42eb-b388-90ebabfa65d0', name: '乳腺癌', sortOrder: 0 },
      { id: '49656ad2-1232-4365-a976-ee2a9fe19970', name: '乳腺纤维腺瘤', sortOrder: 1 },
      { id: 'b0b17e4a-9bb9-4819-81c4-ffe2677e6614', name: '乳腺增生', sortOrder: 2 },
      { id: '136312fc-69c1-4950-ab9b-aef35a815576', name: '乳腺炎', sortOrder: 3 },
    ],
  },
  {
    id: '0f9be672-d73a-419d-b61a-fe56960602b7',
    name: '肛肠',
    icon: '🩺',
    color: '#f3e8ff',
    textColor: '#6b21a8',
    bgColor: '#faf5ff',
    sortOrder: 5,
    diseases: [
      { id: 'ce10db5d-87ba-43ce-9c84-3e4c44a9a068', name: '痔疮', sortOrder: 0 },
      { id: '4df6dbdb-8018-47c0-b6cc-8957ce9d706b', name: '肛瘘', sortOrder: 1 },
      { id: '97c4262f-9f5d-47e6-9285-38294ee95ec7', name: '肛裂', sortOrder: 2 },
      { id: '60021b42-7bc9-4e47-9ab9-c4d3274a34d1', name: '直肠脱垂', sortOrder: 3 },
    ],
  },
  {
    id: '23a43ba5-25db-4f22-aae1-16587c8e747d',
    name: '血管',
    icon: '❤️',
    color: '#e0f2fe',
    textColor: '#0369a1',
    bgColor: '#f0f9ff',
    sortOrder: 6,
    diseases: [
      { id: '5cccab40-3551-4dc1-8cd3-d83cce2ed6d0', name: '下肢静脉曲张', sortOrder: 0 },
      { id: '27f36a31-3b1d-4430-9447-6c03b873f666', name: '动脉硬化闭塞症', sortOrder: 1 },
      { id: '2b1a3fd8-b2b3-4f1d-99d8-9091c6b04ee7', name: '深静脉血栓', sortOrder: 2 },
    ],
  },
  {
    id: '64b059eb-c205-4865-8be2-aa0d5cb97a91',
    name: '疝气',
    icon: '⚕️',
    color: '#fefce8',
    textColor: '#854d0e',
    bgColor: '#fefce8',
    sortOrder: 7,
    diseases: [
      { id: '913de40d-7b36-40ee-989c-6037df0fcaea', name: '腹股沟疝', sortOrder: 0 },
      { id: '20e3d4c7-6df7-49bf-b3f7-90312e0d5e1c', name: '股疝', sortOrder: 1 },
      { id: '775977ae-3fd6-46ac-adb1-defe42b0e7c3', name: '脐疝', sortOrder: 2 },
      { id: 'edaf4d6d-367f-4c93-b176-86888e449cb4', name: '切口疝', sortOrder: 3 },
      { id: 'b5fe7dd3-ec8c-4466-bedd-2c24b154c900', name: '造口旁疝', sortOrder: 4 },
    ],
  },
  {
    id: 'dd4fff58-ebe1-4d05-bd91-bd285c692d95',
    name: '创伤',
    icon: '🚑',
    color: '#fee2e2',
    textColor: '#9f1239',
    bgColor: '#fef2f2',
    sortOrder: 8,
    diseases: [
      { id: '83a61745-7ec2-4d05-a36c-d2bde30d77c3', name: '软组织损伤', sortOrder: 0 },
      { id: '76681450-3fb4-4945-8a1f-ff7f948265fa', name: '骨折', sortOrder: 1 },
      { id: 'dadfd756-a75d-405d-8945-558bbba20b84', name: '烧伤', sortOrder: 2 },
    ],
  },
  {
    id: 'f191e27d-e8f0-460c-b279-e7ed4125d0d5',
    name: '肿瘤',
    icon: '🧬',
    color: '#f0fdf4',
    textColor: '#166534',
    bgColor: '#f0fdf4',
    sortOrder: 9,
    diseases: [
      { id: '9c092f69-f9b5-48ad-a49d-57a8da8c7f07', name: '腹膜后肿瘤', sortOrder: 0 },
      { id: '04912dfc-8405-4b47-9468-f4d5fc5eb793', name: '淋巴瘤', sortOrder: 1 },
    ],
  },
];

module.exports = { DEFAULT_DISEASE_CATEGORIES };
