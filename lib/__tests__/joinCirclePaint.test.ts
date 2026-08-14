import { readFileSync } from 'fs';
import path from 'path';

import {
  shouldClearJoinPreviewDuringLookup,
  shouldKeepJoinPreviewDuringLookup,
} from '../joinCirclePaint';

describe('join-by-code preview paint', () => {
  it('does not clear a loaded preview while lookup is in flight', () => {
    expect(shouldClearJoinPreviewDuringLookup()).toBe(false);
    expect(shouldKeepJoinPreviewDuringLookup(true)).toBe(true);
    expect(shouldKeepJoinPreviewDuringLookup(false)).toBe(false);
  });

  it('join lookup does not null the preview before the request returns', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'join-circle.tsx'),
      'utf8',
    );
    expect(source).toMatch(/shouldKeepJoinPreviewDuringLookup/);
    expect(source).not.toMatch(/setResolving\(true\);\s*setPreview\(null\)/);
  });
});
