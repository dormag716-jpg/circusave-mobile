import { readFileSync, readdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { colors } from '../theme';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('light-theme color consistency', () => {
  test('exposes the approved brand and semantic palette', () => {
    expect(colors).toMatchObject({
      primary: '#6B46C1',
      primaryDark: '#4C1D95',
      primaryLight: '#A78BFA',
      primarySoft: '#F5F3FF',
      primaryBorder: '#DDD6FE',
      success: '#10B981',
      successText: '#047857',
      successSoft: '#D1FAE5',
      warning: '#F59E0B',
      warningText: '#92400E',
      warningSoft: '#FEF3C7',
      danger: '#EF4444',
      dangerText: '#991B1B',
      dangerSoft: '#FEF2F2',
      info: '#2563EB',
      infoText: '#1E40AF',
      infoSoft: '#EFF6FF',
    });
  });

  test('keeps opaque interface colors in the shared theme', () => {
    const roots = [
      resolve(__dirname, '../../app'),
      resolve(__dirname, '../../components'),
      resolve(__dirname, '..'),
    ];
    const exceptions = new Set([
      resolve(__dirname, '../../app/+html.tsx'),
      resolve(__dirname, '../theme.ts'),
    ]);
    const violations = roots
      .flatMap(sourceFiles)
      .filter(
        (path) =>
          !exceptions.has(path) &&
          !path.includes(`${sep}__tests__${sep}`),
      )
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        const matches =
          source.match(/(?:#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?![0-9a-fA-F])/g) ??
          [];
        return matches.map((color) => `${path}: ${color}`);
      });

    expect(violations).toEqual([]);
  });
});
