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
    ActivityIndicator: host('ActivityIndicator'),
    Alert: { alert: jest.fn() },
    Modal: host('Modal'),
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles },
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
  };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const ReactModule = require('react');
  return (props: Record<string, unknown>) =>
    ReactModule.createElement('FontAwesome', props);
});

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    write: jest.fn(),
    uri: 'file:///cache/statement.pdf',
  })),
  Paths: { cache: '/cache' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
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

jest.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  downloadMemberStatementPdfForHand: jest.fn(),
  downloadMemberStatementPdfForUser: jest.fn(),
  downloadStatementDocumentPdf: jest.fn(),
  getMemberStatementSnapshotForHand: jest.fn(),
  getMemberStatementSnapshotForUser: jest.fn(),
  getMemberStatementsIndex: jest.fn(),
  getStatementDocuments: jest.fn(),
}));

const TestRenderer: any = require('react-test-renderer');
const {
  changeLanguagePreference,
  initializeI18n,
}: typeof import('@/lib/i18n') = require('@/lib/i18n');
const {
  StatementDocumentsSection,
}: typeof import('../StatementDocumentsSection') = require('../StatementDocumentsSection');
const api = jest.requireMock('@/lib/api') as {
  getMemberStatementSnapshotForHand: jest.Mock;
  getMemberStatementSnapshotForUser: jest.Mock;
  getMemberStatementsIndex: jest.Mock;
  getStatementDocuments: jest.Mock;
  downloadMemberStatementPdfForUser: jest.Mock;
  downloadStatementDocumentPdf: jest.Mock;
};

const oneHandMember = {
  subjectKey: 'user:user-antony',
  userId: 'user-antony',
  handId: null,
  displayName: 'Antony Powell',
  membershipStatus: 'active',
  roleSummary: 'participant',
  handCount: 1,
  handIds: ['hand-antony'],
  totals: {
    contributedCents: 1,
    contributedDisplay: '$2,000',
    receivedCents: 999999,
    receivedDisplay: '$0',
  },
  canRequestStatement: true,
};

const multiHandMember = {
  subjectKey: 'user:user-darius',
  userId: 'user-darius',
  handId: null,
  displayName: 'Darius Ward',
  membershipStatus: 'active',
  roleSummary: 'organizer',
  handCount: 2,
  handIds: ['hand-darius-1', 'hand-darius-2'],
  totals: {
    contributedCents: 2,
    contributedDisplay: '$6,000',
    receivedCents: 3,
    receivedDisplay: '$18,000',
  },
  canRequestStatement: true,
};

const unclaimedHand = {
  subjectKey: 'hand:hand-unclaimed',
  userId: null,
  handId: 'hand-unclaimed',
  displayName: 'Planned hand 3',
  membershipStatus: 'unclaimed',
  roleSummary: 'planned_hand',
  handCount: 1,
  handIds: ['hand-unclaimed'],
  totals: {
    contributedCents: 0,
    contributedDisplay: '$0',
    receivedCents: 0,
    receivedDisplay: '$0',
  },
  canRequestStatement: true,
  unclaimed: true,
};

const statementIndex = {
  documentType: 'member_circle_statement',
  circle: {
    id: 'circle-1',
    name: 'Neighborhood Circle',
    status: 'active',
    contributionAmountCents: 200000,
    contributionAmountDisplay: '$2,000',
    frequency: 'monthly',
  },
  viewer: {
    userId: 'user-antony',
    role: 'organizer',
    canViewAllMembers: true,
  },
  members: [oneHandMember, multiHandMember],
  unclaimedHands: [unclaimedHand],
};

