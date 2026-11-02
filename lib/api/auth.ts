import { federatedRequestBody, interpretFederatedPayload, type FederatedIdentityProof, type FederatedSignInResult } from '../auth/federatedSignIn';
import { readVerificationRequired, type RegistrationVerificationRequired } from '../auth/registrationVerification';
import { freeEntitlements, normalizeEntitlements, type Entitlements } from '../billing/entitlements';
import { currentEmailLanguage } from '../i18n/emailLanguage';
import { ApiError } from '../platform/networkErrors';
import { isRecord, readString, requestJson } from './http';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at?: string | null;
  preferredMarket?: string;
  reliabilityScore?: number;
};

export type AuthSession = {
  id: string;
  user_id: string;
  token_type: 'Bearer';
  token?: string;
  created_at: string;
  expires_at: string;
};

export type AuthResponse = {
  user: AuthUser;
  session: AuthSession;
};

export type PasswordResetRequestResult = {
  accepted: true;
  challengeId: string;
  expiresIn: number;
  message: string;
  devCode?: string;
};

export type PasswordResetVerificationResult = {
  verified: true;
  resetToken: string;
  expiresAt: string;
};

export type PasswordResetResult = {
  reset: true;
  sessions_cleared?: boolean;
};

function normalizeAuthResponse(payload: unknown, requireToken: boolean): AuthResponse {
  if (!isRecord(payload) || !isRecord(payload.user) || !isRecord(payload.session)) {
    throw new ApiError('Authentication response was invalid.', 500);
  }

  const user = payload.user;
  const session = payload.session;
  const normalized: AuthResponse = {
    user: {
      id: readString(user.id),
      name: readString(user.name),
      email: readString(user.email).toLowerCase(),
      role: readString(user.role),
      created_at: readString(user.created_at),
      last_login_at: readString(user.last_login_at) || null,
      preferredMarket: readString(
        user.preferredMarket ?? user.preferred_market ?? user.market,
      ) || undefined,
    },
    session: {
      id: readString(session.id),
      user_id: readString(session.user_id ?? session.userId),
      token_type: 'Bearer',
      token: readString(session.token) || undefined,
      created_at: readString(session.created_at ?? session.createdAt),
      expires_at: readString(session.expires_at ?? session.expiresAt),
    },
  };

  if (
    !normalized.user.id ||
    !normalized.user.name ||
    !normalized.user.email ||
    !normalized.session.id ||
    !normalized.session.user_id ||
    !normalized.session.created_at ||
    !normalized.session.expires_at ||
    (requireToken && !normalized.session.token)
  ) {
    throw new ApiError('Authentication response was invalid.', 500);
  }

  return normalized;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/mobile/login', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    }),
  });
  return normalizeAuthResponse(payload, true);
}

export type RegistrationLegalAcceptance = {
  acceptedLegal: true;
  termsVersion: string;
  privacyVersion: string;
  fundsDisclosureVersion: string;
  electronicConsentVersion: string;
};

export type RegisterResult =
  | { status: 'authenticated'; auth: AuthResponse }
  | RegistrationVerificationRequired;

/**
 * Starts a sign-up. The Backend emails a code and returns `verification_required`
 * (no account and no session yet). An older Backend still returns a session, which is
 * accepted so a new app keeps working until the Backend is updated.
 */
export async function register(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  legalAcceptance: RegistrationLegalAcceptance;
}): Promise<RegisterResult> {
  const payload = await requestJson<unknown>('/auth/mobile/register', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || undefined,
      password: input.password,
      acceptedLegal: input.legalAcceptance.acceptedLegal,
      termsVersion: input.legalAcceptance.termsVersion,
      privacyVersion: input.legalAcceptance.privacyVersion,
      fundsDisclosureVersion: input.legalAcceptance.fundsDisclosureVersion,
      electronicConsentVersion: input.legalAcceptance.electronicConsentVersion,
      language: currentEmailLanguage(),
    }),
  });
  const pending = readVerificationRequired(payload);
  if (pending) {
    return pending;
  }
  return { status: 'authenticated', auth: normalizeAuthResponse(payload, true) };
}

/** Completes a sign-up with the emailed code; returns the new session. */
export async function verifyRegistration(input: {
  signupId: string;
  email: string;
  code: string;
}): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/mobile/register/verify', {
    method: 'POST',
    body: JSON.stringify({
      signupId: input.signupId,
      email: input.email.trim().toLowerCase(),
      code: input.code.trim(),
    }),
  });
  return normalizeAuthResponse(payload, true);
}

/** Asks for another code for a sign-up that is still waiting. */
export async function resendRegistrationCode(input: {
  signupId: string;
  email: string;
}): Promise<RegistrationVerificationRequired> {
  const payload = await requestJson<unknown>('/auth/mobile/register/resend', {
    method: 'POST',
    body: JSON.stringify({
      signupId: input.signupId,
      email: input.email.trim().toLowerCase(),
      language: currentEmailLanguage(),
    }),
  });
  const pending = readVerificationRequired(payload);
  if (!pending) {
    throw new ApiError('The server response was not understood.', 500, payload);
  }
  return pending;
}

