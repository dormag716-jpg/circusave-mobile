import React from 'react';

jest.mock('react-native', () => {
  const ReactModule = require('react');
  const host = (name: string) =>
    ReactModule.forwardRef(
      (
        { children, ...props }: { children?: React.ReactNode; [key: string]: unknown },
        ref: React.Ref<unknown>,
      ) => ReactModule.createElement(name, { ...props, ref }, children),
    );
  return {
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('Text'),
    View: host('View'),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  return {
    SafeAreaView: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => ReactModule.createElement('SafeAreaView', props, children),
  };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const ReactModule = require('react');
  return (props: Record<string, unknown>) =>
    ReactModule.createElement('FontAwesome', props);
});

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({ circleId: 'circle-1' }),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'circusave://'),
}));

jest.mock('@/lib/navigation', () => ({
  circleWorkspaceHref: (circleId: string, tab?: string) =>
    tab
      ? `/circle/workspace?circleId=${circleId}&tab=${tab}`
      : `/circle/workspace?circleId=${circleId}`,
  myCirclesHref: '/(tabs)/circles',
}));

const asyncStorageValues = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => asyncStorageValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStorageValues.set(key, value);
    }),
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const TestRenderer: any = require('react-test-renderer');
const {
  changeLanguagePreference,
  initializeI18n,
}: typeof import('../i18n') = require('../i18n');
const CircleHistoryScreen: typeof import('../../app/circle/history').default =
  require('../../app/circle/history').default;

function nodeText(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  return nodeText(node.props?.children);
}

function visibleText(renderer: any): string {
  return renderer.root
    .findAll((node: any) => node.type === 'Text')
    .map(nodeText)
    .join('\n');
}

describe('Circle history screen locales', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each([
    [
      'en',
      'Statement center',
      'History and statements live in Records',
      'Open Records',
      'Back to circle workspace',
    ],
    [
      'es',
      'Centro de estados de cuenta',
      'El historial y los estados de cuenta están en Registros',
      'Abrir Registros',
      'Volver al espacio del círculo',
    ],
    [
      'ht',
      'Sant deklarasyon',
      'Istwa ak deklarasyon yo nan Rejis',
      'Louvri Rejis',
      'Retounen nan espas gwoup la',
    ],
  ] as const)(
    'renders history chrome in %s without leftover English chrome',
    async (language, title, cardTitle, action, back) => {
      await changeLanguagePreference(language);
      let renderer: any;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(React.createElement(CircleHistoryScreen));
      });
      const text = visibleText(renderer);
      expect(text).toContain(title);
      expect(text).toContain(cardTitle);
      expect(text).toContain(action);
      expect(
        renderer.root.findByProps({ accessibilityLabel: back }),
      ).toBeTruthy();
      if (language !== 'en') {
        expect(text).not.toContain('Statement center');
        expect(text).not.toContain('Open Records');
      }
    },
  );
});
