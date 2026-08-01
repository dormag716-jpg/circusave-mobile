import {
  acceptCircleAgreement,
  getAdditionalHandPreview,
  requestAdditionalHand,
  startCircle,
} from '../api';

describe('circle agreement API contracts', () => {
  const originalFetch = global.fetch;
  const originalApiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:5000';
    globalWithDev.__DEV__ = false;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ acceptanceId: 'a1' }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBase;
  });

  function body() {
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    return JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
  }

  it('submits agreement identifiers and affirmative evidence without financial totals', async () => {
    await acceptCircleAgreement('token', 'circle-1', {
      snapshotId: 'snapshot-1', snapshotHash: 'a'.repeat(64),
      documentType: 'circle_participation_agreement', documentVersion: 'draft-v1',
      accepted: true, language: 'ht', clientIdentifier: 'mobile-v1',
    });
    expect(body()).toEqual({
      snapshotId: 'snapshot-1', snapshotHash: 'a'.repeat(64),
      documentType: 'circle_participation_agreement', documentVersion: 'draft-v1',
      accepted: true, language: 'ht', clientIdentifier: 'mobile-v1',
    });
    expect(body()).not.toHaveProperty('acceptedHandIds');
    expect(body()).not.toHaveProperty('estimatedTotalObligationCents');
  });

  it('requests a server-calculated additional-hand preview with no client totals', async () => {
    await getAdditionalHandPreview('token', 'circle-1');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url.endsWith('/api/groups/circle-1/additional-hand-preview')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('submits only preview evidence for an additional hand', async () => {
    await requestAdditionalHand('token', 'circle-1', {
      previewHash: 'b'.repeat(64), acceptedAdditionalHandObligation: true,
      consentTextVersion: 'draft-v1', language: 'es', clientIdentifier: 'mobile-v1',
    });
    expect(body()).toEqual({
      additionalHand: true, previewHash: 'b'.repeat(64),
      acceptedAdditionalHandObligation: true, consentTextVersion: 'draft-v1',
      language: 'es', clientIdentifier: 'mobile-v1',
    });
    expect(body()).not.toHaveProperty('newRecurringObligationCents');
    expect(body()).not.toHaveProperty('newTotalRemainingObligationCents');
  });

  it('sends exact false as well as true organizer confirmations with snapshot evidence', async () => {
    await startCircle('token', 'circle-1', {
      confirmPayoutOrder: true, confirmUnclaimedHands: false,
      snapshotId: 'snapshot-1', snapshotHash: 'c'.repeat(64), language: 'en',
    });
    expect(body()).toEqual({
      confirmPayoutOrder: true, confirmUnclaimedHands: false,
      snapshotId: 'snapshot-1', snapshotHash: 'c'.repeat(64), language: 'en',
    });
  });
});
