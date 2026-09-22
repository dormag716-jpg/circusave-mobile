import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, usePathname } from 'expo-router';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resetNavigationToLogin, shouldCoverSignedOutRoute } from '@/lib/authBoundary';
import { login, logout } from '@/lib/api';
import { useAuthSession } from '@/lib/authContext';
import { verifyAccountPassword } from '@/lib/deviceLockPassword';
import {
  INITIAL_DEVICE_LOCK,
  deviceLockCoversProtectedContent,
  reduceDeviceLock,
  shouldStartBiometricPrompt,
  supportsNativeBiometrics,
  type BiometricPromptResult,
  type DeviceLockEvent,
} from '@/lib/deviceLockState';
import { colors, radii, spacing } from '@/lib/theme';

type DeviceLockContextType = {
  isLocked: boolean;
  isInitializing: boolean;
};

const DeviceLockContext = createContext<DeviceLockContextType>({
  isLocked: true,
  isInitializing: true,
});

export function useDeviceLock() {
  return useContext(DeviceLockContext);
}

function classifyBiometricResult(
  result: LocalAuthentication.LocalAuthenticationResult,
): BiometricPromptResult {
  if (result.success) {
    return 'success';
  }
  if (
    result.error === 'user_cancel' ||
    result.error === 'app_cancel' ||
    result.error === 'system_cancel'
  ) {
    return 'canceled';
  }
  if (
    result.error === 'not_available' ||
    result.error === 'not_enrolled' ||
    result.error === 'passcode_not_set' ||
    result.error === 'user_fallback'
  ) {
    return 'unavailable';
  }
  return 'failed';
}