const previewSnapshot = {
  documentType: 'circuSave_member_circle_statement',
  version: 1,
  statementReference: 'MCS-CIRCLE-MEMBER-20260731000000-51673D9D',
  generatedAt: '2026-07-31T04:14:34Z',
  generatedByUserId: 'user-antony',
  title: 'CircuSave Member Circle Statement',
  circle: {
    id: 'circle-1',
    name: 'Neighborhood Circle',
    status: 'active',
    contributionAmountCents: 200000,
    contributionAmountDisplay: '$2,000',
    frequency: 'monthly',
  },
  member: {
    userId: 'user-antony',
    displayName: 'Antony Powell',
    membershipStatus: 'active',
    roleSummary: 'member',
  },
  period: {
    mode: 'full_circle',
    from: null,
    to: null,
    label: 'Full circle activity',
  },
  circleParticipation: {
    totalParticipatingHands: 3,
    totalRounds: 3,
    memberHandCount: 1,
  },
  hands: [
    {
      handId: 'hand-antony',
      handNumber: 1,
      displayLabel: 'Antony Powell \u00B7 Hand 1',
      isParticipating: true,
      payoutPosition: 1,
      contributions: {
        expectedCents: 200000,
        expectedDisplay: '$2,000',
        confirmedCents: 200000,
        confirmedDisplay: '$2,000',
        pendingCents: 0,
        pendingDisplay: '$0',
        missedCents: 0,
        missedDisplay: '$0',
        rejectedCents: 0,
        rejectedDisplay: '$0',
        byRound: [
          {
            contributionId: 'contrib-internal-long-id-should-not-show',
            roundNumber: 1,
            dueDate: '2026-07-27',
            status: 'confirmed',
            expectedCents: 100000,
            expectedDisplay: '$1,000',
            paidCents: 100000,
            paidDisplay: '$1,000',
            paymentOrigin: 'external',
            paymentOriginLabel: 'Externally reported payment',
            verificationStatus: 'organizer_confirmed',
            verificationLabel: 'Confirmed by organizer',
            reportedBy: {
              userId: 'user-antony',
              displayName: 'Antony Powell',
            },
            reportedAt: '2026-07-27T11:00:00Z',
            confirmedBy: {
              userId: 'user-darius',
              displayName: 'Darius Ward',
            },
            confirmedAt: '2026-07-27T12:00:00Z',
          },
        ],
      },
      payouts: {
        receivedCents: 0,
        receivedDisplay: '$0',
        received: [],
        scheduled: [
          {
            roundNumber: 3,
            dueDate: '2026-08-10',
            amountCents: 300000,
            amountDisplay: '$3,000',
            status: 'scheduled',
          },
        ],
      },
      remainingObligationsCents: 0,
      remainingObligationsDisplay: '$0',
    },
  ],
  memberTotals: {
    totalContributedCents: 200000,
    totalContributedDisplay: '$2,000',
    totalReceivedCents: 0,
    totalReceivedDisplay: '$0',
    remainingObligationsCents: 0,
    remainingObligationsDisplay: '$0',
  },
  ledger: [
    {
      id: 'ledger-internal-id-abc',
      at: '2026-07-27T12:00:00Z',
      eventType: 'contribution_confirmed',
      amountCents: 100000,
      amountDisplay: '$1,000',
      roundNumber: 1,
      handId: 'hand-antony',
      reference: 'ledger-internal-id-abc',
      statusOrNote: null,
      description: null,
    },
  ],
  verification: {
    footerText: 'Verified against CircuSave backend records for this circle.',
    disclaimer:
      'Not a bank statement, tax document, legal certification, or proof of income.',
    dataSource: 'backend_snapshot',
    contentFingerprint: 'abc123fingerprint',
  },
};

const baseProps = {
  circleId: 'circle-1',
  token: 'token-1',
  isOrganizer: true,
  circleName: 'Neighborhood Circle',
};

let renderers: any[] = [];

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

function pressableWithText(renderer: any, label: string): any {
  return renderer.root
    .findAll((node: any) => node.type === 'Pressable')
    .find((node: any) => nodeText(node) === label);
}

