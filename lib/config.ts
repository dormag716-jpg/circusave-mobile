export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
