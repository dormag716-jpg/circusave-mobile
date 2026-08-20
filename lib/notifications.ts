import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { i18n } from './i18n';
import { logClientWarning } from './errorLogging';
import {
  notificationCopy,
  type NotificationType,
} from './i18n/financial-presentation';
import { colors } from './theme';

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
      name: i18n.t('notifications:channel'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.success,
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
      logClientWarning('Push token unavailable', err);
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
  const copy = notificationCopy('payment_confirmed', {}, i18n.t);
  return scheduleLocalNotification({
    title: copy.title,
    body: copy.body,
    data: { screen: 'workspace', circleId },
    seconds: 2,
  });
}

export async function scheduleFinancialNotification(input: {
  type: NotificationType | string;
  circleId: string;
  data?: { name?: string; round?: number | string; circle?: string };
  seconds?: number;
}): Promise<NotificationResult> {
  const copy = notificationCopy(input.type, input.data || {}, i18n.t);
  return scheduleLocalNotification({
    title: copy.title,
    body: copy.body,
    data: {
      ...input.data,
      type: input.type,
      screen: 'workspace',
      circleId: input.circleId,
    },
    seconds: input.seconds,
  });
}

/**
 * Sets up a listener for when a user taps on a notification.
 * Must be called when the app initializes.
 * Returns an EventSubscription that should be cleaned up.
 */
export async function setupNotificationListener(
  onNavigate: (data: {
    screen: string;
    circleId: string;
    tab?: string;
    conversationId?: string;
  }) => void,
) {
  if (isExpoGo) {
    return null;
  }

  const Notifications = await import('expo-notifications');

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (!data) return;

    const circleId =
      typeof data.circleId === 'string'
        ? data.circleId
        : typeof data.circle_id === 'string'
          ? data.circle_id
          : null;
    const conversationId =
      typeof data.conversationId === 'string'
        ? data.conversationId
        : conversationIdFromNotificationLink(
            typeof data.link === 'string' ? data.link : null,
          );
    const notificationType =
      typeof data.type === 'string'
        ? data.type
        : typeof data.notification_type === 'string'
          ? data.notification_type
          : null;

    // Direct screen routing
    if (typeof data.screen === 'string' && circleId) {
      onNavigate({
        screen: data.screen,
        circleId,
        conversationId: conversationId || undefined,
      });
      return;
    }

    // Action-based routing (Phase 5)
    if (notificationType === 'swap_request') {
      if (circleId) {
        onNavigate({ screen: 'workspace', circleId, tab: 'people' });
      }
    } else if (
      notificationType === 'new_chat_message' ||
      notificationType === 'chat_message'
    ) {
      if (circleId) {
        onNavigate({
          screen: 'workspace',
          circleId,
          tab: 'chat',
          conversationId: conversationId || undefined,
        });
      }
    }
  });

  return subscription;
}

export function conversationIdFromNotificationLink(link: string | null) {
  if (!link) return null;
  const match = link.match(/[?&]conversationId=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
