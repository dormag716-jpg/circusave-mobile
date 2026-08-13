import { readFileSync } from 'fs';
import { join } from 'path';

import { getCircleDetail } from '../api';
import { loadAgreementReviewCircleDetail } from '../agreementReviewLoad';
import { resetHttpGetCacheForTests } from '../httpGetCache';

describe('agreement-review getCircleDetail contract', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = globalWithDev.__DEV__;

  beforeEach(() => {
    resetHttpGetCacheForTests();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    globalWithDev.__DEV__ = false;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'circle-42',
          name: 'Test Circle',
          contributionAmount: 50,
          currentRound: 1,
          frequency: 'weekly',
          members: [],
          organizerId: 'org-1',
          startDate: '2026-01-01',
          status: 'draft',
        }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
    }
    if (originalDev === undefined) {
      delete globalWithDev.__DEV__;
    } else {
      globalWithDev.__DEV__ = originalDev;
    }
  });

  it('invokes getCircleDetail with token first and circle ID second', async () => {
    const getCircleDetailMock = jest.fn().mockResolvedValue({ id: 'circle-42' });

    await loadAgreementReviewCircleDetail(
      getCircleDetailMock,
      'session-token',
      'circle-42',
    );

    expect(getCircleDetailMock).toHaveBeenCalledTimes(1);
    expect(getCircleDetailMock).toHaveBeenCalledWith(
      'session-token',
      'circle-42',
    );
    expect(getCircleDetailMock).not.toHaveBeenCalledWith(
      'circle-42',
      'session-token',
    );
  });

  it('loads agreement review through the token-first helper, not a reversed direct call', () => {
    const source = readFileSync(
      join(__dirname, '../../app/circle/agreement-review.tsx'),
      'utf8',
    );

    expect(source).toMatch(/loadAgreementReviewCircleDetail\(/);
    expect(source).toMatch(/getCircleDetail,\s*token,\s*circleId/);
    expect(source).not.toMatch(/getCircleDetail\(\s*circleId\s*,\s*token\s*\)/);
    expect(source).not.toMatch(
      /loadAgreementReviewCircleDetail\(\s*getCircleDetail,\s*circleId,\s*token/,
    );
  });

  it('sends the token as bearer auth and the circle ID in the path', async () => {
    await getCircleDetail('session-token', 'circle-42');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://127.0.0.1:5000/api/groups/circle-42');
    expect(url).not.toContain('/groups/session-token');
    expect((init.headers as Headers).get('Authorization')).toBe(
      'Bearer session-token',
    );
  });
});
