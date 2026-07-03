import type { Href } from 'expo-router';
import * as Linking from 'expo-linking';

import type { CirclePermissionKey, CirclePermissions } from './types';

export const dashboardHref = '/(tabs)/dashboard' as const;
export const myCirclesHref = '/(tabs)/circles' as const;
export const createCircleHref = '/(tabs)/create-circle' as const;

export function circleWorkspaceHref(circleId: string, tab?: string): Href {
  return {
    pathname: '/circle/workspace',
    params: tab ? { circleId, tab } : { circleId },
  };
}

export function circleInviteHref(circleId: string): Href {
  return {
    pathname: '/circle/invite',
    params: { circleId },
  };
}

export function contributionHref(circleId: string): Href {
  return {
    pathname: '/payment/contribution',
    params: { circleId },
  };
}

export function circlePaymentSetupHref(circleId: string): Href {
  return {
    pathname: '/circle/payment-setup',
    params: { circleId },
  };
}

export function canAccessCircleRoute(input: {
  requestedCircleId: string | null;
  authoritativeCircleId: string;
  membershipCircleId: string;
  membershipStatus: string;
  permissions: CirclePermissions;
  requiredPermission: CirclePermissionKey;
}) {
  return (
    Boolean(input.requestedCircleId) &&
    input.requestedCircleId === input.authoritativeCircleId &&
    input.requestedCircleId === input.membershipCircleId &&
    input.membershipStatus === 'active' &&
    input.permissions[input.requiredPermission]
  );
}

export function postAuthHrefFromUrl(url: string | null): Href {
  if (!url) {
    return dashboardHref;
  }

  const parsed = Linking.parse(url);
  const path = normalizeParsedPath(parsed);
  const circleId = readQueryString(parsed.queryParams?.circleId);

  if (path === 'circle/workspace' && circleId) {
    return circleWorkspaceHref(circleId);
  }
  if (path === 'circle/invite' && circleId) {
    return circleInviteHref(circleId);
  }
  if (path === 'payment/contribution' && circleId) {
    return contributionHref(circleId);
  }
  if (path === '(tabs)/circles' || path === 'circles') {
    return myCirclesHref;
  }

  return dashboardHref;
}

function normalizePath(path: string | null) {
  return String(path ?? '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function normalizeParsedPath(parsed: Linking.ParsedURL) {
  const path = normalizePath(parsed.path);
  const hostname = normalizePath(parsed.hostname);
  const customScheme = parsed.scheme !== 'http' && parsed.scheme !== 'https';

  return customScheme && hostname ? normalizePath(`${hostname}/${path}`) : path;
}

function readQueryString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() || null : value?.trim() || null;
}
