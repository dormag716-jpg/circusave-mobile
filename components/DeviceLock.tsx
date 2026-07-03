import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/lib/theme';

const SECURE_STORE_KEY = 'circusave_require_local_auth';

type DeviceLockContextType = {
  isLockEnabled: boolean;
  setLockEnabled: (enabled: boolean) => Promise<void>;
};

const DeviceLockContext = createContext<DeviceLockContextType>({
  isLockEnabled: false,
  setLockEnabled: async () => {},
});

export function useDeviceLock() {
  return useContext(DeviceLockContext);
}

export function DeviceLockProvider({ children }: { children: React.ReactNode }) {
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
        const enabled = stored === 'true';
        setIsLockEnabled(enabled);
        if (enabled) {
          setIsLocked(true);
          await authenticate();
        }
      } catch {
        // ignore
      } finally {
        setIsInitializing(false);
      }
    })();
  }, []);

  const authenticate = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      // Fallback if hardware/biometrics not set up
      setIsLocked(false);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock CircuSave',
      fallbackLabel: 'Use Passcode',
    });

    if (result.success) {
      setIsLocked(false);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground
        if (isLockEnabled) {
          setIsLocked(true);
          void authenticate();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isLockEnabled]);

  const setLockEnabled = async (enabled: boolean) => {
    await SecureStore.setItemAsync(SECURE_STORE_KEY, enabled ? 'true' : 'false');
    setIsLockEnabled(enabled);
  };

  if (isInitializing) {
    return <View style={styles.container} />; // blank screen while checking
  }

  return (
    <DeviceLockContext.Provider value={{ isLockEnabled, setLockEnabled }}>
      {children}
      {isLocked && (
        <SafeAreaView style={styles.lockOverlay} edges={['top', 'bottom']}>
          <View style={styles.lockContent}>
            <View style={styles.iconCircle}>
              <FontAwesome name="lock" size={48} color={colors.primary} />
            </View>
            <Text style={styles.title}>App Locked</Text>
            <Text style={styles.subtitle}>
              Verify your identity to access your savings circles.
            </Text>
            <Pressable style={styles.unlockButton} onPress={() => void authenticate()}>
              <Text style={styles.unlockButtonText}>Unlock App</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}
    </DeviceLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  lockContent: {
    alignItems: 'center',
    padding: spacing.screenX,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textStrong,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 32,
  },
  unlockButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: radii.pill,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
