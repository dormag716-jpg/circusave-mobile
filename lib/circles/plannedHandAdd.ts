/**
 * Pure helpers for manually adding a planned hand from the invite screen.
 * Phone and email stay independent fields and independent submitted properties.
 */

export type PlannedHandAddInput = {
  fullName: string;
  phone: string;
  email: string;
};

export type PlannedHandAddPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

export type PlannedHandAddFieldError =
  | 'fullName'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'contactRequired';

export type PlannedHandAddFieldErrors = {
  fullName?: PlannedHandAddFieldError;
  phone?: PlannedHandAddFieldError;
  email?: PlannedHandAddFieldError;
  contact?: PlannedHandAddFieldError;
};

export type PlannedHandAddResult =
  | { ok: true; payload: PlannedHandAddPayload; errors: PlannedHandAddFieldErrors }
  | { ok: false; payload: null; errors: PlannedHandAddFieldErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function digitsOnly(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

export function isValidPhoneNumber(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidEmailAddress(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

export function parseFullName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

export function validatePlannedHandAdd(
  input: PlannedHandAddInput,
): PlannedHandAddResult {
  const errors: PlannedHandAddFieldErrors = {};
  const { firstName, lastName } = parseFullName(input.fullName);
  const phone = String(input.phone || '').trim();
  const email = String(input.email || '').trim();

  if (!firstName) {
    errors.fullName = 'fullName';
  }
  if (phone && !isValidPhoneNumber(phone)) {
    errors.phone = 'invalidPhone';
  }
  if (email && !isValidEmailAddress(email)) {
    errors.email = 'invalidEmail';
  }

  const hasValidPhone = Boolean(phone) && !errors.phone;
  const hasValidEmail = Boolean(email) && !errors.email;
  if (!hasValidPhone && !hasValidEmail) {
    errors.contact = 'contactRequired';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, payload: null, errors };
  }

  return {
    ok: true,
    payload: {
      firstName,
      lastName,
      phone: hasValidPhone ? phone : '',
      email: hasValidEmail ? email : '',
    },
    errors: {},
  };
}
