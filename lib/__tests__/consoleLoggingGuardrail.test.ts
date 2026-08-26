/**
 * Guardrail: production-risk logging audit finding.
 *
 * Several screens used to catch API errors (which attach the full raw backend
 * response body on `ApiError.payload`) and pass them straight to
 * `console.error(...)`. That risks printing member/contribution/wallet/
 * payment details, emails, phone numbers, or session data.
 *
 * All app/lib source must route error/warning logging through the sanctioned
 * `logClientError` / `logClientWarning` helpers in `lib/errorLogging.ts`.
 *
 * This test statically scans `app/` and `lib/` for console.log/error/warn
 * usage, including reference, alias, destructuring, bracket, and optional-
 * chaining bypasses that a naive `console.error(` regex would miss.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'lib'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const ALLOWLISTED_FILES = new Set([
  path.join(ROOT, 'lib', 'api.ts'),
  path.join(ROOT, 'lib', 'errorLogging.ts'),
]);

const CONSOLE_METHODS = 'log|error|warn';
const MEMBER_ACCESS = new RegExp(
  String.raw`\bconsole\s*(?:\?\.)\s*(?:${CONSOLE_METHODS})\b`,
);
const DOT_ACCESS = new RegExp(
  String.raw`\bconsole\s*\.\s*(?:${CONSOLE_METHODS})\b`,
);
const BRACKET_ACCESS = new RegExp(
  String.raw`\bconsole\s*(?:\?\.)?\s*\[\s*['"\`](?:${CONSOLE_METHODS})['"\`]\s*\]`,
);
const DESTRUCTURE = new RegExp(
  String.raw`\{[^}]*\b(?:${CONSOLE_METHODS})\b[^}]*\}\s*=\s*console\b`,
);
const OBJECT_ALIAS = new RegExp(
  String.raw`\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*console\b`,
);

export function stripLineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  let inTick = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && (inSingle || inDouble || inTick)) {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble && !inTick) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle && !inTick) {
      inDouble = !inDouble;
    } else if (char === '`' && !inSingle && !inDouble) {
      inTick = !inTick;
    } else if (
      char === '/' &&
      line[index + 1] === '/' &&
      !inSingle &&
      !inDouble &&
      !inTick
    ) {
      return line.slice(0, index);
    }
  }
  return line;
}

export function maskStringLiterals(line: string): string {
  return line.replace(/(['"`])(?:\\.|[\s\S])*?\1/g, ' ');
}

export function detectUnsafeConsoleUsage(source: string): string[] {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
  const findings: string[] = [];
  withoutBlocks.split('\n').forEach((line, index) => {
    const stripped = stripLineComment(line);
    const masked = maskStringLiterals(stripped);
    // Bracket keys must keep their quotes, so this check uses the
    // comment-stripped line. Other forms use masked text so
    // `const msg = "console.error(err)"` is not a hit.
    if (
      MEMBER_ACCESS.test(masked) ||
      DOT_ACCESS.test(masked) ||
      DESTRUCTURE.test(masked) ||
      OBJECT_ALIAS.test(masked) ||
      BRACKET_ACCESS.test(stripped)
    ) {
      findings.push(`:${index + 1}: ${line.trim()}`);
    }
  });
  return findings;
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      results.push(...collectSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('console logging guardrail', () => {
  it('detects reference, alias, destructuring, bracket, and optional-chaining bypasses', () => {
    const snippets: Array<[string, boolean]> = [
      ['console.error(err)', true],
      ['console.log(err)', true],
      ['console.warn(err)', true],
      ['.catch(console.error)', true],
      ['promise.catch(console.error)', true],
      ['const log = console.error', true],
      ['let warn = console.warn', true],
      ['const { error } = console', true],
      ['const { log, warn } = console', true],
      ["console['error'](err)", true],
      ['console["warn"](err)', true],
      ['console[`log`](err)', true],
      ['console.error?.(err)', true],
      ['console?.error(err)', true],
      ['console?.error?.(err)', true],
      ["console?.['error'](err)", true],
      ['const logger = console', true],
      ['// do not console.error or generic error', false],
      ['const message = "console.error(err)"', false],
      ['const ok = consoleEnabled', false],
    ];

    snippets.forEach(([source, shouldFlag]) => {
      const hits = detectUnsafeConsoleUsage(source);
      const flagged = hits.length > 0;
      if (flagged !== shouldFlag) {
        throw new Error(
          `detectUnsafeConsoleUsage(${JSON.stringify(source)}) ` +
            `expected ${shouldFlag ? 'a hit' : 'no hit'}, got ${JSON.stringify(hits)}`,
        );
      }
    });
  });

  it('does not allow direct console.log/error/warn usage outside the sanctioned logging helper', () => {
    const offenders: string[] = [];

    for (const dirName of SCAN_DIRS) {
      const dir = path.join(ROOT, dirName);
      if (!fs.existsSync(dir)) continue;

      for (const filePath of collectSourceFiles(dir)) {
        if (ALLOWLISTED_FILES.has(filePath)) continue;
        const source = fs.readFileSync(filePath, 'utf8');
        for (const finding of detectUnsafeConsoleUsage(source)) {
          offenders.push(`${path.relative(ROOT, filePath)}${finding}`);
        }
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Found console.log/error/warn usage outside the sanctioned logging ' +
          "helper. Use logClientError()/logClientWarning() from 'lib/errorLogging.ts' " +
          'instead so error objects (which may carry raw backend payloads) are never ' +
          `logged directly.\n\n${offenders.join('\n')}`,
      );
    }
  });
});
