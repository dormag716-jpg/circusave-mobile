import {
  PENDING_REGISTRATION_KEEP_MS,
  loadPendingRegistration,
  sanitizePending,
  setPendingStorageAdapter,
  type PendingStorageAdapter,
} from '../pendingRegistrationStorage';
import {
  clearRegistrationVerification,
  isRegistrationExpired,
  readRegistrationVerification,
  readVerificationRequired,
  restoreRegistrationVerification,
  stageRegistrationVerification,
  updateRegistrationResendAt,
} from '../registrationVerification';
import { toEmailLanguage } from '@/lib/i18n/emailLanguage';

/** An in-memory stand-in for the phone's secure storage. It outlives a simulated app restart. */
function memoryDevice() {
  const state: { value: string | null; writes: string[] } = { value: null, writes: [] };
  const adapter: PendingStorageAdapter = {
    read: async () => state.value,
    write: async (v) => {
      state.value = v;
      state.writes.push(v);
    },
    remove: async () => {
      state.value = null;
    },
  };
  return { state, adapter };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const NOW = Date.parse('2026-10-21T12:00:00Z');

describe('resuming an interrupted sign-up', () => {
  let device: ReturnType<typeof memoryDevice>;

  beforeEach(() => {
    device = memoryDevice();
    setPendingStorageAdapter(device.adapter);
    clearRegistrationVerification();
    device.state.writes.length = 0;
  });

  afterEach(() => setPendingStorageAdapter(null));

  it('saves only the four fields needed to resume', async () => {
    stageRegistrationVerification({
      signupId: 'sup_abc',
      email: ' Person@Example.com ',
      resendAfterSeconds: 30,
      signupExpiresAt: '2026-10-21T12:30:00Z',
      nowMs: NOW,
    });
    await flush();
    expect(JSON.parse(device.state.value as string)).toEqual({
      signupId: 'sup_abc',
      email: 'person@example.com',
      resendAvailableAtMs: NOW + 30_000,
      signupExpiresAtMs: Date.parse('2026-10-21T12:30:00Z'),
    });
  });

  it('never writes a password, a code, the development code or a token', async () => {
    const secretLike = {
      signupId: 'sup_abc',
      email: 'person@example.com',
      resendAfterSeconds: 30,
      signupExpiresAt: '2026-10-21T12:30:00Z',
      password: 'Password-12345',
      code: '123456',
      devCode: '654321',
      token: 'tok_secret',
      session: { token: 'tok_secret' },
      nowMs: NOW,
    } as Parameters<typeof stageRegistrationVerification>[0];
    stageRegistrationVerification(secretLike);
    updateRegistrationResendAt(NOW + 99_000);
    await flush();
    expect(device.state.writes.length).toBeGreaterThan(0);
    for (const written of device.state.writes) {
      for (const forbidden of ['Password-12345', '123456', '654321', 'tok_secret', 'password', 'devCode', 'token', 'code"']) {
        expect(written).not.toContain(forbidden);
      }
      expect(Object.keys(JSON.parse(written)).sort()).toEqual(
        ['email', 'resendAvailableAtMs', 'signupExpiresAtMs', 'signupId'],
      );
    }
  });

  it('does not keep the development code even when the Backend returns it', () => {
    const parsed = readVerificationRequired({
      status: 'verification_required',
      signupId: 'sup_abc',
      devCode: '123456',
      signupExpiresAt: '2026-10-21T12:30:00Z',
    });
    stageRegistrationVerification({
      signupId: parsed!.signupId,
      email: 'a@b.co',
      resendAfterSeconds: 30,
      signupExpiresAt: parsed!.signupExpiresAt,
    });
    expect(JSON.stringify(readRegistrationVerification())).not.toContain('123456');
  });

  it('comes back after the app is closed and reopened', async () => {
    stageRegistrationVerification({
      signupId: 'sup_resume',
      email: 'resume@example.com',
      resendAfterSeconds: 30,
      signupExpiresAt: '2026-10-21T12:30:00Z',
      nowMs: NOW,
    });
    await flush();
    // New process: memory is empty, the device still has the saved text.
    let fresh!: typeof import('../registrationVerification');
    let freshStorage!: typeof import('../pendingRegistrationStorage');
    jest.isolateModules(() => {
      freshStorage = require('../pendingRegistrationStorage');
      fresh = require('../registrationVerification');
    });
    freshStorage.setPendingStorageAdapter(device.adapter);
    expect(fresh.readRegistrationVerification()).toBeNull();
    const restored = await fresh.restoreRegistrationVerification(NOW + 60_000);
    expect(restored).toEqual({
      signupId: 'sup_resume',
      email: 'resume@example.com',
      resendAvailableAtMs: NOW + 30_000,
      signupExpiresAtMs: Date.parse('2026-10-21T12:30:00Z'),
    });
    expect(fresh.isRegistrationExpired(restored!, NOW + 60_000)).toBe(false);
  });

  it('keeps the original expiry: reopening never extends the sign-up', async () => {
    stageRegistrationVerification({
      signupId: 'sup_x',
      email: 'a@b.co',
      resendAfterSeconds: 30,
      signupExpiresAt: '2026-10-21T12:30:00Z',
      nowMs: NOW,
    });
    await flush();
    const later = await loadPendingRegistration(NOW + 25 * 60_000);
    expect(later?.signupExpiresAtMs).toBe(Date.parse('2026-10-21T12:30:00Z'));
  });

  it('remembers the new resend time after a resend', async () => {
    stageRegistrationVerification({ signupId: 'sup_x', email: 'a@b.co', resendAfterSeconds: 0, nowMs: NOW });
    updateRegistrationResendAt(NOW + 45_000);
    await flush();
    expect((await loadPendingRegistration(NOW))?.resendAvailableAtMs).toBe(NOW + 45_000);
  });

  it('reports an expired sign-up so the screen can offer a fresh start', async () => {
    stageRegistrationVerification({
      signupId: 'sup_old',
      email: 'a@b.co',
      resendAfterSeconds: 30,
      signupExpiresAt: '2026-10-21T12:30:00Z',
      nowMs: NOW,
    });
    await flush();
    const afterExpiry = Date.parse('2026-10-21T12:45:00Z');
    const loaded = await loadPendingRegistration(afterExpiry);
    expect(loaded).not.toBeNull();
    expect(isRegistrationExpired(loaded!, afterExpiry)).toBe(true);
    expect(isRegistrationExpired(loaded!, Date.parse('2026-10-21T12:29:59Z'))).toBe(false);
  });

  it('drops, and deletes, a sign-up that expired more than a day ago', async () => {
    stageRegistrationVerification({
      signupId: 'sup_ancient',
      email: 'a@b.co',
      resendAfterSeconds: 30,
      signupExpiresAt: '2026-10-21T12:30:00Z',
      nowMs: NOW,
    });
    await flush();
    const longAfter = Date.parse('2026-10-21T12:30:00Z') + PENDING_REGISTRATION_KEEP_MS + 1000;
    expect(await loadPendingRegistration(longAfter)).toBeNull();
    expect(device.state.value).toBeNull();
  });

  it('an unknown expiry is never treated as expired', () => {
    expect(isRegistrationExpired({ signupExpiresAtMs: null }, NOW + 10 ** 12)).toBe(false);
  });

  it('is cleared when the sign-up finishes or the person starts over', async () => {
    stageRegistrationVerification({ signupId: 'sup_x', email: 'a@b.co', resendAfterSeconds: 30, nowMs: NOW });
    await flush();
    expect(device.state.value).not.toBeNull();
    clearRegistrationVerification();
    await flush();
    expect(device.state.value).toBeNull();
    expect(readRegistrationVerification()).toBeNull();
    expect(await restoreRegistrationVerification()).toBeNull();
  });

  it('never replaces a sign-up already in memory with an older saved one', async () => {
    stageRegistrationVerification({ signupId: 'sup_new', email: 'new@b.co', resendAfterSeconds: 30, nowMs: NOW });
    await flush();
    device.state.value = JSON.stringify({
      signupId: 'sup_old', email: 'old@b.co', resendAvailableAtMs: 1, signupExpiresAtMs: null,
    });
    expect((await restoreRegistrationVerification())?.signupId).toBe('sup_new');
  });

  it('ignores damaged or tampered saved data and removes it', async () => {
    for (const bad of [
      'not json', '[]', '"text"', 'null', '{}',
      JSON.stringify({ signupId: '', email: 'a@b.co', resendAvailableAtMs: 1 }),
      JSON.stringify({ signupId: 'x', email: 5, resendAvailableAtMs: 1 }),
      JSON.stringify({ signupId: 'x'.repeat(1000), email: 'a@b.co', resendAvailableAtMs: 1 }),
      JSON.stringify({ signupId: 'x', email: 'a@b.co', resendAvailableAtMs: 'soon' }),
    ]) {
      device.state.value = bad;
      expect(await loadPendingRegistration(NOW)).toBeNull();
      expect(device.state.value).toBeNull();
    }
  });

  it('drops extra fields from saved data instead of trusting them', () => {
    expect(
      sanitizePending({
        signupId: 's', email: 'a@b.co', resendAvailableAtMs: 5, signupExpiresAtMs: 9,
        password: 'x', token: 't', code: '1',
      }),
    ).toEqual({ signupId: 's', email: 'a@b.co', resendAvailableAtMs: 5, signupExpiresAtMs: 9 });
  });

  it('a storage failure never blocks sign-up or crashes the resume', async () => {
    setPendingStorageAdapter({
      read: async () => { throw new Error('keystore locked'); },
      write: async () => { throw new Error('keystore locked'); },
      remove: async () => { throw new Error('keystore locked'); },
    });
    expect(() =>
      stageRegistrationVerification({ signupId: 's', email: 'a@b.co', resendAfterSeconds: 30, nowMs: NOW }),
    ).not.toThrow();
    clearRegistrationVerification();
    await flush();
    expect(await restoreRegistrationVerification()).toBeNull();
  });
});

describe('language sent with account-email requests', () => {
  it('maps the app language to en, es or ht', () => {
    expect(toEmailLanguage('en')).toBe('en');
    expect(toEmailLanguage('es')).toBe('es');
    expect(toEmailLanguage('ht')).toBe('ht');
    expect(toEmailLanguage('es-MX')).toBe('es');
    expect(toEmailLanguage('HT_ht')).toBe('ht');
  });

  it('falls back to English for anything else', () => {
    for (const odd of [undefined, null, '', 'fr', 'pt-BR', 5, ['es'], {}, 'zz-es']) {
      expect(toEmailLanguage(odd)).toBe('en');
    }
  });
});
