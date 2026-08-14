import { readFileSync } from 'fs';
import path from 'path';

import {
  shouldBlockInviteLanding,
  shouldShowInvitePreviewSkeleton,
  shouldShowInviteUnavailable,
} from '../invitePaint';

describe('invite screen first paint', () => {
  it('never blocks the invite chrome on the preview fetch', () => {
    expect(shouldBlockInviteLanding()).toBe(false);
  });

  it('shows an in-content skeleton only before the first preview', () => {
    expect(
      shouldShowInvitePreviewSkeleton({ loading: true, hasPreview: false }),
    ).toBe(true);
    expect(
      shouldShowInvitePreviewSkeleton({ loading: true, hasPreview: true }),
    ).toBe(false);
    expect(
      shouldShowInvitePreviewSkeleton({ loading: false, hasPreview: false }),
    ).toBe(false);
  });

  it('shows unavailable copy after a failed first load, not during loading', () => {
    expect(
      shouldShowInviteUnavailable({
        loading: true,
        hasPreview: false,
        error: 'bad invite',
      }),
    ).toBe(false);
    expect(
      shouldShowInviteUnavailable({
        loading: false,
        hasPreview: false,
        error: 'bad invite',
      }),
    ).toBe(true);
    expect(
      shouldShowInviteUnavailable({
        loading: false,
        hasPreview: true,
        error: 'bad invite',
      }),
    ).toBe(false);
  });

  it('invite screen does not return a full-screen first-load spinner', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'invite', '[id].tsx'),
      'utf8',
    );
    expect(source).toMatch(/shouldShowInvitePreviewSkeleton/);
    expect(source).not.toMatch(/if \(loading\) \{/);
    expect(source).not.toMatch(/invite:loading/);
  });
});