function pressableWithAccessibilityLabel(renderer: any, label: string): any {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function statementRows(renderer: any, displayName: string): any[] {
  return renderer.root.findAll(
    (node: any) =>
      node.type === 'Pressable' &&
      node.props.accessibilityLabel === `Open statement for ${displayName}`,
  );
}

async function flushUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderCenter(
  overrides: Record<string, unknown> = {},
): Promise<any> {
  let renderer: any;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(StatementDocumentsSection, {
        ...baseProps,
        ...overrides,
      }),
    );
    await flushUpdates();
  });
  renderers.push(renderer);
  return renderer;
}

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  jest.clearAllMocks();
  api.getMemberStatementsIndex.mockResolvedValue(statementIndex);
  api.getMemberStatementSnapshotForUser.mockResolvedValue(previewSnapshot);
  api.getMemberStatementSnapshotForHand.mockResolvedValue(previewSnapshot);
  api.getStatementDocuments.mockResolvedValue({ documents: [] });
  api.downloadMemberStatementPdfForUser.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    statementReference: 'MCS-TEST',
    generatedAt: '2026-07-31T00:00:00Z',
    filename: 'test.pdf',
  });
});

afterEach(() => {
  for (const renderer of renderers) {
    TestRenderer.act(() => renderer.unmount());
  }
  renderers = [];
});

