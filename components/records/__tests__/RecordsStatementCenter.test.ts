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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
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
  RecordsStatementCenter,
}: typeof import('../RecordsStatementCenter') = require('../RecordsStatementCenter');
const api = jest.requireMock('@/lib/api') as {
  getMemberStatementSnapshotForHand: jest.Mock;
  getMemberStatementSnapshotForUser: jest.Mock;
  getMemberStatementsIndex: jest.Mock;
  getStatementDocuments: jest.Mock;
  downloadMemberStatementPdfForUser: jest.Mock;
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
  members: [],
  ledgerEntries: [],
  isPremium: true,
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
      React.createElement(RecordsStatementCenter, {
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

describe('RecordsStatementCenter professional redesign', () => {
  test('shows clean Records hierarchy, circle scope, totals, and humanized hand wording', async () => {
    const renderer = await renderCenter();
    const text = visibleText(renderer);

    expect(text).toContain('Records');
    expect(text).toContain('Neighborhood Circle');
    expect(text).toContain('Statements, activity, and circle documents');
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

  test('keeps segment switching intact with polished labels', async () => {
    const renderer = await renderCenter();

    TestRenderer.act(() => {
      pressableWithAccessibilityLabel(renderer, 'Circle Overview').props.onPress();
    });
    expect(visibleText(renderer)).toContain('Circle activity');

    await TestRenderer.act(async () => {
      pressableWithAccessibilityLabel(renderer, 'Documents').props.onPress();
      await flushUpdates();
    });
    expect(visibleText(renderer)).toContain('Previously generated statements');
    expect(api.getStatementDocuments).toHaveBeenCalledWith(
      'token-1',
      'circle-1',
    );
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

  test('does not broaden participant visibility from the component members prop', async () => {
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

    const renderer = await renderCenter({
      members: [
        {
          id: 'membership-outside-index',
          userId: 'user-outside-index',
          full_name: 'Not Returned By Statement API',
        },
      ],
    });

    expect(statementRows(renderer, 'Antony Powell')).toHaveLength(1);
    expect(visibleText(renderer)).not.toContain(
      'Not Returned By Statement API',
    );
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
