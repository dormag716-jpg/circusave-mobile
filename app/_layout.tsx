import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';

import { DeviceLockProvider, useDeviceLock } from '@/components/DeviceLock';
import { useColorScheme } from '@/components/useColorScheme';
import {
  resetNavigationToLogin,
  shouldDeferProtectedNavigation,
  shouldIssueSignedOutReset,
} from '@/lib/authBoundary';
import { AuthSessionProvider, useAuthSession } from '@/lib/authContext';
import { getCircleDetail } from '@/lib/api';
import { EntitlementsProvider, useEntitlements } from '@/lib/entitlementsContext';
import { initializeI18n } from '@/lib/i18n';
import { shouldHideLaunchSplash } from '@/lib/launchSplash';
import { MarketProvider } from '@/lib/market';
import { circleWorkspaceHref, dashboardHref } from '@/lib/navigation';
import { authorizeNotificationNavigation } from '@/lib/notificationNavigation';
import { initializeNotifications, setupNotificationListener } from '@/lib/notifications';
import { logClientError } from '@/lib/errorLogging';
import { registerUnauthorizedSessionHandler } from '@/lib/sessionExpiry';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'login',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    let active = true;

    void initializeI18n()
      .catch((initializationError) => {
        logClientError('Unable to initialize localization.', initializationError);
      })
      .finally(() => {
        if (active) {
          setI18nReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !i18nReady) {
      return;
    }
    // Do not hide the splash here — wait for the first real route frame.
    // Fire-and-forget — notification failure must never crash the app.
    void initializeNotifications();

  }, [i18nReady, loaded]);

  if (!loaded || !i18nReady) {
    return null;
  }

  return <RootLayoutNav />;
}

function LaunchSplashController() {
  const { status } = useAuthSession();
  const { isInitializing } = useDeviceLock();
  const hidden = useRef(false);

  useEffect(() => {
    if (hidden.current) {
      return;
    }
    if (
      !shouldHideLaunchSplash({
        authStatus: status,
        deviceLockInitializing: isInitializing,
      })
    ) {
      return;
    }
    hidden.current = true;
    void SplashScreen.hideAsync();
  }, [isInitializing, status]);

  return null;
}

function SessionTree() {
  return (
    <AuthSessionProvider>
      <EntitlementsProvider>
        <MarketProvider>
          <DeviceLockProvider>
            <LaunchSplashController />
            <SessionExpiryController />
            <NotificationNavigationController />
            <UnauthenticatedRouteGuard />
            <AuthenticatedStack />
          </DeviceLockProvider>
        </MarketProvider>
      </EntitlementsProvider>
    </AuthSessionProvider>
  );
}

function SessionExpiryController() {
  const { status, signOut } = useAuthSession();
  const { revokeContributionPaymentsCapability } = useEntitlements();
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    return registerUnauthorizedSessionHandler(async () => {
      if (statusRef.current !== 'authenticated') {
        return;
      }
      revokeContributionPaymentsCapability();
      await signOut();
      resetNavigationToLogin(router);
    });
  }, [revokeContributionPaymentsCapability, signOut]);

  return null;
}

type NotificationTarget = {
  screen: string;
  circleId: string;
  tab?: string;
  conversationId?: string;
};

