import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { i18n } from '../i18n';
import { logClientWarning } from './errorLogging';
import {
  notificationCopy,
  type NotificationType,
} from '../i18n/financial-presentation';
import { colors } from '../shared/theme';
import {
  createHandledResponseTracker,
  resolveNotificationTarget,
} from './notificationTarget';

export type NotificationResult =
  | { ok: true; token: string }
  | { ok: true; token: null }
  | { ok: false; reason: string };

const handledResponses = createHandledResponseTracker();

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

export async function getExistingPushToken(): Promise<NotificationResult> {
  if (isExpoGo) {
    return {
      ok: false,
      reason: 'Push notifications require a development build.',
    };
  }

  const Notifications = await import('expo-notifications');
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) {
    return { ok: false, reason: 'Notification permission was not granted.' };
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return { ok: true, token: tokenResult.data ?? null };
  } catch (error) {
    logClientWarning('Existing push token unavailable', error);
    return { ok: false, reason: 'Could not obtain the existing push token.' };
  }
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
  }) => void | Promise<void>,
) {
  if (isExpoGo) {
    return null;
  }

  const Notifications = await import('expo-notifications');

  const handleResponse = (
    response: import('expo-notifications').NotificationResponse,
  ) => {
    const request = response.notification.request;
    const key = `${request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
    // The same tap can reach us twice: through the listener and through the
    // cold-start read, or again when this setup runs after an auth change.
    if (!handledResponses.markHandled(key)) return;

    const target = resolveNotificationTarget(
      (request.content.data ?? null) as Record<string, unknown> | null,
    );
    if (!target) return;
    void onNavigate({
      screen: target.screen,
      circleId: target.circleId,
      tab: target.tab,
      conversationId: target.conversationId,
    });
  };

  const subscription =
    Notifications.addNotificationResponseReceivedListener(handleResponse);

  // A tap that launched the app from a killed state never reaches the listener
  // above; the last response is only available through this getter.
  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse) {
    handleResponse(lastResponse);
    Notifications.clearLastNotificationResponse();
  }

  return subscription;
}

export { conversationIdFromNotificationLink } from './notificationTarget';
