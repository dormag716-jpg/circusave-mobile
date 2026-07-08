import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type NotificationResult =
  | { ok: true; token: string }
  | { ok: true; token: null }
  | { ok: false; reason: string };

// Expo Go doesn't support push notifications — local schedule still works via
// the raw expo-notifications module in development builds.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

export function areNotificationsAvailableInThisBuild(): boolean {
  return !isExpoGo;
}

/**
 * Must be called once on app boot (in _layout.tsx).
 * Registers the foreground notification handler so banners appear while the
 * app is open.
 */
export async function initializeNotifications(): Promise<NotificationResult> {
  if (isExpoGo) {
    return { ok: false, reason: 'Notifications require a development build.' };
  }

  const Notifications = await import('expo-notifications');

  // Ensure Android channel exists before handler is set
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'CircuSave updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  return { ok: true, token: null };
}

/**
 * Requests permission and obtains the Expo push token.
 * Returns the token string on success so the caller can register it with the
 * backend.
 */
export async function registerForPushNotifications(): Promise<NotificationResult> {
  if (isExpoGo) {
    return {
      ok: false,
      reason: 'Push notifications require a development build.',
    };
  }

  const Notifications = await import('expo-notifications');

  // 1. Request permission
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) {
    return { ok: false, reason: 'Notification permission was not granted.' };
  }

  // 2. Get the Expo push token — requires projectId from app.json EAS config
  let token: string | undefined;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = tokenResult.data;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isLocalDevMissingFirebase = 
      __DEV__ && 
      (errMsg.includes('Default FirebaseApp is not initialized') || 
       errMsg.includes('FCM credentials'));
       
    if (!isLocalDevMissingFirebase) {
      console.warn('[CircuSave] Push token unavailable:', err);
    }
    
    return {
      ok: false,
      reason: 'Could not obtain push token. Is this a development build with EAS?',
    };
  }
  return { ok: true, token: token ?? null };
}

/**
 * Schedules a local (on-device) notification with an optional delay.
 * Works in development builds; silently fails in Expo Go.
 */
export async function scheduleLocalNotification(input: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  seconds?: number;
}): Promise<NotificationResult> {
  if (isExpoGo) {
    return { ok: false, reason: 'Notifications require a development build.' };
  }

  const Notifications = await import('expo-notifications');

  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) {
    return { ok: false, reason: 'Notification permission was not granted.' };
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: input.data,
    },
    trigger:
      typeof input.seconds === 'number'
        ? {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: input.seconds,
          }
        : null,
  });

  return { ok: true, token: null };
}

/**
 * Convenience wrapper used by the Profile test button.
 * Shows a friendly message in Expo Go instead of crashing.
 */
export async function scheduleTestNotification(circleId: string): Promise<NotificationResult> {
  return scheduleLocalNotification({
    title: 'CircuSave',
    body: 'Your contribution was confirmed! ✅',
    data: { screen: 'workspace', circleId },
    seconds: 2,
  });
}

/**
 * Sets up a listener for when a user taps on a notification.
 * Must be called when the app initializes.
 * Returns an EventSubscription that should be cleaned up.
 */
export async function setupNotificationListener(
  onNavigate: (data: { screen: string; circleId: string; tab?: string }) => void,
) {
  if (isExpoGo) {
    return null;
  }

  const Notifications = await import('expo-notifications');

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (!data) return;

    // Direct screen routing
    if (typeof data.screen === 'string' && typeof data.circleId === 'string') {
      onNavigate({ screen: data.screen, circleId: data.circleId });
      return;
    }

    // Action-based routing (Phase 5)
    if (data.type === 'swap_request') {
      if (typeof data.circleId === 'string') {
        onNavigate({ screen: 'workspace', circleId: data.circleId, tab: 'people' });
      }
    } else if (data.type === 'new_chat_message') {
      if (typeof data.circleId === 'string') {
        onNavigate({ screen: 'workspace', circleId: data.circleId, tab: 'chat' });
      }
    }
  });

  return subscription;
}