export async function signInWithFederatedProvider(input: {
  proof: FederatedIdentityProof;
  password?: string;
  name?: string;
  phone?: string;
  legalAcceptance?: RegistrationLegalAcceptance;
}): Promise<FederatedSignInResult> {
  const path =
    input.proof.provider === 'apple' ? '/auth/mobile/apple' : '/auth/mobile/google';
  const payload = await requestJson<unknown>(path, {
    method: 'POST',
    body: JSON.stringify(
      federatedRequestBody({
        proof: input.proof,
        password: input.password,
        name: input.name,
        phone: input.phone,
        legalAcceptance: input.legalAcceptance,
      }),
    ),
  });
  const result = interpretFederatedPayload(payload);
  if (result.status === 'authenticated') {
    return { status: 'authenticated', auth: normalizeAuthResponse(payload, true) };
  }
  return result;
}

export function requestPasswordReset(input: {
  email: string;
}): Promise<PasswordResetRequestResult> {
  return requestJson<PasswordResetRequestResult>('/auth/forgot-password/request', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      language: currentEmailLanguage(),
    }),
  });
}

export async function verifyPasswordReset(input: {
  email: string;
  code: string;
}): Promise<PasswordResetVerificationResult> {
  const payload = await requestJson<unknown>('/auth/forgot-password/verify', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      code: input.code,
    }),
  });

  if (
    !isRecord(payload) ||
    payload.verified !== true ||
    !readString(payload.resetToken) ||
    !readString(payload.expiresAt)
  ) {
    throw new ApiError('Password reset verification response was invalid.', 500);
  }

  return {
    verified: true,
    resetToken: readString(payload.resetToken),
    expiresAt: readString(payload.expiresAt),
  };
}

export async function resetPassword(input: {
  resetToken: string;
  newPassword: string;
}): Promise<PasswordResetResult> {
  const payload = await requestJson<unknown>('/auth/forgot-password/reset', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!isRecord(payload) || payload.reset !== true) {
    throw new ApiError('Password reset response was invalid.', 500);
  }

  return {
    reset: true,
    sessions_cleared:
      typeof payload.sessions_cleared === 'boolean'
        ? payload.sessions_cleared
        : undefined,
  };
}

export async function getAuthSession(token: string): Promise<AuthResponse> {
  const payload = await requestJson<unknown>('/auth/session', { token });
  return normalizeAuthResponse(payload, false);
}

export function getCurrentUser(token: string): Promise<AuthUser> {
  return requestJson<AuthUser>('/auth/me', { token });
}

/**
 * Backend-authoritative Premium entitlements.
 * Prefer this over users.role for plan and feature gates.
 * Fail closed to free on network/API errors (never invent Premium).
 */
export async function getAuthoritativeEntitlements(
  token: string,
): Promise<Entitlements> {
  const payload = await requestJson<unknown>('/auth/me/entitlements', {
    token,
    revalidate: true,
  });
  return normalizeEntitlements(payload);
}

export async function getEntitlements(token: string): Promise<Entitlements> {
  try {
    return await getAuthoritativeEntitlements(token);
  } catch {
    return freeEntitlements();
  }
}

export async function getFreshContributionPaymentsCapability(
  token: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const payload = await requestJson<unknown>('/auth/me/entitlements', {
    token,
    revalidate: true,
    signal,
  });
  if (!isRecord(payload) || !isRecord(payload.capabilities)) {
    return false;
  }
  return payload.capabilities.contributionPaymentsEnabled === true;
}

export async function logout(token: string, signal?: AbortSignal): Promise<void> {
  await requestJson<unknown>('/auth/logout', {
    method: 'POST',
    token,
    signal,
  });
}

/**
 * Registers the device's Expo push token with the backend so the server can
 * send targeted push notifications to this user's device.
 * Called once after every successful login.
 */
export function registerPushToken(
  token: string,
  pushToken: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return requestJson<unknown>('/auth/device/push-token', {
    method: 'POST',
    token,
    signal,
    body: JSON.stringify({ pushToken, platform: 'expo', timezone: deviceTimeZone() }),
  });
}

/** IANA zone name (e.g. "America/New_York") so the server can skip the user's night. */
function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function unregisterPushToken(
  token: string,
  pushToken: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return requestJson<unknown>('/auth/device/push-token', {
    method: 'DELETE',
    token,
    signal,
    body: JSON.stringify({ pushToken }),
  });
}

export async function exportUserData(token: string): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>('/auth/me/export', { token });
}

export async function deleteAccount(
  token: string,
  password: string,
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>('/auth/me/delete', {
    method: 'POST',
    token,
    body: JSON.stringify({ password }),
  });
}
