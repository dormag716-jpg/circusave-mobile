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
    // Like the real Modal, render nothing while closed.
    Modal: ({ visible, children, ...props }: any) =>
      visible ? ReactModule.createElement('Modal', props, children) : null,
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
    SafeAreaView: ({ children, ...props }: any) =>
      ReactModule.createElement('SafeAreaView', props, children),
  };
});

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const ReactModule = require('react');
  return (props: Record<string, unknown>) => ReactModule.createElement('FontAwesome', props);
});

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    write: jest.fn(),
    uri: 'file:///cache/record.pdf',
  })),
  Paths: { cache: '/cache' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
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
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  getRecordsOverview: jest.fn(),
  getContributionRecords: jest.fn(),
  getContributionRecord: jest.fn(),
  getPayoutRecords: jest.fn(),
  getPayoutRecord: jest.fn(),
  getRoundRecords: jest.fn(),
  getRoundRecord: jest.fn(),
  downloadRecordPdf: jest.fn(),
  getMemberStatementsIndex: jest.fn(),
  getStatementDocuments: jest.fn(),
  getMemberStatementSnapshotForUser: jest.fn(),
  getMemberStatementSnapshotForHand: jest.fn(),
  downloadMemberStatementPdfForUser: jest.fn(),
  downloadMemberStatementPdfForHand: jest.fn(),
  downloadStatementDocumentPdf: jest.fn(),
}));

const TestRenderer: any = require('react-test-renderer');
const {
  changeLanguagePreference,
  initializeI18n,
}: typeof import('@/lib/i18n') = require('@/lib/i18n');
const { RecordsCenter }: typeof import('../RecordsCenter') = require('../RecordsCenter');
const api = jest.requireMock('@/lib/api') as Record<string, jest.Mock>;

const REF = {
  c1: 'CSC-ABC123-R01-P01-AA',
  c2: 'CSC-ABC123-R02-P01-BB',
  c3: 'CSC-ABC123-R02-P02-CC',
  p1: 'CSP-ABC123-R01-P01-DD',
  p2: 'CSP-ABC123-R02-P02-EE',
  r1: 'CSR-ABC123-R01-FF',
  r2: 'CSR-ABC123-R02-GG',
};

const verification = (status: string) => ({
  status,
  verifiedByRole: status === 'verified' ? 'organizer' : null,
  verifiedAt: status === 'verified' ? '2026-10-10T15:08:47Z' : null,
  rejectedAt: null,
  rejectionReason: null,
  rejectionReasonCode: null,
});

const contribution = (
  reference: string,
  round: number,
  number: number,
  status: string,
  label = `Position ${number}`,
) => ({
  id: reference,
  recordType: 'contribution',
  reference,
  circle: { id: 'circle-1', name: 'Audit Circle' },
  round: {
    number: round,
    id: `r${round}`,
    dueDate: '2026-12-22',
    reference: `CSR-ABC123-R0${round}-XX`,
  },
  member: { id: `m${number}`, number, label, handNumber: 1 },
  amount: {
    expectedCents: 5000,
    expectedDisplay: '$50.00',
    grossPaidCents: 5000,
    refundedCents: 0,
    netPaidCents: 5000,
    recognizedFundingCents: 5000,
    remainingDueCents: 0,
  },
  status,
  paymentLifecycle: null,
  paymentMethod: 'zelle',
  paymentReference: null,
  note: null,
  submittedAt: '2026-10-10T15:00:00Z',
  confirmedAt: status === 'confirmed' ? '2026-10-10T15:08:47Z' : null,
  verification: verification(
    status === 'confirmed' ? 'verified' : status === 'submitted' ? 'pending' : 'unverified',
  ),
  relatedPayoutReference: REF.p1,
  history: [
    {
      seq: 1,
      id: 'h1',
      type: 'submitted',
      at: '2026-10-10T15:00:00Z',
      actor: { role: 'member' },
      amountCents: 5000,
      paymentMethod: 'zelle',
      note: null,
    },
    {
      seq: 2,
      id: 'h2',
      type: 'confirmed',
      at: '2026-10-10T15:08:47Z',
      actor: { role: 'organizer' },
      amountCents: 5000,
      paymentMethod: 'zelle',
      note: null,
    },
  ],
});

