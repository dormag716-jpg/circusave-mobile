import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { DeviceLockProvider } from '@/components/DeviceLock';
import { useColorScheme } from '@/components/useColorScheme';
import { AuthSessionProvider, useAuthSession } from '@/lib/authContext';
import { MarketProvider } from '@/lib/market';
import { circleWorkspaceHref } from '@/lib/navigation';
import { initializeNotifications, setupNotificationListener } from '@/lib/notifications';

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
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      // Set up the foreground notification handler once fonts are ready.
      // Fire-and-forget — notification failure must never crash the app.
      void initializeNotifications();

      // Set up deep link listener for tapped notifications
      const setupListener = async () => {
        const subscription = await setupNotificationListener((data) => {
          if (data.screen === 'workspace' && data.circleId) {
            router.push(circleWorkspaceHref(data.circleId, data.tab));
          }
        });
        return subscription;
      };
      
      const subPromise = setupListener();

      return () => {
        subPromise.then((sub) => sub?.remove()).catch(() => {});
      };
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const isStripeSupported = Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {isStripeSupported ? (
        <StripeProvider publishableKey="pk_test_51Toz5oGYTxAEnaSfXEezxF5hmboh2RBPXxe1lrHfOTlkFg5PjgfC4nyCwuwJXBh96XtqzCMvUUBnWGiRj7EBr2KH00OjkeVaHG" merchantIdentifier="merchant.com.circusave">
          <AuthSessionProvider>
            <MarketProvider>
              <DeviceLockProvider>
                <AuthenticatedStack />
              </DeviceLockProvider>
            </MarketProvider>
          </AuthSessionProvider>
        </StripeProvider>
      ) : (
        <AuthSessionProvider>
          <MarketProvider>
            <DeviceLockProvider>
              <AuthenticatedStack />
            </DeviceLockProvider>
          </MarketProvider>
        </AuthSessionProvider>
      )}
    </ThemeProvider>
  );
}

function AuthenticatedStack() {
  const { postAuthTarget, setPostAuthTarget, status } = useAuthSession();
  const authenticated = status === 'authenticated';
  const unauthenticated = status === 'unauthenticated' || status === 'error';

  useEffect(() => {
    if (authenticated && postAuthTarget) {
      router.replace(postAuthTarget);
      setPostAuthTarget(null);
    }
  }, [authenticated, postAuthTarget, setPostAuthTarget]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={unauthenticated}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="create-account" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={authenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="create-circle/setup" options={{ headerShown: false }} />
        <Stack.Screen name="circle/workspace" options={{ headerShown: false }} />
        <Stack.Screen name="circle/invite" options={{ headerShown: false }} />
        <Stack.Screen name="invite/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="circle/payment-setup" options={{ headerShown: false }} />
        {/* circle/history is intentionally not registered until the backend
            history endpoint is connected. The screen file is kept as a shell.
            Re-add the Stack.Screen line below when ready:
            <Stack.Screen name="circle/history" options={{ headerShown: false }} /> */}
        <Stack.Screen name="payment/contribution" options={{ headerShown: false }} />
        <Stack.Screen name="automated-payments" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ headerShown: false }} />
        <Stack.Screen name="security" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
