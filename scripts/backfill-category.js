#!/usr/bin/env node
/**
 * Backfill `category` column for legacy records.
 *
 * Before the B1 fix, POST /api/records never passed `category`, so
 * database.saveRecord fell back to the default 'clinicalRecords' for every
 * record. Consent forms (surgeryConsent, bloodTransfusionConsent,
 * anesthesiaConsent) and nursing records (nursingAssessment, nursingPlan,
 * nursingRecordSheet) were therefore misfiled as clinicalRecords.
 *
 * This script reads the current registry, builds a type→categoryId map, and
 * corrects any record whose category doesn't match the registry's authoritative
 * category for its type.
 *
 * Usage:
 *   node scripts/backfill-category.js           # dry-run (preview only)
 *   node scripts/backfill-category.js --apply   # execute UPDATEs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../data/emr-local.db');
const REGISTRY = require('../src/data/recordRegistry').DEFAULT_REGISTRY;

// Build type → categoryId map from the default registry.
// NOTE: we use DEFAULT_REGISTRY because the live registry (stored in SQLite
// settings) may have been customized, but the category mapping for built-in
// types is stable. For custom types, the live registry should be consulted;
// this script focuses on fixing the legacy misfiling of built-in types.
const TYPE_TO_CATEGORY = {};
for (const cat of REGISTRY.categories) {
  for (const t of cat.types) {
    TYPE_TO_CATEGORY[t.id] = cat.id;
  }
}

function main() {
  const apply = process.argv.includes('--apply');
  const db = new Database(DB_PATH);

  const rows = db.prepare('SELECT id, type, category FROM records').all();
  const mismatches = [];
  const unknown = [];

  for (const r of rows) {
    const expected = TYPE_TO_CATEGORY[r.type];
    if (!expected) {
      unknown.push(r);
      continue;
    }
    if (r.category !== expected) {
      mismatches.push({ id: r.id, type: r.type, from: r.category, to: expected });
    }
  }

  console.log(`Scanned ${rows.length} records.`);
  console.log(`Mismatches found: ${mismatches.length}`);
  if (unknown.length > 0) {
    console.log(`Unknown types (not in default registry): ${unknown.length}`);
    for (const u of unknown) console.log(`  id=${u.id} type=${u.type} category=${u.category}`);
  }

  if (mismatches.length === 0) {
    console.log('Nothing to fix. All categories are correct.');
    db.close();
    return;
  }

  console.log('\n--- Planned changes ---');
  for (const m of mismatches) {
    console.log(`  ${m.id}  type=${m.type}  ${m.from} → ${m.to}`);
  }

  if (!apply) {
    console.log('\nDry-run mode. No changes made.');
    console.log('Run with --apply to execute.');
    db.close();
    return;
  }

  const update = db.prepare('UPDATE records SET category = ? WHERE id = ?');
  const tx = db.transaction(() => {
    let n = 0;
    for (const m of mismatches) {
      update.run(m.to, m.id);
      n++;
    }
    return n;
  });
  const n = tx();
  console.log(`\nApplied ${n} updates.`);
  db.close();
}

main();