export function DeviceLockProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('deviceLock');
  const { session, status } = useAuthSession();
  const pathname = usePathname();
  const [model, dispatch] = useReducer(reduceDeviceLock, INITIAL_DEVICE_LOCK);
  const [appState, setAppState] = useState(AppState.currentState);
  const [passwordDraft, setPasswordDraft] = useState('');
  const modelRef = useRef(model);
  const promptedGeneration = useRef(-1);
  const promptGenerationRef = useRef(model.promptGeneration);
  const biometricGate = useRef(false);
  const passwordGate = useRef(false);
  const attemptCounter = useRef(0);
  const sessionKey = session?.user.id && session.session.id
    ? `${session.user.id}:${session.session.id}`
    : '';
  const sessionKeyRef = useRef(sessionKey);
  modelRef.current = model;
  promptGenerationRef.current = model.promptGeneration;
  sessionKeyRef.current = sessionKey;

  useEffect(() => {
    dispatch({ type: 'auth_status', status, sessionKey });
  }, [sessionKey, status]);

  useEffect(() => {
    dispatch({ type: 'app_state', next: AppState.currentState });
    const subscription = AppState.addEventListener('change', (next) => {
      if (
        next === 'background' &&
        biometricGate.current &&
        Platform.OS === 'android' &&
        typeof LocalAuthentication.cancelAuthenticate === 'function'
      ) {
        void LocalAuthentication.cancelAuthenticate().catch(() => undefined);
      }
      setAppState(next);
      dispatch({ type: 'app_state', next });
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (model.phase !== 'locked') {
      promptedGeneration.current = -1;
      setPasswordDraft('');
    }
  }, [model.phase]);

  const runBiometric = async () => {
    if (biometricGate.current || passwordGate.current) {
      return;
    }
    if (!supportsNativeBiometrics(Platform.OS)) {
      dispatch({ type: 'show_password_fallback' });
      return;
    }
    const attemptId = attemptCounter.current + 1;
    const attemptSessionKey = sessionKeyRef.current;
    const started = reduceDeviceLock(modelRef.current, {
      type: 'biometric_started',
      attemptId,
      sessionKey: attemptSessionKey,
    });
    if (!started.authenticating || started.attemptId !== attemptId) {
      return;
    }
    attemptCounter.current = attemptId;
    biometricGate.current = true;
    promptedGeneration.current = promptGenerationRef.current;
    dispatch({
      type: 'biometric_started',
      attemptId,
      sessionKey: attemptSessionKey,
    });
    let outcome: BiometricPromptResult = 'unavailable';
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        outcome = 'unavailable';
      } else {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t('unlockPrompt'),
          cancelLabel: t('cancel'),
          fallbackLabel: '',
          disableDeviceFallback: true,
          biometricsSecurityLevel: 'strong',
        });
        outcome = classifyBiometricResult(result);
      }
    } catch {
      outcome = 'unavailable';
    } finally {
      biometricGate.current = false;
      const resultEvent: DeviceLockEvent = {
        type: 'biometric_result',
        result: outcome,
        attemptId,
        sessionKey: attemptSessionKey,
        appState: AppState.currentState,
      };
      const preview = reduceDeviceLock(modelRef.current, resultEvent);
      dispatch(resultEvent);
      if (
        preview.phase === 'locked' &&
        !preview.authenticating &&
        AppState.currentState === 'active' &&
        promptedGeneration.current !== promptGenerationRef.current
      ) {
        void runBiometric();
      }
    }
  };

  useEffect(() => {
    if (
      !supportsNativeBiometrics(Platform.OS) &&
      model.phase === 'locked' &&
      !model.passwordFallback &&
      !model.authenticating &&
      !model.passwordSubmitting
    ) {
      dispatch({ type: 'show_password_fallback' });
      return;
    }
    if (
      !shouldStartBiometricPrompt({
        phase: model.phase,
        authenticating: model.authenticating,
        passwordSubmitting: model.passwordSubmitting,
        passwordFallback: model.passwordFallback,
        appState,
        platform: Platform.OS,
        promptedGeneration: promptedGeneration.current,
        promptGeneration: model.promptGeneration,
      })
    ) {
      return;
    }
    const generation = model.promptGeneration;
    const timer = setTimeout(() => {
      if (promptedGeneration.current === generation) {
        return;
      }
      if (AppState.currentState !== 'active') {
        return;
      }
      if (
        modelRef.current.phase !== 'locked' ||
        modelRef.current.authenticating ||
        modelRef.current.passwordSubmitting ||
        modelRef.current.passwordFallback
      ) {
        return;
      }
      void runBiometric();
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [
    appState,
    model.authenticating,
    model.passwordFallback,
    model.passwordSubmitting,
    model.phase,
    model.promptGeneration,
    t,
  ]);

  const submitPassword = async () => {
    if (passwordGate.current || biometricGate.current) {
      return;
    }
    const password = passwordDraft;
    const attemptId = attemptCounter.current + 1;
    const attemptSessionKey = sessionKeyRef.current;
    const started = reduceDeviceLock(modelRef.current, {
      type: 'password_submitted',
      attemptId,
      sessionKey: attemptSessionKey,
    });
    if (!started.passwordSubmitting || started.attemptId !== attemptId) {
      return;
    }
    attemptCounter.current = attemptId;
    passwordGate.current = true;
    dispatch({
      type: 'password_submitted',
      attemptId,
      sessionKey: attemptSessionKey,
    });
    setPasswordDraft('');
    let outcome: 'success' | 'failed' = 'failed';
    try {
      const result = await verifyAccountPassword({
        email: session?.user.email || '',
        password,
        expectedUserId: session?.user.id || '',
        login,
        revokeVerificationSession: (token) => logout(token),
      });
      outcome = result === 'success' ? 'success' : 'failed';
    } catch {
      outcome = 'failed';
    } finally {
      passwordGate.current = false;
      dispatch({
        type: 'password_result',
        result: outcome,
        attemptId,
        sessionKey: attemptSessionKey,
        appState: AppState.currentState,
      });
    }
  };

  const value = useMemo<DeviceLockContextType>(
    () => ({
      isLocked: model.phase === 'locked',
      isInitializing: model.phase === 'initializing',
    }),
    [model.phase],
  );

  const coverLocked = deviceLockCoversProtectedContent(model);
  const coverSignedOut =
    model.phase === 'signed_out' && shouldCoverSignedOutRoute(pathname);
  const coverVisible = coverLocked || coverSignedOut;
  const showLock = model.phase === 'locked';
  const failureText =
    model.failure === 'password_failed'
      ? t('passwordFailed')
      : model.failure === 'biometric_canceled'
        ? t('canceled')
        : model.failure === 'biometric_failed'
          ? t('failed')
          : null;

  return (
    <DeviceLockContext.Provider value={value}>
      {children}
      <Modal
        visible={coverVisible}
        animationType="none"
        transparent={false}
        statusBarTranslucent
        presentationStyle="fullScreen"
        onRequestClose={() => {
          if (modelRef.current.phase === 'signed_out') {
            resetNavigationToLogin(router);
          }
        }}
      >
        <SafeAreaView style={styles.lockOverlay} edges={['top', 'bottom']}>
          {showLock ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.keyboard}
            >
              <View style={styles.lockContent}>
                <View style={styles.iconCircle}>
                  <FontAwesome name="lock" size={48} color={colors.primary} />
                </View>
                <Text style={styles.title}>{t('appLocked')}</Text>
                <Text style={styles.subtitle}>{t('verifyIdentity')}</Text>
                {failureText ? <Text style={styles.errorText}>{failureText}</Text> : null}
                {model.passwordFallback ? (
                  <>
                    <Text style={styles.passwordBody}>{t('passwordBody')}</Text>
                    <TextInput
                      value={passwordDraft}
                      onChangeText={setPasswordDraft}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      placeholder={t('passwordPlaceholder')}
                      placeholderTextColor={colors.subtle}
                      style={styles.input}
                      editable={!model.passwordSubmitting}
                      accessibilityLabel={t('passwordPlaceholder')}
                      onSubmitEditing={() => {
                        void submitPassword();
                      }}
                    />
                    <Pressable
                      style={styles.unlockButton}
                      onPress={() => {
                        void submitPassword();
                      }}
                      disabled={model.passwordSubmitting || passwordDraft.length === 0}
                      accessibilityRole="button"
                      accessibilityLabel={t('verifyPassword')}
                    >
                      {model.passwordSubmitting ? (
                        <ActivityIndicator color={colors.onColor} />
                      ) : (
                        <Text style={styles.unlockButtonText}>{t('verifyPassword')}</Text>
                      )}
                    </Pressable>
                    {supportsNativeBiometrics(Platform.OS) ? (
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => {
                          dispatch({ type: 'retry_biometric' } satisfies DeviceLockEvent);
                          void runBiometric();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('unlockApp')}
                      >
                        <Text style={styles.secondaryButtonText}>{t('unlockApp')}</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Pressable
                      style={styles.unlockButton}
                      onPress={() => {
                        void runBiometric();
                      }}
                      disabled={model.authenticating}
                      accessibilityRole="button"
                      accessibilityLabel={t('unlockApp')}
                    >
                      {model.authenticating ? (
                        <ActivityIndicator color={colors.onColor} />
                      ) : (
                        <Text style={styles.unlockButtonText}>{t('unlockApp')}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => {
                        dispatch({ type: 'show_password_fallback' });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('usePassword')}
                    >
                      <Text style={styles.secondaryButtonText}>{t('usePassword')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </KeyboardAvoidingView>
          ) : (
            <View style={styles.lockContent} />
          )}
        </SafeAreaView>
      </Modal>
    </DeviceLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  lockOverlay: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboard: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  lockContent: {
    alignItems: 'center',
    alignSelf: 'stretch',
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
    marginBottom: 24,
  },
  passwordBody: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radii.control,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  unlockButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  unlockButtonText: {
    color: colors.onColor,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