const page = (records: unknown[], extra: Record<string, unknown> = {}) => ({
  records,
  count: records.length,
  total: records.length,
  limit: 50,
  offset: 0,
  hasMore: false,
  filters: {},
  ...extra,
});

const payout = (
  reference: string,
  round: number,
  status: string,
  label: string,
  level = 'summary',
) => ({
  id: status === 'released' ? 'pay1' : null,
  recordType: 'payout',
  reference,
  circle: { id: 'circle-1', name: 'Audit Circle' },
  round: {
    number: round,
    id: `r${round}`,
    dueDate: '2026-12-22',
    reference: `CSR-ABC123-R0${round}-XX`,
  },
  recipient: { id: `m${round}`, number: round, label, handNumber: 1 },
  amount: { cents: 15000, display: '$150.00', isExpected: status !== 'released' },
  status,
  scheduledDate: '2026-12-22',
  paidAt: status === 'released' ? '2026-10-10T15:09:00Z' : null,
  detailLevel: level,
  history: [],
});

const round = (reference: string, number: number, status: string) => ({
  id: `r${number}`,
  recordType: 'round',
  reference,
  circle: { id: 'circle-1', name: 'Audit Circle' },
  round: { number, status, dueDate: '2026-12-22', openedAt: null, closedAt: null },
  recipient: { id: `m${number}`, number, label: `Position ${number}`, handNumber: 1 },
  totals: {
    expectedPotCents: 15000,
    expectedPotDisplay: '$150.00',
    recognizedFundingCents: 5000,
    remainingDueCents: 10000,
  },
  contributionCounts: { total: 3, byStatus: { confirmed: 1, submitted: 2 } },
  payout: { status: 'pending', reference: REF.p2, paidAt: null },
  contributions: [
    {
      reference: REF.c2,
      member: { id: 'm1', number: 1, label: 'Position 1', handNumber: 1 },
      status: 'submitted',
      expectedCents: 5000,
    },
  ],
  history: [],
});

const overview = (role: 'organizer' | 'member') => ({
  circle: { id: 'circle-1', name: 'Audit Circle', status: 'active' },
  viewerRole: role,
  currentRound: { number: 2, status: 'open', dueDate: '2026-12-22', reference: REF.r2 },
  totals: {
    expectedCents: 15000,
    expectedDisplay: '$150.00',
    confirmedCents: 5000,
    confirmedDisplay: '$50.00',
    remainingDueCents: 10000,
    remainingDueDisplay: '$100.00',
    paidOutCents: 15000,
    paidOutDisplay: '$150.00',
  },
  roundCounts: { total: 3, closed: 1, payoutsReleased: 1 },
  needsVerification: role === 'organizer' ? { count: 2 } : null,
  yourRecords:
    role === 'member'
      ? {
          nextContribution: {
            reference: REF.c2,
            round: 2,
            status: 'submitted',
            expectedCents: 5000,
            expectedDisplay: '$50.00',
          },
          lastConfirmed: {
            reference: REF.c1,
            round: 1,
            status: 'confirmed',
            expectedCents: 5000,
            expectedDisplay: '$50.00',
          },
        }
      : null,
  latest: { roundReference: REF.r1, payoutReference: REF.p1 },
});

let renderers: any[] = [];
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const nodeText = (node: any): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  return nodeText(node.props?.children);
};
const visibleText = (r: any) =>
  r.root.findAll((n: any) => n.type === 'Text').map(nodeText).join('\n');
const byLabel = (r: any, label: string) => r.root.findByProps({ accessibilityLabel: label });
const tabs = (r: any) =>
  r.root
    .findAll((n: any) => n.type === 'Pressable' && n.props.accessibilityRole === 'tab')
    .map((n: any) => n.props.accessibilityLabel)
    .filter((label: string) => !label.startsWith('Show '));

