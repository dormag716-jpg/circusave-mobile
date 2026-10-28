import React from 'react';

const raf = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
(globalThis as { requestAnimationFrame?: typeof raf }).requestAnimationFrame = raf;
(globalThis as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame = (
  id: number,
) => clearTimeout(id);

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
    ActivityIndicator: host('ActivityIndicator'),
    FlatList: ({
      data,
      renderItem,
      ...props
    }: {
      data?: unknown[];
      renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
      [key: string]: unknown;
    }) =>
      ReactModule.createElement(
        'FlatList',
        props,
        (data || []).map((item, index) => renderItem?.({ item, index })),
      ),
    Modal: host('Modal'),
    Platform: { OS: 'ios' },
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
    Text: host('Text'),
    TextInput: host('TextInput'),
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
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const ReactModule = require('react');
  return (props: Record<string, unknown>) =>
    ReactModule.createElement('FontAwesome', props);
});

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
}: typeof import('@/lib/i18n') = require('@/lib/i18n');
const ChatInput: typeof import('../ChatInput').default = require('../ChatInput').default;
const ChatFeed: typeof import('../ChatFeed').default = require('../ChatFeed').default;
const { DecisionSheet }: typeof import('../DecisionSheet') = require('../DecisionSheet');
const { Avatar }: typeof import('../Avatar') = require('../Avatar');

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

describe('Chat and shared dialog locales', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each([
    [
      'en',
      'Send a message…',
      'Send message',
      'Cancel',
      'Close dialog',
      'Unknown',
    ],
    [
      'es',
      'Envía un mensaje…',
      'Enviar mensaje',
      'Cancelar',
      'Cerrar diálogo',
      'Desconocido',
    ],
    [
      'ht',
      'Voye yon mesaj…',
      'Voye mesaj',
      'Anile',
      'Fèmen dyalòg la',
      'Enkoni',
    ],
  ] as const)(
    'localizes chat placeholder, dialogs, and unknown a11y in %s',
    async (language, placeholder, sendA11y, cancel, closeDialog, unknown) => {
      await changeLanguagePreference(language);

      let inputRenderer: any;
      await TestRenderer.act(async () => {
        inputRenderer = TestRenderer.create(
          React.createElement(ChatInput, { onSend: jest.fn() }),
        );
      });
      const input = inputRenderer.root.findByType('TextInput');
      expect(input.props.placeholder).toBe(placeholder);
      expect(
        inputRenderer.root.findByProps({ accessibilityLabel: sendA11y }),
      ).toBeTruthy();
      if (language !== 'en') {
        expect(input.props.placeholder).not.toBe('Send a message...');
        expect(input.props.placeholder).not.toBe('Send a message…');
      }

      let sheetRenderer: any;
      await TestRenderer.act(async () => {
        sheetRenderer = TestRenderer.create(
          React.createElement(DecisionSheet, {
            visible: true,
            onClose: jest.fn(),
            icon: 'trash',
            title: 'Delete message?',
            body: 'Hello from Marie',
            primaryLabel: 'Delete',
            onPrimary: jest.fn(),
          }),
        );
      });
      const sheetText = visibleText(sheetRenderer);
      expect(sheetText).toContain(cancel);
      expect(sheetText).toContain('Hello from Marie');
      expect(
        sheetRenderer.root.findByProps({ accessibilityLabel: closeDialog }),
      ).toBeTruthy();

      let avatarRenderer: any;
      await TestRenderer.act(async () => {
        avatarRenderer = TestRenderer.create(React.createElement(Avatar, {}));
      });
      expect(
        avatarRenderer.root.findByProps({
          accessibilityLabel: language === 'en'
            ? `${unknown} avatar`
            : language === 'es'
              ? `Avatar de ${unknown}`
              : `Avatar ${unknown}`,
        }),
      ).toBeTruthy();

      let feedRenderer: any;
      await TestRenderer.act(async () => {
        feedRenderer = TestRenderer.create(
          React.createElement(ChatFeed, {
            currentUserId: 'me',
            onDeleteMessage: jest.fn(),
            messages: [
              {
                id: 'm1',
                text: 'Paid Marie in cash',
                senderUserId: 'me',
                senderId: 'me',
                senderName: 'Greg',
                timestamp: '10:00',
              },
            ],
          }),
        );
      });
      expect(visibleText(feedRenderer)).toContain('Paid Marie in cash');
      const deleteBtn = feedRenderer.root.findAllByType('Pressable')[0];
      expect(deleteBtn.props.accessibilityLabel).not.toContain('Paid Marie in cash');
      if (language === 'en') {
        expect(deleteBtn.props.accessibilityLabel).toContain('Press and hold to delete');
      } else if (language === 'es') {
        expect(deleteBtn.props.accessibilityLabel).toContain('Mantén pulsado');
      } else {
        expect(deleteBtn.props.accessibilityLabel).toContain('Peze epi kenbe');
      }
    },
  );
});