describe('StatementDocumentsSection', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
    await changeLanguagePreference('en');
  });

  beforeEach(async () => {
    await changeLanguagePreference('en');
  });

  test('renders statement provenance from additive backend fields', async () => {
    const statementRenderer = await renderCenter();
    await TestRenderer.act(async () => {
      statementRenderer.root
        .findByProps({
          accessibilityLabel: 'Open statement for Antony Powell',
        })
        .props.onPress();
      await flushUpdates();
    });
    const text = visibleText(statementRenderer);
    expect(text).toContain('Externally reported by Antony Powell');
    expect(text).toContain('Confirmed by Darius Ward');
  });

  test('a legacy confirmation without a stored reporter never reads "Unknown reporter on —"', async () => {
    const legacy = JSON.parse(JSON.stringify(previewSnapshot));
    const row = legacy.hands[0].contributions.byRound[0];
    row.reportedBy = null;
    row.reportedAt = null;
    row.confirmedBy = { userId: null, displayName: null };
    api.getMemberStatementSnapshotForUser.mockResolvedValue(legacy);

    const renderer = await renderCenter();
    await TestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Open statement for Antony Powell' })
        .props.onPress();
      await flushUpdates();
    });
    const text = visibleText(renderer);
    expect(text).not.toContain('Unknown reporter');
    expect(text).not.toContain('on —');
    expect(text).toContain('External payment report confirmed by Organizer');
  });

  test('shows clean Records hierarchy, circle scope, totals, and humanized hand wording', async () => {
    const renderer = await renderCenter();
    const text = visibleText(renderer);

    expect(text).toContain('Member Statements');
    expect(text).toContain(
      'View contribution and payout activity for members of Neighborhood Circle.',
    );
    expect(text).toContain('Each statement is limited to this circle.');
    expect(text).toContain(
      'One row per connected member. Each hand remains a separate financial position in the statement.',
    );
    expect(text).toContain('Includes all available activity in this circle.');
    expect(text).not.toMatch(/all (account|CircuSave) history/i);
    expect(text).not.toContain('AI SUSU \u00B7 STATEMENT CENTER');
    expect(text).toContain('Active member \u00B7 1 hand');
    expect(text).toContain('Organizer \u00B7 2 hands');
    expect(text).toContain('Contributed');
    expect(text).toContain('$2,000');
    expect(text).toContain('Received');
    expect(text).toContain('$18,000');
    expect(text).not.toMatch(/\bIn \$|\bOut \$/);
    expect(statementRows(renderer, 'Antony Powell')).toHaveLength(1);
    expect(statementRows(renderer, 'Darius Ward')).toHaveLength(1);
  });

  test('keeps the index request and connected user full-circle request shapes unchanged', async () => {
    const renderer = await renderCenter();

    expect(api.getMemberStatementsIndex).toHaveBeenCalledWith(
      'token-1',
      'circle-1',
    );

    await TestRenderer.act(async () => {
      renderer.root
        .findByProps({
          accessibilityLabel: 'Open statement for Antony Powell',
        })
        .props.onPress();
      await flushUpdates();
    });

    expect(api.getMemberStatementSnapshotForUser).toHaveBeenCalledWith(
      'token-1',
      'circle-1',
      'user-antony',
      { period: 'full_circle' },
    );
    expect(api.getMemberStatementSnapshotForHand).not.toHaveBeenCalled();
  });

  test('keeps unclaimed hands separate and opens them with handId', async () => {
    const renderer = await renderCenter();
    const text = visibleText(renderer);

    expect(text).toContain('Unclaimed hands');
    expect(text).toContain(
      'Planned hands that have not yet been connected to a member.',
    );
    expect(statementRows(renderer, 'Planned hand 3')).toHaveLength(1);

    await TestRenderer.act(async () => {
      renderer.root
        .findByProps({
          accessibilityLabel: 'Open statement for Planned hand 3',
        })
        .props.onPress();
      await flushUpdates();
    });

    expect(api.getMemberStatementSnapshotForHand).toHaveBeenCalledWith(
      'token-1',
      'circle-1',
      'hand-unclaimed',
      { period: 'full_circle' },
    );
    expect(api.getMemberStatementSnapshotForUser).not.toHaveBeenCalled();
  });

  test('preserves the custom-range request shape', async () => {
    const renderer = await renderCenter();

    TestRenderer.act(() => {
      pressableWithText(renderer, 'Custom range').props.onPress();
    });

    const inputs = renderer.root.findAll((node: any) => node.type === 'TextInput');
    TestRenderer.act(() => {
      inputs[0].props.onChangeText('2026-01-01');
      inputs[1].props.onChangeText('2026-06-30');
    });

    await TestRenderer.act(async () => {
      renderer.root
        .findByProps({
          accessibilityLabel: 'Open statement for Darius Ward',
        })
        .props.onPress();
      await flushUpdates();
    });

    expect(api.getMemberStatementSnapshotForUser).toHaveBeenCalledWith(
      'token-1',
      'circle-1',
      'user-darius',
      {
        period: 'custom',
        from: '2026-01-01',
        to: '2026-06-30',
      },
    );
  });

  test('shows member statements and saved documents together and loads both', async () => {
    const renderer = await renderCenter();
    const text = visibleText(renderer);
    expect(text).toContain('Member Statements');
    expect(text).toContain('Previously generated documents');
    expect(api.getMemberStatementsIndex).toHaveBeenCalledWith('token-1', 'circle-1');
    expect(api.getStatementDocuments).toHaveBeenCalledWith('token-1', 'circle-1');
    // No activity-feed behavior and no "open statements" shortcut on the same page.
    expect(text).not.toContain('Circle activity');
    expect(text).not.toContain('Unlock full history');
  });

  test('lists record documents beside statements with a small type label, and marks superseded ones', async () => {
    const doc = (overrides: Record<string, unknown>) => ({
      id: 'sdoc-1',
      circleId: 'circle-1',
      statementReference: 'MCS-X',
      documentType: 'circuSave_member_circle_statement',
      subjectUserId: 'u1',
      handId: null,
      memberDisplayName: 'Antony Powell',
      period: { mode: 'full_circle', from: null, to: null, label: 'Full circle activity' },
      generatedAt: '2026-10-10T15:00:00Z',
      generatedByUserId: 'u1',
      ...overrides,
    });
    api.getStatementDocuments.mockResolvedValue({
      documents: [
        doc({}),
        doc({
          id: 'sdoc-2',
          statementReference: 'CSC-ABC123-R01-P01-AA-D02',
          documentType: 'circuSave_contribution_record',
          memberDisplayName: 'Position 1',
          recordReference: 'CSC-ABC123-R01-P01-AA',
          issueNumber: 2,
          superseded: false,
          period: { mode: 'record', from: null, to: null, label: 'Round 1' },
        }),
        doc({
          id: 'sdoc-3',
          statementReference: 'CSC-ABC123-R01-P01-AA-D01',
          documentType: 'circuSave_contribution_record',
          memberDisplayName: 'Position 1',
          recordReference: 'CSC-ABC123-R01-P01-AA',
          issueNumber: 1,
          superseded: true,
        }),
        doc({ id: 'sdoc-4', statementReference: 'CSP-ABC123-R01-P01-DD-D01', documentType: 'circuSave_payout_record' }),
        doc({ id: 'sdoc-5', statementReference: 'CSR-ABC123-R01-FF-D01', documentType: 'circuSave_round_record' }),
      ],
    });
    const renderer = await renderCenter();
    const text = visibleText(renderer);
    expect(text).toContain('Member statement');
    expect(text).toContain('Contribution record');
    expect(text).toContain('Payout record');
    expect(text).toContain('Round record');
    expect(text).toContain('Contribution record \u00B7 Superseded');
    expect(text).toContain('CSC-ABC123-R01-P01-AA-D02');
    expect(text.match(/Superseded/g)).toHaveLength(1);
    // Every saved document re-downloads through the same call, whatever its type.
    api.downloadStatementDocumentPdf.mockResolvedValue({
      bytes: new Uint8Array([1]),
      statementReference: 'CSC-ABC123-R01-P01-AA-D02',
      generatedAt: '2026-10-10T15:00:00Z',
      filename: 'doc.pdf',
    });
    const shareButtons = renderer.root.findAll(
      (node: any) =>
        node.type === 'Pressable' &&
        node.props.accessibilityLabel === 'Share statement for Position 1',
    );
    expect(shareButtons).toHaveLength(2);
    await TestRenderer.act(async () => {
      shareButtons[0].props.onPress();
      await flushUpdates();
    });
    expect(api.downloadStatementDocumentPdf).toHaveBeenCalledWith('token-1', 'circle-1', 'sdoc-2');
  });

  test('renders loading, error, retry, and empty states', async () => {
    api.getMemberStatementsIndex.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const loadingRenderer = await renderCenter();
    expect(visibleText(loadingRenderer)).toContain('Loading members');

    api.getMemberStatementsIndex
      .mockRejectedValueOnce(new Error('Index unavailable'))
      .mockResolvedValueOnce({
        ...statementIndex,
        members: [],
        unclaimedHands: [],
      });
    const errorRenderer = await renderCenter();
    expect(visibleText(errorRenderer)).toContain('Index unavailable');

    await TestRenderer.act(async () => {
      pressableWithText(errorRenderer, 'Retry').props.onPress();
      await flushUpdates();
    });
    expect(api.getMemberStatementsIndex).toHaveBeenCalledTimes(3);
    expect(visibleText(errorRenderer)).toContain('No members to show yet');
  });

  test('a member sees member-appropriate copy and only the rows the backend returns', async () => {
    api.getMemberStatementsIndex.mockResolvedValueOnce({
      ...statementIndex,
      viewer: {
        userId: 'user-antony',
        role: 'participant',
        canViewAllMembers: false,
      },
      members: [oneHandMember],
      unclaimedHands: [],
    });

    const renderer = await renderCenter({ isOrganizer: false });
    const text = visibleText(renderer);

    expect(statementRows(renderer, 'Antony Powell')).toHaveLength(1);
    expect(statementRows(renderer, 'Darius Ward')).toHaveLength(0);
    expect(text).toContain(
      'View your contribution and payout activity in Neighborhood Circle.',
    );
    expect(text).not.toContain('for members of');
    expect(text).not.toContain('One row per connected member.');
  });

  test('preview uses backend totals, separates hands, humanizes status, hides raw ledger ids by default', async () => {
    const renderer = await renderCenter();

    await TestRenderer.act(async () => {
      renderer.root
        .findByProps({
          accessibilityLabel: 'Open statement for Antony Powell',
        })
        .props.onPress();
      await flushUpdates();
    });

    const text = visibleText(renderer);
    expect(text).toContain('Member Activity Statement');
    expect(text).toContain('Antony Powell');
    expect(text).toContain('Neighborhood Circle');
    expect(text).toContain('Outstanding');
    expect(text).toContain('$2,000');
    expect(text).toContain('Contribution confirmed');
    expect(text).toContain('Hand 1');
    expect(text).toContain('Payout position 1');
    expect(text).toContain('No payouts received yet');
    expect(text).not.toContain('ledger-internal-id-abc');
    expect(text).not.toContain('contrib-internal-long-id-should-not-show');
    expect(text).not.toContain('contribution_confirmed');
    // Verification/activity details collapsed by default.
    expect(text).toContain('Activity details');
    expect(text).toContain('Statement verification');
  });

  test('pdf download control disables while loading to prevent duplicate taps', async () => {
    let resolvePdf: ((value: unknown) => void) | null = null;
    api.downloadMemberStatementPdfForUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePdf = resolve;
        }),
    );

    const renderer = await renderCenter();
    await TestRenderer.act(async () => {
      renderer.root
        .findByProps({
          accessibilityLabel: 'Open statement for Antony Powell',
        })
        .props.onPress();
      await flushUpdates();
    });

    const downloadBtn = renderer.root.findByProps({
      accessibilityLabel: 'Download PDF',
    });
    await TestRenderer.act(async () => {
      downloadBtn.props.onPress();
      await flushUpdates();
    });

    const busyBtn = renderer.root.findByProps({
      accessibilityLabel: 'Download PDF',
    });
    expect(busyBtn.props.disabled).toBe(true);
    expect(busyBtn.props.accessibilityState.busy).toBe(true);

    await TestRenderer.act(async () => {
      resolvePdf?.({
        bytes: new Uint8Array([1]),
        statementReference: 'MCS-TEST',
        generatedAt: '2026-07-31T00:00:00Z',
        filename: 'test.pdf',
      });
      await flushUpdates();
    });
  });
});

