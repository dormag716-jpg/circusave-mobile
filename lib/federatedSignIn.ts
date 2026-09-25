import type { AuthResponse, RegistrationLegalAcceptance } from '@/lib/api';
import { sha256Hex } from '@/lib/sha256';

export type FederatedProvider = 'google' | 'apple';

export type FederatedIdentityProof = {
  provider: FederatedProvider;
  idToken: string;
  authNonce: string;
  name?: string;
};

export type FederatedSignInResult =
  | { status: 'authenticated'; auth: AuthResponse }
  | { status: 'link_required'; provider: FederatedProvider; email: string }
  | {
      status: 'registration_required';
      provider: FederatedProvider;
      email: string;
      name: string;
    };

export type HeldFederatedCredential = FederatedIdentityProof & {
  email: string;
  name: string;
};

let heldCredential: HeldFederatedCredential | null = null;

export function holdFederatedCredential(value: HeldFederatedCredential): void {
  heldCredential = {
    provider: value.provider,
    idToken: value.idToken,
    authNonce: value.authNonce,
    email: value.email,
    name: value.name,
  };
}

export function readFederatedCredential(): HeldFederatedCredential | null {
  return heldCredential ? { ...heldCredential } : null;
}

export function clearFederatedCredential(): void {
  heldCredential = null;
}

export function randomHex(byteLength: number): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random source is unavailable.');
  }
  const bytes = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAuthNonce(): { raw: string; hash: string } {
  const raw = randomHex(32);
  return { raw, hash: sha256Hex(raw) };
}

export function splitDisplayName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: '', last: '' };
  }
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function interpretFederatedPayload(payload: unknown): FederatedSignInResult {
  if (!isRecord(payload)) {
    throw new Error('Authentication response was invalid.');
  }
  const status = readString(payload.status);
  const provider = readString(payload.provider);
  if (status === 'link_required' || status === 'registration_required') {
    if (provider !== 'google' && provider !== 'apple') {
      throw new Error('Authentication response was invalid.');
    }
    const email = readString(payload.email).toLowerCase();
    if (!email) {
      throw new Error('Authentication response was invalid.');
    }
    if (status === 'link_required') {
      return { status, provider, email };
    }
    return { status, provider, email, name: readString(payload.name) };
  }
  if (status !== 'authenticated' || !isRecord(payload.user) || !isRecord(payload.session)) {
    throw new Error('Authentication response was invalid.');
  }
  const auth = payload as unknown as AuthResponse;
  if (!readString(auth.session?.token)) {
    throw new Error('Authentication response was invalid.');
  }
  return { status: 'authenticated', auth };
}

export function federatedRequestBody(input: {
  proof: FederatedIdentityProof;
  password?: string;
  name?: string;
  phone?: string;
  legalAcceptance?: RegistrationLegalAcceptance;
}): Record<string, unknown> {
  const name = input.name || input.proof.name;
  return {
    idToken: input.proof.idToken,
    authNonce: input.proof.authNonce,
    ...(input.password ? { password: input.password } : {}),
    ...(name ? { name } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.legalAcceptance ?? {}),
  };
}
