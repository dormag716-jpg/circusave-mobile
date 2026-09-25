export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

export const APP_SCHEME = 'circusavemobile';

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '';

export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || '';

export function isProductionAppEnv(appEnv: string | null | undefined = APP_ENV): boolean {
  return String(appEnv || '').trim().toLowerCase() === 'production';
}
