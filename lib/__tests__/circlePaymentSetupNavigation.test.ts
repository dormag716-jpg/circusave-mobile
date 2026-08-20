jest.mock('expo-linking', () => ({
  parse: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import { readFileSync } from 'fs';
import path from 'path';

import {
  circlePaymentSetupHref,
  contributionHref,
  createCircleSuccessDestinations,
} from '../navigation';

describe('contribution payment-setup navigation', () => {
  test('circlePaymentSetupHref targets /circle/payment-setup with circleId', () => {
    expect(circlePaymentSetupHref('circle-abc')).toEqual({
      pathname: '/circle/payment-setup',
      params: { circleId: 'circle-abc' },
    });
  });

  test('settings entry preserves its return destination', () => {
    expect(
      circlePaymentSetupHref('circle-abc', 'payment-preferences'),
    ).toEqual({
      pathname: '/circle/payment-setup',
      params: {
        circleId: 'circle-abc',
        returnTo: 'payment-preferences',
      },
    });
  });

  test('post-create primary action uses the same payment-setup href', () => {
    const destinations = createCircleSuccessDestinations('circle-new');
    expect(destinations.contributionPaymentSetup).toEqual(
      circlePaymentSetupHref('circle-new'),
    );
    expect(destinations.continueSetup).toEqual({
      pathname: '/circle/workspace',
      params: { circleId: 'circle-new', tab: 'people' },
    });
  });
});

describe('contributionHref hand targeting', () => {
  test('omits handId when not provided', () => {
    expect(contributionHref('circle-1')).toEqual({
      pathname: '/payment/contribution',
      params: { circleId: 'circle-1' },
    });
  });

  test('includes exact handId when provided', () => {
    expect(contributionHref('circle-1', 'hand-2')).toEqual({
      pathname: '/payment/contribution',
      params: { circleId: 'circle-1', handId: 'hand-2' },
    });
    expect(contributionHref('circle-1', '  ')).toEqual({
      pathname: '/payment/contribution',
      params: { circleId: 'circle-1' },
    });
  });
});

describe('contribution screen hand preselection', () => {
  test('contribution.tsx reads handId and preselects that hand', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'payment', 'contribution.tsx'),
      'utf8',
    );
    expect(source).toContain('handId?: string | string[]');
    expect(source).toContain('const requestedHandId = Array.isArray(params.handId)');
    expect(source).toContain('requestedHandId ?? null');
    expect(source).toContain('setSelectedHandId(requestedHandId ?? null)');
    expect(source).toContain(
      'selectedHandId && dueHands.some((h) => h.id === selectedHandId)',
    );
  });
});

describe('create-circle success sheet wiring', () => {
  test('overlay dismiss is not wired to continue-setup navigation', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'create-circle', 'setup.tsx'),
      'utf8',
    );
    expect(source).toContain('onSecondary');
    expect(source).toMatch(/onClose=\{\(\) => undefined\}/);
    expect(source).toContain('.continueSetup');
    expect(source).toContain('.contributionPaymentSetup');
  });
});
