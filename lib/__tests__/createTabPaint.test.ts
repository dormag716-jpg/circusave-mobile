import { readFileSync } from 'fs';
import path from 'path';

import {
  shouldBlockCreateTabLanding,
  shouldShowCreateTabLimitCard,
} from '../createTabPaint';

describe('create tab first paint', () => {
  it('never blocks the landing on the circles fetch', () => {
    expect(shouldBlockCreateTabLanding()).toBe(false);
  });

  it('does not show the plan-limit card before a snapshot exists', () => {
    expect(
      shouldShowCreateTabLimitCard({ hasSnapshot: false, atCapacity: true }),
    ).toBe(false);
    expect(
      shouldShowCreateTabLimitCard({ hasSnapshot: false, atCapacity: false }),
    ).toBe(false);
  });

  it('shows the plan-limit card only after a snapshot says the organizer is at capacity', () => {
    expect(
      shouldShowCreateTabLimitCard({ hasSnapshot: true, atCapacity: true }),
    ).toBe(true);
    expect(
      shouldShowCreateTabLimitCard({ hasSnapshot: true, atCapacity: false }),
    ).toBe(false);
  });

  it('Create tab does not mount a blocking first-load spinner', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', '(tabs)', 'create-circle.tsx'),
      'utf8',
    );
    expect(source).toMatch(/shouldShowCreateTabLimitCard/);
    expect(source).not.toMatch(/shouldShowBlockingLoadState/);
    expect(source).not.toMatch(/ActivityIndicator/);
    expect(source).not.toMatch(/landing\.loading/);
  });
});
