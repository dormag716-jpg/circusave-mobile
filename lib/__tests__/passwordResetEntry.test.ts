import { readFileSync } from 'fs';
import path from 'path';

import {
  acknowledgePasswordResetCodeEntry,
  openExistingRecoveryCode,
  PASSWORD_RESET_CODE_ENTRY_MAX_AGE_MS,
  passwordResetPhase,
  passwordResetRequestsReplacementCode,
  readFreshPasswordResetCodeEntry,
  stagePasswordResetCodeEntry,
} from '../auth/passwordResetEntry';

const root = path.join(__dirname, '..', '..');

describe('password reset entry', () => {
  afterEach(() => {
    acknowledgePasswordResetCodeEntry();
  });

  it('requests a replacement code only before code entry', () => {
    expect(passwordResetRequestsReplacementCode(passwordResetPhase({
      codeEntryReady: false,
      codeVerified: false,
    }))).toBe(true);
    expect(passwordResetRequestsReplacementCode(passwordResetPhase({
      codeEntryReady: true,
      codeVerified: false,
    }))).toBe(false);
    expect(passwordResetRequestsReplacementCode(passwordResetPhase({
      codeEntryReady: true,
      codeVerified: true,
    }))).toBe(false);
  });

  it('opens an existing code without representing a new email request', () => {
    expect(openExistingRecoveryCode({ email: '  ' })).toEqual({ error: 'missing_email' });
    expect(openExistingRecoveryCode({ email: 'ada@example.com' })).toEqual({
      codeEntryReady: true,
    });
    expect(passwordResetRequestsReplacementCode(passwordResetPhase({
      codeEntryReady: true,
      codeVerified: false,
    }))).toBe(false);
  });

  it('keeps a fresh Security code available for Login and drops an expired one', () => {
    const sentAt = 1_700_000_000_000;
    stagePasswordResetCodeEntry('  ADA@example.com ', sentAt);
    expect(readFreshPasswordResetCodeEntry(sentAt + 1_000)).toEqual({
      email: 'ada@example.com',
      sentAt,
    });
    acknowledgePasswordResetCodeEntry();
    expect(readFreshPasswordResetCodeEntry(sentAt + 1_000)).toBeNull();

    stagePasswordResetCodeEntry('ada@example.com', sentAt);
    expect(readFreshPasswordResetCodeEntry(
      sentAt + PASSWORD_RESET_CODE_ENTRY_MAX_AGE_MS + 1,
    )).toBeNull();
    expect(readFreshPasswordResetCodeEntry(sentAt + 1_000)).toBeNull();
  });

  it('wires Security to the Login code step and keeps Send Recovery Code as the only new request', () => {
    const login = readFileSync(path.join(root, 'app', 'login.tsx'), 'utf8');
    const security = readFileSync(path.join(root, 'app', 'security.tsx'), 'utf8');
    const handler = security.slice(
      security.indexOf('const handleChangePassword'),
      security.indexOf('const handleExportData'),
    );

    expect(handler.match(/requestPasswordReset\(/g)).toEqual(['requestPasswordReset(']);
    expect(handler).toContain('if (!result.accepted)');
    expect(handler).toContain('stagePasswordResetCodeEntry(email)');
    expect(handler).toContain('signOut()');
    expect(handler.indexOf('stagePasswordResetCodeEntry(email)')).toBeLessThan(
      handler.indexOf('signOut()'),
    );
    expect(login.match(/requestPasswordReset\(/g)).toEqual(['requestPasswordReset(']);
    expect(login).toContain('passwordResetRequestsReplacementCode(phase)');
    expect(login).toContain('openExistingRecoveryCode');
    expect(login).toContain('readFreshPasswordResetCodeEntry');
    expect(login.split('useFocusEffect').some((block) => block.includes('readFreshPasswordResetCodeEntry'))).toBe(true);
    expect(login).toContain("t('login.enterExistingCode')");
  });

  it('describes the code screen in every locale and keeps prior security copy', () => {
    for (const language of ['en', 'es', 'ht'] as const) {
      const security = JSON.parse(readFileSync(
        path.join(root, 'lib', 'i18n', 'locales', language, 'security.json'),
        'utf8',
      )) as Record<string, string>;
      const auth = JSON.parse(readFileSync(
        path.join(root, 'lib', 'i18n', 'locales', language, 'auth.json'),
        'utf8',
      )) as { login: Record<string, string> };
      expect(security.changePasswordContinue.length).toBeGreaterThan(0);
      expect(security.changePasswordBody.toLowerCase()).not.toMatch(/forgot password|olvidé mi contraseña|bliye modpas\?/);
      expect(auth.login.enterExistingCode.length).toBeGreaterThan(0);
      expect(security.exportReadyBody).toContain('•');
      expect(security.deleteConfirmBody).toContain('•');
    }

    const spanish = JSON.parse(readFileSync(
      path.join(root, 'lib', 'i18n', 'locales', 'es', 'security.json'),
      'utf8',
    )) as Record<string, string>;
    expect(spanish.preferenceSaveErrorBody).toContain('Inténtalo');
    expect(spanish.preferenceSaveErrorBody).not.toContain('Intréntalo');
    expect(spanish.appLockSubtitle).toContain('Desbloquéala');
    expect(spanish.changePasswordErrorBody).toContain('Inténtalo');

    const creole = JSON.parse(readFileSync(
      path.join(root, 'lib', 'i18n', 'locales', 'ht', 'security.json'),
      'utf8',
    )) as Record<string, string>;
    expect(creole.appLockAlwaysOn).toBe('Kadna aplikasyon an — Toujou aktive');
  });
});