async function renderCenter(overrides: Record<string, unknown> = {}) {
  let renderer: any;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      React.createElement(RecordsCenter, {
        circleId: 'circle-1',
        token: 'token-1',
        circleName: 'Audit Circle',
        isOrganizer: true,
        onReviewInRound: jest.fn(),
        ...overrides,
      }),
    );
    await flush();
  });
  renderers.push(renderer);
  return renderer;
}
async function press(renderer: any, label: string) {
  await TestRenderer.act(async () => {
    byLabel(renderer, label).props.onPress();
    await flush();
  });
}

beforeAll(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  asyncStorageValues.clear();
  await initializeI18n();
  await changeLanguagePreference('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  api.downloadRecordPdf.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    statementReference: 'CSC-ABC123-R01-P01-AA-D01',
    generatedAt: '2026-10-10T15:00:00Z',
    filename: 'CircuSave_CSC-ABC123-R01-P01-AA-D01.pdf',
  });
  api.getRecordsOverview.mockResolvedValue(overview('organizer'));
  api.getContributionRecords.mockResolvedValue(
    page([
      contribution(REF.c1, 1, 1, 'confirmed'),
      contribution(REF.c2, 2, 1, 'submitted'),
      contribution(REF.c3, 2, 2, 'rejected'),
    ]),
  );
  api.getPayoutRecords.mockResolvedValue(
    page([
      payout(REF.p1, 1, 'released', 'Olive Organizer', 'full'),
      payout(REF.p2, 2, 'pending', 'Position 2', 'summary'),
    ]),
  );
  api.getRoundRecords.mockResolvedValue(
    page([round(REF.r1, 1, 'closed'), round(REF.r2, 2, 'open')]),
  );
  api.getContributionRecord.mockImplementation(async (_t: string, _c: string, ref: string) =>
    contribution(ref, ref === REF.c1 ? 1 : 2, 1, ref === REF.c1 ? 'confirmed' : 'submitted'),
  );
  api.getPayoutRecord.mockImplementation(async (_t: string, _c: string, ref: string) =>
    ref === REF.p2
      ? payout(REF.p2, 2, 'pending', 'Position 2', 'summary')
      : payout(REF.p1, 1, 'released', 'Olive Organizer', 'full'),
  );
  api.getRoundRecord.mockResolvedValue(round(REF.r1, 1, 'closed'));
  api.getMemberStatementsIndex.mockResolvedValue({
    circle: { id: 'circle-1', name: 'Audit Circle' },
    members: [],
    unclaimedHands: [],
    viewer: { userId: 'u1', role: 'organizer', canViewAllMembers: true },
  });
  api.getStatementDocuments.mockResolvedValue({ documents: [] });
});

afterEach(() => {
  for (const renderer of renderers) TestRenderer.act(() => renderer.unmount());
  renderers = [];
});

describe('Records navigation and the removed feed', () => {
  test('has exactly Overview, Contributions, Payouts, Rounds, Documents, in that order', async () => {
    const renderer = await renderCenter();
    expect(tabs(renderer)).toEqual([
      'Overview',
      'Contributions',
      'Payouts',
      'Rounds',
      'Documents',
    ]);
  });

  test('never shows the old ledger/activity feed or the free-tier cap', async () => {
    const renderer = await renderCenter();
    for (const label of ['Overview', 'Contributions', 'Payouts', 'Rounds', 'Documents']) {
      await press(renderer, label);
      const text = visibleText(renderer);
      expect(text).not.toContain('Circle activity');
      expect(text).not.toContain('Ledger activity');
      expect(text).not.toContain('Unlock full history');
      expect(text).not.toContain('Transaction history');
    }
  });
});

