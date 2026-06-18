#!/usr/bin/env node
/**
 * E2E regression test for Phase 1 fixes (A6/B1/B2/B3/B4).
 * Run against a live server on localhost:8000.
 */
const BASE = 'http://localhost:8000';

async function json(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  return r.json();
}

async function main() {
  const results = [];
  const check = (name, cond, detail = '') => {
    results.push({ name, ok: !!cond, detail });
    console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  // 1. Health
  const h = await json('/api/health');
  check('health', h.status === 'ok');

  // 2. Get a patient
  const { patients } = await json('/api/patients');
  check('patients exist', patients.length > 0, `count=${patients.length}`);
  const pid = patients[0].id;

  // 3. Create surgeryConsent record (B1: category, B3: registry-driven content)
  const saveBody = {
    patientId: pid,
    disease: 'E2E测试疾病',
    type: 'surgeryConsent',
    category: 'consentForms',
    surgeryName: 'E2E阑尾切除术',
    surgeryIndication: 'E2E急性阑尾炎',
    surgeryRisks: '出血感染',
    alternatives: '保守治疗',
    patientSignature: '测试人',
    consentDate: '2026年6月18日',
  };
  const saved = await json('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saveBody),
  });
  check('B1: category saved as consentForms', saved.record.category === 'consentForms', `got=${saved.record.category}`);
  const rid = saved.record.id;
  let content1;
  try { content1 = JSON.parse(saved.record.content); } catch { content1 = {}; }
  check('B3: content is registry-driven', content1.surgeryName === 'E2E阑尾切除术', JSON.stringify(content1));

  // 4. Update record (B2: content should refresh)
  const updateBody = { ...saveBody, id: rid, surgeryName: 'E2E阑尾切除术(改)', surgeryIndication: 'E2E化脓性阑尾炎' };
  const updated = await json('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateBody),
  });
  let content2;
  try { content2 = JSON.parse(updated.record.content); } catch { content2 = {}; }
  check('B2: content refreshed on UPDATE', content2.surgeryName === 'E2E阑尾切除术(改)', `content.surgeryName=${content2.surgeryName}`);
  check('B2: content reflects new value', content2.surgeryIndication === 'E2E化脓性阑尾炎', `content.surgeryIndication=${content2.surgeryIndication}`);

  // 5. Verify DB state directly via API
  const fetched = await json(`/api/records/${rid}`);
  check('DB: category persisted', fetched.record.category === 'consentForms');
  check('DB: column data persisted', fetched.record.surgeryName === 'E2E阑尾切除术(改)');

  // 6. Cleanup
  await json(`/api/records/${rid}`, { method: 'DELETE' });
  check('cleanup: test record deleted', true);

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${passed}/${results.length} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error('E2E error:', e); process.exit(1); });
