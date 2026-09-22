import { verifyAccountPassword } from '../deviceLockPassword';

function proofSession(userId = 'usr_1', token = 'proof-token') {
  return {
    user: { id: userId },
    session: { token },
  };
}

describe('account password proof', () => {
  it('does not call the login API for an empty password', async () => {
    const login = jest.fn();
    const revoke = jest.fn();
    await expect(
      verifyAccountPassword({
        email: 'ada@example.com',
        password: '',
        expectedUserId: 'usr_1',
        login,
        revokeVerificationSession: revoke,
      }),
    ).resolves.toBe('failed');
    expect(login).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('stays locked when the authentication API rejects the password', async () => {
    const revoke = jest.fn();
    await expect(
      verifyAccountPassword({
        email: 'ada@example.com',
        password: 'wrong-password',
        expectedUserId: 'usr_1',
        login: async () => {
          throw new Error('Email or password is incorrect.');
        },
        revokeVerificationSession: revoke,
      }),
    ).resolves.toBe('failed');
    expect(revoke).not.toHaveBeenCalled();
  });

  it('accepts the password and revokes only the extra proof session', async () => {
    const login = jest.fn(async () => proofSession());
    const revoke = jest.fn(async () => undefined);
    await expect(
      verifyAccountPassword({
        email: ' Ada@Example.com ',
        password: 'correct-password',
        expectedUserId: 'usr_1',
        login,
        revokeVerificationSession: revoke,
      }),
    ).resolves.toBe('success');
    expect(login).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct-password',
    });
    expect(revoke).toHaveBeenCalledWith('proof-token');
  });

  it('does not unlock a different account and still revokes that proof session', async () => {
    const revoke = jest.fn(async () => undefined);
    await expect(
      verifyAccountPassword({
        email: 'ada@example.com',
        password: 'other-password',
        expectedUserId: 'usr_1',
        login: async () => proofSession('usr_other', 'other-token'),
        revokeVerificationSession: revoke,
      }),
    ).resolves.toBe('failed');
    expect(revoke).toHaveBeenCalledWith('other-token');
  });

  it('still unlocks the same account if revoking the extra session fails', async () => {
    await expect(
      verifyAccountPassword({
        email: 'ada@example.com',
        password: 'correct-password',
        expectedUserId: 'usr_1',
        login: async () => proofSession(),
        revokeVerificationSession: async () => {
          throw new Error('offline');
        },
      }),
    ).resolves.toBe('success');
  });
});