describe('Overview', () => {
  test('shows backend totals and the organizer review prompt with a Round link', async () => {
    const onReviewInRound = jest.fn();
    const renderer = await renderCenter({ onReviewInRound });
    expect(api.getRecordsOverview).toHaveBeenCalledWith('token-1', 'circle-1');
    const text = visibleText(renderer);
    expect(text).toContain('Circle totals');
    expect(text).toContain('$150.00');
    expect(text).toContain('$100.00');
    expect(text).toContain('2 payments are waiting for your review');
    await press(renderer, 'Open the Round tab to review payments');
    expect(onReviewInRound).toHaveBeenCalledTimes(1);
    // Records never offers confirm or reject itself.
    expect(text).not.toMatch(/Confirm received|receive|Reject/);
  });

  test('a member sees their own records and no review prompt', async () => {
    api.getRecordsOverview.mockResolvedValue(overview('member'));
    const renderer = await renderCenter({ isOrganizer: false });
    const text = visibleText(renderer);
    expect(text).toContain('Your records');
    expect(text).toContain('Next contribution');
    expect(text).toContain(REF.c2);
    expect(text).not.toContain('waiting for your review');
    expect(text).not.toContain('Review in Round');
  });
});

describe('Contributions', () => {
  test('lists records newest round first with record numbers and status', async () => {
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    expect(api.getContributionRecords).toHaveBeenCalledWith('token-1', 'circle-1', {
      status: undefined,
      limit: 50,
      offset: 0,
    });
    const text = visibleText(renderer);
    expect(text.indexOf('Round 2')).toBeLessThan(text.indexOf('Round 1'));
    for (const ref of [REF.c1, REF.c2, REF.c3]) expect(text).toContain(ref);
    expect(text).toContain('Submitted');
    expect(text).toContain('Confirmed');
    expect(text).toContain('Rejected');
  });

  test('filters by backend status and pages with Show more', async () => {
    api.getContributionRecords.mockResolvedValueOnce(
      page([contribution(REF.c1, 1, 1, 'confirmed')], { hasMore: true, total: 2 }),
    );
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    api.getContributionRecords.mockResolvedValueOnce(
      page([contribution(REF.c2, 2, 1, 'submitted')], { offset: 1 }),
    );
    await press(renderer, 'Show more');
    expect(api.getContributionRecords).toHaveBeenLastCalledWith('token-1', 'circle-1', {
      status: undefined,
      limit: 50,
      offset: 1,
    });
    expect(visibleText(renderer)).toContain(REF.c2);
    await press(renderer, 'Show Confirmed records');
    expect(api.getContributionRecords).toHaveBeenLastCalledWith('token-1', 'circle-1', {
      status: 'confirmed',
      limit: 50,
      offset: 0,
    });
  });

  test('shows a member only the position label the backend allows, never a name', async () => {
    api.getContributionRecords.mockResolvedValue(
      page([contribution(REF.c3, 2, 3, 'confirmed', 'Position 3')]),
    );
    const renderer = await renderCenter({ isOrganizer: false });
    await press(renderer, 'Contributions');
    expect(visibleText(renderer)).toContain('Position 3');
  });
});

describe('Payouts', () => {
  test('shows a pending payout as Scheduled, has no Ready state, and keeps others summary-only', async () => {
    const renderer = await renderCenter({ isOrganizer: false });
    await press(renderer, 'Payouts');
    const text = visibleText(renderer);
    expect(text).toContain('Scheduled');
    expect(text).toContain('Released');
    expect(text).not.toMatch(/\bReady\b/);
    expect(text).toContain('Recipient: Position 2');
    await press(renderer, `Open record ${REF.p2}`);
    const detail = visibleText(renderer);
    expect(detail).toContain(
      'Only the position, amount, status and date of this payout are shown.',
    );
    expect(detail).not.toContain('Record history');
  });
});

describe('Rounds', () => {
  test('lists rounds with confirmed counts and status', async () => {
    const renderer = await renderCenter();
    await press(renderer, 'Rounds');
    const text = visibleText(renderer);
    expect(text).toContain('1 of 3 confirmed');
    expect(text).toContain('Open');
    expect(text).toContain('Closed');
    expect(text).toContain(REF.r2);
  });
});

