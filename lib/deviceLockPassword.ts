/**
 * Proves the signed-in CircuSave password without replacing the saved session
 * and without keeping the password on the device.
 *
 * The login API is the existing password check. It also opens a new server
 * session, so that extra session is revoked immediately. The session that was
 * already saved for this app is left alone.
 */

export type AccountPasswordProof = 'success' | 'failed';

type PasswordProofSession = {
  user: { id: string };
  session: { token?: string | null };
};

export async function verifyAccountPassword(input: {
  email: string;
  password: string;
  expectedUserId: string;
  login: (credentials: { email: string; password: string }) => Promise<PasswordProofSession>;
  revokeVerificationSession: (token: string) => Promise<void>;
}): Promise<AccountPasswordProof> {
  const email = input.email.trim().toLowerCase();
  const expectedUserId = input.expectedUserId.trim();
  const password = input.password;
  if (!email || !expectedUserId || !password) {
    return 'failed';
  }

  let created: PasswordProofSession;
  try {
    created = await input.login({ email, password });
  } catch {
    return 'failed';
  }

  const verificationToken = String(created.session?.token || '').trim();
  const sameAccount = String(created.user?.id || '').trim() === expectedUserId;
  if (verificationToken) {
    try {
      await input.revokeVerificationSession(verificationToken);
    } catch {
      // The saved app session is unchanged. The extra proof session expires on its own.
    }
  }

  if (!sameAccount || !verificationToken) {
    return 'failed';
  }
  return 'success';
}
