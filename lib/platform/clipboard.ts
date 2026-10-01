/**
 * Safe clipboard helpers.
 *
 * `expo-clipboard` requires a native rebuild after install. Older development
 * binaries throw "Cannot find native module 'ExpoClipboard'" if we import it.
 * Callers should treat non-clipboard results as successful user-facing fallbacks.
 */
import { Share } from 'react-native';

export type CopyResult = 'clipboard' | 'share' | 'shown';

export async function copyText(text: string): Promise<CopyResult> {
  const value = String(text || '').trim();
  if (!value) {
    throw new Error('Nothing to copy.');
  }

  try {
    // Dynamic import keeps app startup working when the native module is missing.
    const Clipboard = await import('expo-clipboard');
    if (typeof Clipboard.setStringAsync === 'function') {
      await Clipboard.setStringAsync(value);
      return 'clipboard';
    }
  } catch {
    // Native module not present in this binary — fall through.
  }

  try {
    await Share.share({ message: value });
    return 'share';
  } catch {
    return 'shown';
  }
}