describe('Record detail', () => {
  test('shows the record number, verification and its own history', async () => {
    const renderer = await renderCenter({ isOrganizer: false });
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c1}`);
    expect(api.getContributionRecord).toHaveBeenCalledWith('token-1', 'circle-1', REF.c1);
    const text = visibleText(renderer);
    expect(text).toContain('Record number');
    expect(text).toContain(REF.c1);
    expect(text).toContain('Verified by Organizer');
    expect(text).toContain('Record history');
    expect(text).toContain('Submitted');
    expect(text).toContain('Confirmed');
    expect(text).toContain('by Organizer');
    expect(text).not.toContain('Review in Round');
  });

  test('offers Review in Round only to the organizer on a payment waiting for review', async () => {
    const onReviewInRound = jest.fn();
    const renderer = await renderCenter({ onReviewInRound });
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c2}`);
    await press(renderer, 'Review in Round');
    expect(onReviewInRound).toHaveBeenCalledTimes(1);

    const confirmedRenderer = await renderCenter({ onReviewInRound: jest.fn() });
    await press(confirmedRenderer, 'Contributions');
    await press(confirmedRenderer, `Open record ${REF.c1}`);
    expect(visibleText(confirmedRenderer)).not.toContain('Review in Round');
  });

  test('shows a clean error and can retry', async () => {
    api.getContributionRecord.mockRejectedValueOnce(new Error('boom'));
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c1}`);
    expect(visibleText(renderer)).toContain('This record could not be loaded.');
    expect(visibleText(renderer)).not.toContain('boom');
    await press(renderer, 'Try again');
    expect(visibleText(renderer)).toContain(REF.c1);
  });
});

describe('Documents', () => {
  test('keeps member statements and saved documents', async () => {
    const renderer = await renderCenter();
    await press(renderer, 'Documents');
    const text = visibleText(renderer);
    expect(text).toContain('Member Statements');
    expect(text).toContain('Previously generated documents');
    expect(api.getMemberStatementsIndex).toHaveBeenCalledWith('token-1', 'circle-1');
    expect(api.getStatementDocuments).toHaveBeenCalledWith('token-1', 'circle-1');
  });
});

describe('Spanish and Haitian Creole', () => {
  test.each([
    ['es', ['Resumen', 'Aportes', 'Pagos', 'Rondas', 'Documentos'], 'Programado'],
    ['ht', ['Rezime', 'Kontribisyon', 'Peman', 'Wonn', 'Dokiman'], 'Pwograme'],
  ] as const)(
    '%s labels the tabs and a pending payout',
    async (language, expectedTabs, scheduled) => {
      await changeLanguagePreference(language);
      const renderer = await renderCenter({ isOrganizer: false });
      expect(tabs(renderer)).toEqual([...expectedTabs]);
      await press(renderer, expectedTabs[2]);
      expect(visibleText(renderer)).toContain(scheduled);
      expect(visibleText(renderer)).not.toContain('Scheduled');
      await changeLanguagePreference('en');
    },
  );
});

describe('Compact Overview and clean states', () => {
  test('the Overview has no latest-record shortcuts card', async () => {
    const renderer = await renderCenter();
    const text = visibleText(renderer);
    expect(text).not.toContain('Latest closed round');
    expect(text).not.toContain('Latest payout');
    // What remains: review prompt, totals, current round.
    expect(text).toContain('Circle totals');
    expect(text).toContain('Current round');
  });

  test('loading, error and empty lists are a single clean state', async () => {
    api.getContributionRecords.mockImplementationOnce(() => new Promise(() => undefined));
    const loading = await renderCenter();
    await press(loading, 'Contributions');
    expect(visibleText(loading)).toContain('Loading records');

    api.getPayoutRecords.mockRejectedValueOnce(new Error('network down'));
    const failed = await renderCenter();
    await press(failed, 'Payouts');
    expect(visibleText(failed)).toContain('Records could not be loaded.');
    expect(visibleText(failed)).not.toContain('network down');
    api.getPayoutRecords.mockResolvedValueOnce(page([]));
    await press(failed, 'Try again');
    expect(visibleText(failed)).toContain('No payout records yet.');

    api.getRoundRecords.mockResolvedValueOnce(page([]));
    const empty = await renderCenter();
    await press(empty, 'Rounds');
    expect(visibleText(empty)).toContain('No round records yet.');
  });

  test('a filter with no matches says so instead of looking broken', async () => {
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    api.getContributionRecords.mockResolvedValueOnce(page([]));
    await press(renderer, 'Show Missed records');
    expect(visibleText(renderer)).toContain('No records match this filter.');
  });
});

describe('Concise record detail', () => {
  const manyEvents = Array.from({ length: 6 }, (_, index) => ({
    seq: index + 1,
    id: `h${index}`,
    type: index % 2 === 0 ? 'submitted' : 'rejected',
    at: '2026-10-10T15:00:00Z',
    actor: { role: index % 2 === 0 ? 'member' : 'organizer' },
    amountCents: 5000,
    paymentMethod: null,
    note: 'Payment submitted for organizer review.',
  }));
  const events = (text: string) => text.match(/by Member|by Organizer/g)?.length;

  test('shows only the latest history up front and expands on request, without generic ledger notes', async () => {
    api.getContributionRecord.mockResolvedValue({
      ...contribution(REF.c2, 2, 1, 'submitted'),
      history: manyEvents,
    });
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c2}`);
    const before = visibleText(renderer);
    expect(events(before)).toBe(4);
    expect(before).not.toContain('Payment submitted for organizer review.');
    await press(renderer, 'Show all 6');
    expect(events(visibleText(renderer))).toBe(6);
    await press(renderer, 'Show less');
    expect(events(visibleText(renderer))).toBe(4);
  });

  test('does not repeat reported or confirmed times that verification and history already show', async () => {
    const renderer = await renderCenter({ isOrganizer: false });
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c1}`);
    const text = visibleText(renderer);
    expect(text).not.toContain('Reported');
    expect(text).toContain('Verified on');
    expect(text).toContain('Record history');
  });

  test('a round shows only round-level events, because contribution events name no member', async () => {
    api.getRoundRecord.mockResolvedValue({
      ...round(REF.r1, 1, 'closed'),
      history: [
        { seq: 1, id: 'e1', type: 'round_started', at: '2026-10-10T15:00:00Z', actor: { role: 'system' }, amountCents: null, paymentMethod: null, note: null },
        { seq: 2, id: 'e2', type: 'submitted', at: '2026-10-10T15:01:00Z', actor: { role: 'member' }, amountCents: 5000, paymentMethod: null, note: null },
        { seq: 3, id: 'e3', type: 'payout_completed', at: '2026-10-10T15:09:00Z', actor: { role: 'organizer' }, amountCents: 15000, paymentMethod: null, note: null },
      ],
    });
    const renderer = await renderCenter();
    await press(renderer, 'Rounds');
    await press(renderer, `Open record ${REF.r1}`);
    const text = visibleText(renderer);
    expect(text).toContain('Round started');
    expect(text).toContain('Payout released');
    expect(text).not.toContain('Submitted \u00B7 $50.00');
    expect(text).not.toContain('by Member');
  });

  test('a released payout shows a plain Amount, a scheduled one an Expected amount', async () => {
    const renderer = await renderCenter();
    await press(renderer, 'Payouts');
    await press(renderer, `Open record ${REF.p1}`);
    let text = visibleText(renderer);
    expect(text).toContain('Amount');
    expect(text).not.toContain('Expected amount');
    await press(renderer, 'Close');
    await press(renderer, `Open record ${REF.p2}`);
    text = visibleText(renderer);
    expect(text).toContain('Expected amount');
  });
});

describe('Record documents (PDF)', () => {
  const { Alert } = require('react-native') as { Alert: { alert: jest.Mock } };

  test('rows have no PDF buttons; the action appears only after opening a record', async () => {
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    expect(visibleText(renderer)).not.toContain('Download record');
    expect(
      renderer.root.findAll((n: any) => n.props?.accessibilityLabel === 'Download record'),
    ).toHaveLength(0);
    await press(renderer, `Open record ${REF.c1}`);
    expect(visibleText(renderer)).toContain('Download record');
  });

  test.each([
    ['Contributions', REF.c1, 'contribution'],
    ['Payouts', REF.p1, 'payout'],
    ['Rounds', REF.r1, 'round'],
  ] as const)('%s: generates the document for the open record and offers it to the user', async (tab, reference, kind) => {
    const renderer = await renderCenter();
    await press(renderer, tab);
    await press(renderer, `Open record ${reference}`);
    await press(renderer, 'Download record');
    expect(api.downloadRecordPdf).toHaveBeenCalledWith('token-1', 'circle-1', kind, reference);
    // The share sheet is unavailable in tests, so the saved notice shows instead.
    expect(Alert.alert).toHaveBeenCalledWith(
      'Document saved',
      'Sharing is not available on this device. CircuSave_CSC-ABC123-R01-P01-AA-D01.pdf was saved.',
    );
  });

  test('is busy while preparing and cannot be double-tapped', async () => {
    let resolvePdf: ((value: unknown) => void) | null = null;
    api.downloadRecordPdf.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePdf = resolve;
        }),
    );
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c1}`);
    await press(renderer, 'Download record');
    const busy = byLabel(renderer, 'Download record');
    expect(busy.props.disabled).toBe(true);
    expect(busy.props.accessibilityState.busy).toBe(true);
    expect(visibleText(renderer)).toContain('Preparing document');
    await TestRenderer.act(async () => {
      busy.props.onPress();
      await flush();
    });
    expect(api.downloadRecordPdf).toHaveBeenCalledTimes(1);
    await TestRenderer.act(async () => {
      resolvePdf?.({
        bytes: new Uint8Array([1]),
        statementReference: 'X-D01',
        generatedAt: '2026-10-10T15:00:00Z',
        filename: 'x.pdf',
      });
      await flush();
    });
    expect(byLabel(renderer, 'Download record').props.disabled).toBe(false);
  });

  test('shows a clean error without the raw message, then can try again', async () => {
    api.downloadRecordPdf.mockRejectedValueOnce(new Error('HTTP 500 stack trace'));
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c1}`);
    await press(renderer, 'Download record');
    const text = visibleText(renderer);
    expect(text).toContain('The document could not be prepared. Please try again.');
    expect(text).not.toContain('stack trace');
    expect(Alert.alert).not.toHaveBeenCalled();
    await press(renderer, 'Download record');
    expect(visibleText(renderer)).not.toContain('could not be prepared');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  test('the action never appears while the record is loading or has failed to load', async () => {
    api.getContributionRecord.mockRejectedValueOnce(new Error('boom'));
    const renderer = await renderCenter();
    await press(renderer, 'Contributions');
    await press(renderer, `Open record ${REF.c1}`);
    expect(visibleText(renderer)).toContain('This record could not be loaded.');
    expect(visibleText(renderer)).not.toContain('Download record');
  });

  test.each([
    ['es', 'Descargar registro', 'Documento guardado', 'Aportes', `Abrir el registro ${REF.c1}`],
    ['ht', 'Telechaje dosye a', 'Dokiman sove', 'Kontribisyon', `Louvri dosye ${REF.c1}`],
  ] as const)('%s labels the action and the saved notice', async (language, action, saved, tab, open) => {
    await changeLanguagePreference(language);
    const renderer = await renderCenter({ isOrganizer: false });
    await press(renderer, tab);
    await press(renderer, open);
    expect(visibleText(renderer)).toContain(action);
    expect(visibleText(renderer)).not.toContain('Download record');
    await press(renderer, action);
    expect(Alert.alert.mock.calls[0][0]).toBe(saved);
    await changeLanguagePreference('en');
  });
});
