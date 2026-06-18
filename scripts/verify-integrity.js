#!/usr/bin/env node
/**
 * Smoke test / integrity verification for the EMR database.
 *
 * Run after each phase to catch regressions in data integrity.
 *
 * Usage:
 *   node scripts/verify-integrity.js              # full check, exit 0 ok / 1 fail
 *   node scripts/verify-integrity.js --quiet      # only print failures
 *
 * Checks:
 *   1. Every record's `category` matches the registry's category for its type
 *   2. Every record's `content` JSON is parseable
 *   3. No orphan records (patientId must reference an existing patient)
 *   4. Every record's `type` exists in the registry
 *   5. All RECORD_DATA_COLUMNS exist in the DB schema
 *   6. For records whose content was built by _buildRecordContentFromRegistry,
 *      content keys are a subset of the registry's enabled fields
 */

const path = require('path');
const Database = require('better-sqlite3');
const { DEFAULT_REGISTRY } = require('../src/data/recordRegistry');
const { RECORD_DATA_COLUMNS } = require('../src/data/recordColumns');

const DB_PATH = path.join(__dirname, '../data/emr-local.db');

function buildTypeMap() {
  const typeMap = {};
  for (const cat of DEFAULT_REGISTRY.categories) {
    for (const t of cat.types) {
      typeMap[t.id] = { category: cat.id, fields: new Set(t.fields.map(f => f.key)) };
    }
  }
  return typeMap;
}

function main() {
  const quiet = process.argv.includes('--quiet');
  const db = new Database(DB_PATH, { readonly: true });
  const typeMap = buildTypeMap();
  const problems = [];

  // Check 5: schema columns
  const cols = new Set(db.prepare('PRAGMA table_info(records)').all().map(c => c.name));
  const missingCols = RECORD_DATA_COLUMNS.filter(c => !cols.has(c));
  if (missingCols.length > 0) {
    problems.push(`[schema] Missing RECORD_DATA_COLUMNS in DB: ${missingCols.join(', ')}`);
  }

  const records = db.prepare('SELECT * FROM records').all();
  const patients = new Set(db.prepare('SELECT id FROM patients').all().map(p => p.id));

  let catMismatches = 0;
  let unparseableContent = 0;
  let orphans = 0;
  let unknownTypes = 0;
  let contentFieldIssues = 0;

  for (const r of records) {
    // Check 1: category matches registry
    const tInfo = typeMap[r.type];
    if (tInfo) {
      if (r.category !== tInfo.category) {
        catMismatches++;
        problems.push(`[category] record ${r.id} type=${r.type} category=${r.category} expected=${tInfo.category}`);
      }
    } else {
      unknownTypes++;
      problems.push(`[type] record ${r.id} has unknown type=${r.type} (not in default registry)`);
    }

    // Check 2: content JSON parseable
    let content = null;
    try {
      content = JSON.parse(r.content || '{}');
    } catch (e) {
      unparseableContent++;
      problems.push(`[content] record ${r.id} has unparseable content: ${e.message}`);
    }

    // Check 3: no orphan
    if (!patients.has(r.patientId)) {
      orphans++;
      problems.push(`[orphan] record ${r.id} references missing patient ${r.patientId}`);
    }

    // Check 6: content keys subset of registry fields (only if type known)
    if (tInfo && content && typeof content === 'object') {
      for (const key of Object.keys(content)) {
        if (!tInfo.fields.has(key)) {
          contentFieldIssues++;
          problems.push(`[content-field] record ${r.id} type=${r.type} content has key="${key}" not in registry fields`);
        }
      }
    }
  }

  db.close();

  const ok = problems.length === 0;
  const summary = [
    `records: ${records.length}`,
    `patients: ${patients.size}`,
    `category mismatches: ${catMismatches}`,
    `unparseable content: ${unparseableContent}`,
    `orphan records: ${orphans}`,
    `unknown types: ${unknownTypes}`,
    `content field issues: ${contentFieldIssues}`,
    `missing schema cols: ${missingCols.length}`,
  ];

  if (!quiet || !ok) {
    console.log('=== EMR Integrity Check ===');
    console.log(summary.join(' | '));
    if (!ok) {
      console.log('\n--- Problems ---');
      for (const p of problems) console.log('  ' + p);
    }
    console.log(ok ? '\n✓ ALL CHECKS PASSED' : '\n✗ CHECKS FAILED');
  }

  process.exit(ok ? 0 : 1);
}

main();
