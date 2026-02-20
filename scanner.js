'use strict';

const fs = require('fs');
const path = require('path');

const ERROR_FORMAT_PATTERN = /errorFormat\s*\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g;

/**
 * Patterns that indicate error responses not using MEF (no errorFormat).
 * Detects res.status(N).json({ message: ... }) and similar.
 */
const UNCOVERED_PATTERNS = [
  // return res.status(4xx|5xx).json({ message: ... }) or res.status(...).json({ message:
  /(?:return\s+)?res\.status\s*\(\s*(?:4\d\d|5\d\d)\s*\)\s*\.json\s*\(\s*\{\s*message\s*:/g,
  // res.status(4xx|5xx).json( on one line (message may be on next line)
  /res\.status\s*\(\s*(?:4\d\d|5\d\d)\s*\)\s*\.json\s*\(/g
];

/**
 * Extracts MEF codes from file content.
 * @param {string} content
 * @returns {Array<{ code: string, index: number }>}
 */
function extractCodesFromContent(content) {
  const found = [];
  let m;
  while ((m = ERROR_FORMAT_PATTERN.exec(content)) !== null) {
    found.push({ code: m[1], index: m.index });
  }
  return found;
}

/**
 * Scans a directory for errorFormat('CODE') calls.
 * Ignores node_modules, .git, and non-.js files.
 *
 * @param {string} rootDir - Project root directory
 * @param {object} options - { excludeDirs: string[], extensions: string[] }
 * @returns {Array<{ file: string, code: string, line?: number }>}
 */
function scanDirectory(rootDir, options = {}) {
  const excludeDirs = new Set(['node_modules', '.git', ...(options.excludeDirs || [])]);
  const extensions = new Set(options.extensions || ['.js']);
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!excludeDirs.has(ent.name)) walk(full);
        continue;
      }
      const ext = path.extname(ent.name);
      if (!extensions.has(ext)) continue;
      const content = fs.readFileSync(full, 'utf8');
      const codes = extractCodesFromContent(content);
      const lines = content.split(/\n/);
      for (const { code, index } of codes) {
        let line = 1;
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
          count += lines[i].length + 1;
          if (count > index) {
            line = i + 1;
            break;
          }
        }
        results.push({
          file: path.relative(rootDir, full),
          code,
          line
        });
      }
    }
  }

  walk(rootDir);
  return results;
}

/**
 * Compares scanned codes with the errorsResult registry.
 *
 * @param {Array<{ file: string, code: string }>} scanned
 * @param {object} errorsResult - Keys = registered codes
 * @returns {{ duplicates: Array<{ code: string, files: string[] }>, unregistered: Array<{ code: string, file: string }>, unused: string[] }}
 */
function compareWithRegistry(scanned, errorsResult) {
  const codeToFiles = new Map();
  for (const { file, code } of scanned) {
    if (!codeToFiles.has(code)) codeToFiles.set(code, []);
    codeToFiles.get(code).push(file);
  }

  const registered = new Set(Object.keys(errorsResult));
  const duplicates = [];
  const unregistered = [];

  for (const [code, files] of codeToFiles) {
    if (files.length > 1) {
      duplicates.push({ code, files });
    }
    if (!registered.has(code)) {
      for (const f of files) unregistered.push({ code, file: f });
    }
  }

  const used = new Set(codeToFiles.keys());
  const unused = [...registered].filter((c) => !used.has(c));

  return { duplicates, unregistered, unused };
}

/**
 * Returns the 1-based line number for an index in the content.
 */
function indexToLine(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/**
 * Returns the line of code at the given index (trimmed).
 */
function getLineSnippet(content, index) {
  const start = content.lastIndexOf('\n', index - 1) + 1;
  let end = content.indexOf('\n', index);
  if (end === -1) end = content.length;
  return content.slice(start, end).trim();
}

/**
 * Scans code for error responses that do NOT use MEF.
 * Detects res.status(4xx|5xx).json({ message: ... }) and similar.
 *
 * @param {string} rootDir - Project root directory
 * @param {object} options - { excludeDirs: string[], extensions: string[], includeDirs: string[] }
 *   includeDirs: if set, only scan these directories (e.g. ['controllers', 'routes', 'middleware'])
 * @returns {Array<{ file: string, line: number, snippet: string }>}
 */
function scanUncoveredErrors(rootDir, options = {}) {
  const excludeDirs = new Set(['node_modules', '.git', 'packages', ...(options.excludeDirs || [])]);
  const extensions = new Set(options.extensions || ['.js']);
  const includeDirs = options.includeDirs || null;
  const results = [];
  const seen = new Set();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const relativeDir = path.relative(rootDir, dir);
      if (ent.isDirectory()) {
        if (includeDirs && includeDirs.length) {
          const rel = path.relative(rootDir, full);
          if (!includeDirs.some((d) => rel === d || rel.startsWith(d + path.sep))) continue;
        }
        if (!excludeDirs.has(ent.name)) walk(full);
        continue;
      }
      const ext = path.extname(ent.name);
      if (!extensions.has(ext)) continue;
      const content = fs.readFileSync(full, 'utf8');
      const fileRel = path.relative(rootDir, full);

      for (const re of UNCOVERED_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(content)) !== null) {
          const line = indexToLine(content, m.index);
          const key = `${fileRel}:${line}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const snippet = getLineSnippet(content, m.index);
          results.push({
            file: fileRel,
            line,
            snippet: snippet.length > 100 ? snippet.slice(0, 97) + '...' : snippet
          });
        }
      }
    }
  }

  walk(rootDir);
  return results.sort((a, b) => (a.file !== b.file ? a.file.localeCompare(b.file) : a.line - b.line));
}

module.exports = {
  extractCodesFromContent,
  scanDirectory,
  compareWithRegistry,
  scanUncoveredErrors
};