describe('StatementDocumentsSection locale chrome', () => {
  beforeAll(async () => {
    asyncStorageValues.clear();
    await initializeI18n();
  });

  test.each([
    ['en', 'Download PDF', 'Member Statements', 'Retry'],
    ['es', 'Descargar PDF', 'Estados de cuenta', 'Reintentar'],
    ['ht', 'Telechaje PDF', 'Deklarasyon manm yo', 'Eseye ankò'],
  ] as const)(
    'renders statement chrome in %s',
    async (language, downloadPdf, statements, retry) => {
      await changeLanguagePreference(language);
      const renderer = await renderCenter();
      const text = visibleText(renderer);
      expect(text).toContain(statements);
      if (language !== 'en') {
        expect(text).not.toContain('Download PDF');
      }

      const openLabel =
        language === 'en'
          ? 'Open statement for Antony Powell'
          : language === 'es'
            ? 'Abrir estado de cuenta de Antony Powell'
            : 'Louvri deklarasyon pou Antony Powell';
      await TestRenderer.act(async () => {
        renderer.root.findByProps({ accessibilityLabel: openLabel }).props.onPress();
        await flushUpdates();
      });
      expect(
        renderer.root.findByProps({ accessibilityLabel: downloadPdf }),
      ).toBeTruthy();
      expect(visibleText(renderer)).toContain('Antony Powell');
      expect(visibleText(renderer)).toContain('$2,000');

      api.getMemberStatementsIndex.mockRejectedValueOnce(
        new Error('Index unavailable'),
      );
      const errorRenderer = await renderCenter();
      expect(visibleText(errorRenderer)).toContain('Index unavailable');
      expect(pressableWithText(errorRenderer, retry)).toBeTruthy();
    },
  );
});