function NotificationNavigationController() {
  const { session, status, setPostAuthTarget } = useAuthSession();
  const { isInitializing, isLocked } = useDeviceLock();
  const authToken = session?.session.token;
  const pendingRef = useRef<NotificationTarget | null>(null);
  const followGeneration = useRef(0);
  const defer = shouldDeferProtectedNavigation({
    locked: isLocked,
    initializing: isInitializing,
  });
  const deferRef = useRef(defer);
  deferRef.current = defer;

  const openTarget = useCallback(
    async (data: NotificationTarget, generation: number) => {
      if (data.screen !== 'workspace' || !data.circleId) {
        return;
      }
      if (deferRef.current) {
        pendingRef.current = data;
        return;
      }

      const currentAuthToken = String(authToken || '').trim();
      if (status !== 'authenticated' || !currentAuthToken) {
        if (followGeneration.current !== generation) {
          return;
        }
        setPostAuthTarget(dashboardHref);
        resetNavigationToLogin(router);
        return;
      }

      const decision = await authorizeNotificationNavigation({
        authenticated: true,
        authorize: () =>
          getCircleDetail(currentAuthToken, data.circleId, {
            revalidate: true,
          }),
      });
      if (followGeneration.current !== generation || deferRef.current) {
        if (deferRef.current) {
          pendingRef.current = data;
        }
        return;
      }
      if (decision === 'workspace') {
        router.push(
          circleWorkspaceHref(
            data.circleId,
            data.tab,
            data.conversationId,
          ),
        );
      } else {
        router.replace(dashboardHref);
      }
    },
    [authToken, setPostAuthTarget, status],
  );

  useEffect(() => {
    const generation = ++followGeneration.current;
    const subPromise = setupNotificationListener(async (data) => {
      if (followGeneration.current !== generation) {
        return;
      }
      await openTarget(data, generation);
    });

    return () => {
      subPromise.then((sub) => sub?.remove()).catch(() => {});
    };
  }, [openTarget]);

  useEffect(() => {
    if (defer) {
      return;
    }
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    pendingRef.current = null;
    void openTarget(pending, followGeneration.current);
  }, [defer, openTarget]);

  return null;
}

function UnauthenticatedRouteGuard() {
  const { status } = useAuthSession();
  const pathname = usePathname();
  const lastResetKey = useRef<string | null>(null);

  useEffect(() => {
    const decision = shouldIssueSignedOutReset({
      status,
      pathname,
      lastResetKey: lastResetKey.current,
    });
    lastResetKey.current = decision.nextKey;
    if (!decision.reset) {
      return;
    }
    resetNavigationToLogin(router);
  }, [pathname, status]);

  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="dark" />
      <SessionTree />
    </ThemeProvider>
  );
}

function AuthenticatedStack() {
  const { postAuthTarget, setPostAuthTarget, status } = useAuthSession();
  const { isInitializing, isLocked } = useDeviceLock();
  const authenticated = status === 'authenticated';

  useEffect(() => {
    if (
      authenticated &&
      postAuthTarget &&
      !shouldDeferProtectedNavigation({
        locked: isLocked,
        initializing: isInitializing,
      })
    ) {
      router.replace(postAuthTarget);
      setPostAuthTarget(null);
    }
  }, [authenticated, isInitializing, isLocked, postAuthTarget, setPostAuthTarget]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="login"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="create-account" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="create-circle/setup" options={{ headerShown: false }} />
      <Stack.Screen name="circle/workspace" options={{ headerShown: false }} />
      <Stack.Screen name="circle/assistant" options={{ headerShown: false }} />
      <Stack.Screen name="circle/reminder-schedule" options={{ headerShown: false }} />
      <Stack.Screen name="smart-reminders" options={{ headerShown: false }} />
      <Stack.Screen name="circle/invite" options={{ headerShown: false }} />
      <Stack.Screen name="invite/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="circle/payment-setup" options={{ headerShown: false }} />
      <Stack.Screen name="circle/agreement-review" options={{ headerShown: false }} />
      <Stack.Screen name="circle/additional-hand" options={{ headerShown: false }} />
      {/* circle/history is intentionally not registered until the backend
          history endpoint is connected. The screen file is kept as a shell.
          Re-add the Stack.Screen line below when ready:
          <Stack.Screen name="circle/history" options={{ headerShown: false }} /> */}
      <Stack.Screen name="payment/contribution" options={{ headerShown: false }} />
      <Stack.Screen name="automated-payments" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="security" options={{ headerShown: false }} />
      <Stack.Screen name="language" options={{ headerShown: false }} />
      <Stack.Screen name="legal/index" options={{ headerShown: false }} />
      <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
      <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
      <Stack.Screen name="legal/how-money-moves" options={{ headerShown: false }} />
      <Stack.Screen name="legal/electronic-consent" options={{ headerShown: false }} />
    </Stack>
  );
}
