#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { scanDirectory, compareWithRegistry, scanUncoveredErrors } = require('./scanner.js');

const DEFAULT_ERRORS_PATH = 'mef/errors.json';
const DEFAULT_ROOT = process.cwd();

function loadErrors(errorsPath) {
  const full = path.isAbsolute(errorsPath) ? errorsPath : path.join(DEFAULT_ROOT, errorsPath);
  try {
    const raw = fs.readFileSync(full, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('Error registry file not found:', full);
      process.exit(1);
    }
    throw e;
  }
}

const UNCOVERED_OUTPUT_FILE = 'mef/uncovered.txt';

function writeUncoveredToFile(rootDir, uncovered) {
  const dir = path.join(rootDir, 'mef');
  const filePath = path.join(dir, 'uncovered.txt');
  const lines = [
    'Errors not covered by MEF (res.status(4xx|5xx).json without errorFormat)',
    '',
    ...uncovered.map(({ file, line, snippet }) => `${file}:${line}\n  ${snippet}`),
    '',
    `Total: ${uncovered.length} occurrence(s).`,
    'Register in mef/errors.json: "CODE_MEF": { "statusCode": 4xx, "message": "..." }',
    "In code use: next(errorFormat('CODE_MEF'))."
  ];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

const DUPLICATED_OUTPUT_FILE = 'mef/duplicated.txt';

function writeDuplicatesToFile(rootDir, duplicates) {
  const dir = path.join(rootDir, 'mef');
  const filePath = path.join(dir, 'duplicated.txt');
  const lines = [
    'Duplicates (same MEF code in more than one file)',
    '',
    ...duplicates.map(({ code, files }) => `${code}\n  -> ${files.join(', ')}`),
    '',
    `Total: ${duplicates.length} duplicate code(s).`,
    'Use unique codes per context (e.g. USERS_GETBYID_NOTFOUND, USERS_UPDATE_NOTFOUND).'
  ];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

function printHelp() {
  console.log(`
MEF (Milan Error Format) – error code validation

Usage: npm run mef [options]

Default (no options):
  Validates errorFormat('CODE') codes against mef/errors.json.
  Fails if duplicates or unregistered codes exist.
  Prints full lists: covered, uncovered, duplicated.

Options:

  --errors=path    Path to registry (default: mef/errors.json).
  --root=path      Directory to scan (default: current directory).

  --scan-only      Only list MEF codes found in code.
  --validate-only  Fail if unregistered codes or duplicates exist.
  --check-duplicates Fail only if the same code appears in more than one file.

  --detect-uncovered List errors not covered by MEF (res.status(4xx|5xx).json) with file and line.
  --strict-uncovered Make the command fail when any uncovered error exists.

  --help, -h       Show this help.

Suggested npm scripts:
  mef             Full validation (default).
  mef:scan        npm run mef -- --scan-only
  mef:validate    npm run mef -- --validate-only
  mef:uncovered   npm run mef -- --detect-uncovered
  mef:help        npm run mef -- --help
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  const errorsPath = args.find((a) => a.startsWith('--errors='))
    ? args.find((a) => a.startsWith('--errors=')).slice(9)
    : DEFAULT_ERRORS_PATH;
  const rootDir = args.find((a) => a.startsWith('--root='))
    ? path.resolve(args.find((a) => a.startsWith('--root=')).slice(7))
    : DEFAULT_ROOT;
  const scanOnly = args.includes('--scan-only');
  const validateOnly = args.includes('--validate-only');
  const checkDuplicates = args.includes('--check-duplicates');
  const detectUncoveredOnly = args.includes('--detect-uncovered');
  const strictUncovered = args.includes('--strict-uncovered');

  if (detectUncoveredOnly) {
    const uncovered = scanUncoveredErrors(rootDir, {
      excludeDirs: ['node_modules', '.git', 'packages']
    });
    if (uncovered.length === 0) {
      console.log('No error responses outside MEF format detected.');
      return;
    }
    console.error('Errors not covered by MEF (res.status(4xx|5xx).json({ message: ... }) without errorFormat):');
    console.error('');
    uncovered.forEach(({ file, line, snippet }) => {
      console.error(`  ${file}:${line}`);
      console.error(`    ${snippet}`);
    });
    console.error('');
    console.error('Total:', uncovered.length, 'occurrence(s).');
    console.error('Register in mef/errors.json: "CODE_MEF": { "statusCode": 4xx, "message": "..." }');
    console.error('In code use: next(errorFormat(\'CODE_MEF\')).');
    const outPath = writeUncoveredToFile(rootDir, uncovered);
    console.error('List saved to', path.relative(rootDir, outPath));
    process.exit(strictUncovered ? 1 : 0);
    return;
  }

  const errorsResult = loadErrors(errorsPath);
  const scanned = scanDirectory(rootDir, {
    excludeDirs: ['node_modules', '.git', 'packages']
  });

  if (scanOnly) {
    const codes = [...new Set(scanned.map((s) => s.code))].sort();
    console.log('MEF codes found in code:');
    codes.forEach((c) => console.log('  ', c));
    console.log('Total:', codes.length);
    return;
  }

  const { duplicates, unregistered, unused } = compareWithRegistry(scanned, errorsResult);
  const uncovered = scanUncoveredErrors(rootDir, {
    excludeDirs: ['node_modules', '.git', 'packages']
  });

  let hasProblems = false;

  // 1. Covered: MEF codes found in code (full list)
  const coveredCodes = [...new Set(scanned.map((s) => s.code))].sort();
  console.error('');
  console.error('=== MEF codes (covered) ===');
  if (coveredCodes.length === 0) {
    console.error('  (none)');
  } else {
    coveredCodes.forEach((c) => console.error('  ', c));
  }
  console.error('Total:', coveredCodes.length, 'code(s).');
  console.error('');

  // 2. Uncovered: errors not using MEF (full list)
  console.error('=== Errors not covered (uncovered) ===');
  if (uncovered.length === 0) {
    console.error('  (none)');
  } else {
    uncovered.forEach(({ file, line, snippet }) => {
      console.error(`  ${file}:${line}`);
      console.error(`    ${snippet}`);
    });
    console.error('');
    console.error('Total:', uncovered.length, 'occurrence(s).');
    console.error('Register in mef/errors.json: "CODE_MEF": { "statusCode": 4xx, "message": "..." }');
    console.error('In code use: next(errorFormat(\'CODE_MEF\')).');
    writeUncoveredToFile(rootDir, uncovered);
    console.error('List saved to', UNCOVERED_OUTPUT_FILE);
    if (strictUncovered) hasProblems = true;
  }
  console.error('');

  // 3. Duplicated: same code in more than one file (full list)
  console.error('=== Duplicates (duplicated) ===');
  if (duplicates.length === 0) {
    console.error('  (none)');
  } else {
    hasProblems = true;
    duplicates.forEach(({ code, files }) => {
      console.error(`  ${code}`);
      console.error('    ->', files.join(', '));
    });
    console.error('');
    console.error('Total:', duplicates.length, 'duplicate code(s).');
    writeDuplicatesToFile(rootDir, duplicates);
    console.error('List saved to', DUPLICATED_OUTPUT_FILE);
  }
  console.error('');

  if (unregistered.length > 0) {
    hasProblems = true;
    console.error('Codes used in code but not registered in errors.json:');
    unregistered.forEach(({ code, file }) => console.error('  ', code, '->', file));
    console.error('');
  }

  if (unused.length > 0) {
    console.warn('Codes in errors.json not used in code:');
    unused.forEach((c) => console.warn('  ', c));
    console.error('');
  }

  if (validateOnly || checkDuplicates) {
    if (validateOnly && (unregistered.length > 0 || duplicates.length > 0)) {
      process.exit(1);
    }
    if (checkDuplicates && duplicates.length > 0) {
      process.exit(1);
    }
    return;
  }

  if (hasProblems) {
    process.exit(1);
  }

  console.log('MEF: scan OK. Codes are unique and registered.');
}

main();
