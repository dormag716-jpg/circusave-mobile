/**
 * Guardrail: production-risk logging audit finding.
 *
 * Several screens used to catch API errors (which carry the full raw backend
 * response body on `ApiError.payload`) and pass them straight to
 * `console.error(...)`. That risks printing member/contribution/wallet/
 * payment details, emails, phone numbers, or session data to the device
 * console/crash logs.
 *
 * All app/lib source must route error/warning logging through the sanctioned
 * `logClientError` / `logClientWarning` helpers in `lib/errorLogging.ts`,
 * which only ever log a static event label, error message, status code, and
 * an explicit, key-redacted context object.
 *
 * This test statically scans `app/` and `lib/` for direct
 * `console.log|error|warn(` calls outside the small allowlist below, so any
 * new unsafe logging call site fails CI instead of shipping.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'lib'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Files allowed to call console.* directly:
//  - lib/api.ts: __DEV__-gated, key-redacting request/response dev logger.
//  - lib/errorLogging.ts: the sanctioned sink that all other logging routes through.
const ALLOWLISTED_FILES = new Set([
  path.join(ROOT, 'lib', 'api.ts'),
  path.join(ROOT, 'lib', 'errorLogging.ts'),
]);

const CONSOLE_CALL_PATTERN = /console\.(log|error|warn)\s*\(/;

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
  it('does not allow direct console.log/error/warn calls outside the sanctioned logging helper', () => {
    const offenders: string[] = [];

    for (const dirName of SCAN_DIRS) {
      const dir = path.join(ROOT, dirName);
      if (!fs.existsSync(dir)) continue;

      for (const filePath of collectSourceFiles(dir)) {
        if (ALLOWLISTED_FILES.has(filePath)) continue;

        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (CONSOLE_CALL_PATTERN.test(line)) {
            offenders.push(`${path.relative(ROOT, filePath)}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }

    if (offenders.length > 0) {
      throw new Error(
        'Found direct console.log/error/warn call(s) outside the sanctioned logging ' +
          "helper. Use logClientError()/logClientWarning() from 'lib/errorLogging.ts' " +
          'instead so error objects (which may carry raw backend payloads) are never ' +
          `logged directly.\n\n${offenders.join('\n')}`,
      );
    }
  });
});
