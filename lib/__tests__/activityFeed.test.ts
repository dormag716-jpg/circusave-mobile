import type { BackendActivity } from '../types';
import {
  FREE_ACTIVITY_FETCH_LIMIT,
  FREE_ACTIVITY_VISIBLE_LIMIT,
  PREMIUM_ACTIVITY_PAGE_SIZE,
  activityExportEntries,
  activityExportFilename,
  activityPdfExportFilename,
  activityFetchLimit,
  activityNeedsMemberLookup,
  activityProvenanceKind,
  activityRequestParams,
  buildActivityCsv,
  buildActivityReportHtml,
  canBeginActivityExport,
  escapeCsvCell,
  escapeHtml,
  isActivityExportPartial,
  filterActivityEntries,
  groupActivityByDay,
  mergeActivityItems,
  normalizeActivityResponse,
  presentActivityFeed,
  resolveActivityMemberName,
  shouldShowActivityLoadMore,
  shouldShowActivityUpgrade,
  summarizeActivity,
} from '../activityFeed';

function activity(
  overrides: Partial<BackendActivity> & Pick<BackendActivity, 'id' | 'type'>,
): BackendActivity {
  return {
    circleId: 'circle-1',
    circleName: 'Neighborhood',
    title: '',
    message: '',
    amount: 100,
    createdAt: '2026-09-02T15:00:00.000Z',
    round: 2,
    memberId: 'member-1',
    metadata: {},
    ...overrides,
  };
}

describe('activity fetch limits', () => {
  test('free fetches one extra row so truncation is detectable', () => {
    expect(activityFetchLimit(false)).toBe(FREE_ACTIVITY_FETCH_LIMIT);
    expect(FREE_ACTIVITY_FETCH_LIMIT).toBe(FREE_ACTIVITY_VISIBLE_LIMIT + 1);
    expect(activityFetchLimit(true)).toBe(PREMIUM_ACTIVITY_PAGE_SIZE);
  });

  test('first page uses the entitlement page size', () => {
    expect(activityRequestParams({ hasFullHistory: false })).toEqual({
      limit: FREE_ACTIVITY_FETCH_LIMIT,
    });
    expect(activityRequestParams({ hasFullHistory: true })).toEqual({
      limit: PREMIUM_ACTIVITY_PAGE_SIZE,
    });
  });

  test('append prefers cursor and otherwise expands the window', () => {
    expect(
      activityRequestParams({
        hasFullHistory: true,
        append: true,
        cursor: 'abc',
        loadedCount: 50,
      }),
    ).toEqual({ limit: PREMIUM_ACTIVITY_PAGE_SIZE, cursor: 'abc' });
    expect(
      activityRequestParams({
        hasFullHistory: true,
        append: true,
        loadedCount: 50,
      }),
    ).toEqual({ limit: 100 });
  });
});

describe('normalizeActivityResponse', () => {
  test('reads items, snake_case cursors, and explicit hasMore', () => {
    const page = normalizeActivityResponse({
      items: [
        {
          id: 'a1',
          type: 'contribution_confirmed',
          circleId: 'c1',
          circleName: 'One',
          amount: 40,
          createdAt: '2026-09-01T00:00:00Z',
          round: 1,
          memberId: 'm1',
          metadata: {},
          verificationStatus: 'organizer_confirmed',
        },
      ],
      limit: 10,
      has_more: true,
      next_cursor: 'cursor-2',
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].verificationStatus).toBe('organizer_confirmed');
    expect(page.limit).toBe(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('cursor-2');
  });

  test('treats a bare array as a page with unknown hasMore', () => {
    const page = normalizeActivityResponse([
      activity({ id: 'a1', type: 'payout_released' }),
    ]);
    expect(page.items[0].id).toBe('a1');
    expect(page.hasMore).toBeNull();
  });

  test('fails closed on junk payloads', () => {
    expect(normalizeActivityResponse(null)).toEqual({
      items: [],
      limit: 0,
      hasMore: null,
      nextCursor: null,
    });
  });
});

describe('history gating', () => {
  test('does not upsell premium users', () => {
    expect(
      shouldShowActivityUpgrade({
        hasFullHistory: true,
        itemCount: 80,
        requestedLimit: 50,
        backendHasMore: true,
      }),
    ).toBe(false);
  });

  test('shows upgrade when the backend says more exists', () => {
    expect(
      shouldShowActivityUpgrade({
        hasFullHistory: false,
        itemCount: 4,
        requestedLimit: 11,
        backendHasMore: true,
      }),
    ).toBe(true);
  });

  test('hides upgrade when the backend says this is the full list', () => {
    expect(
      shouldShowActivityUpgrade({
        hasFullHistory: false,
        itemCount: 10,
        requestedLimit: 11,
        backendHasMore: false,
      }),
    ).toBe(false);
  });

  test('detects truncation from a filled free page', () => {
    expect(
      shouldShowActivityUpgrade({
        hasFullHistory: false,
        itemCount: 11,
        requestedLimit: 11,
        backendHasMore: null,
      }),
    ).toBe(true);
    expect(
      shouldShowActivityUpgrade({
        hasFullHistory: false,
        itemCount: 3,
        requestedLimit: 11,
        backendHasMore: null,
      }),
    ).toBe(false);
  });

  test('load more is premium-only and follows the last page', () => {
    expect(
      shouldShowActivityLoadMore({
        hasFullHistory: true,
        visibleCount: 50,
        backendHasMore: true,
        lastPageCount: 50,
        requestedLimit: 50,
      }),
    ).toBe(true);
    expect(
      shouldShowActivityLoadMore({
        hasFullHistory: false,
        visibleCount: 10,
        backendHasMore: true,
        lastPageCount: 11,
        requestedLimit: 11,
      }),
    ).toBe(false);
    expect(
      shouldShowActivityLoadMore({
        hasFullHistory: true,
        visibleCount: 20,
        backendHasMore: false,
        lastPageCount: 50,
        requestedLimit: 50,
      }),
    ).toBe(false);
  });
});

describe('filters, grouping, and summaries', () => {
  const items = [
    activity({
      id: 'c1',
      type: 'contribution_confirmed',
      amount: 50,
      createdAt: '2026-09-02T16:00:00.000Z',
    }),
    activity({
      id: 'c2',
      type: 'contribution_submitted',
      amount: 50,
      createdAt: '2026-09-01T16:00:00.000Z',
    }),
    activity({
      id: 'p1',
      type: 'payout_released',
      amount: 400,
      circleId: 'circle-2',
      circleName: 'Family',
      createdAt: '2026-08-20T16:00:00.000Z',
    }),
    activity({
      id: 'r1',
      type: 'payment_review_required',
      amount: null,
      createdAt: '2026-09-02T12:00:00.000Z',
    }),
  ];

  test('type and circle filters are exclusive', () => {
    expect(
      filterActivityEntries({ items, typeFilter: 'payouts' }).map((row) => row.id),
    ).toEqual(['p1']);
    expect(
      filterActivityEntries({
        items,
        typeFilter: 'all',
        circleId: 'circle-2',
      }).map((row) => row.id),
    ).toEqual(['p1']);
    expect(
      filterActivityEntries({ items, typeFilter: 'reviews' }).map((row) => row.id),
    ).toEqual(['r1']);
  });

  test('groups by local day with today and yesterday buckets', () => {
    const now = new Date(2026, 8, 2, 18, 0, 0);
    const today = new Date(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const older = new Date(now);
    older.setDate(older.getDate() - 10);
    const groups = groupActivityByDay(
      [
        activity({ id: 't', type: 'payout_released', createdAt: today.toISOString() }),
        activity({
          id: 'y',
          type: 'payout_released',
          createdAt: yesterday.toISOString(),
        }),
        activity({
          id: 'o',
          type: 'payout_released',
          createdAt: older.toISOString(),
        }),
      ],
      now,
    );
    expect(groups.map((group) => group.bucket)).toEqual([
      'today',
      'yesterday',
      'earlier',
    ]);
    expect(groups[0].entries[0].id).toBe('t');
  });

  test('summarizes contributed, received, and pending review', () => {
    expect(summarizeActivity(items)).toEqual({
      contributed: 100,
      received: 400,
      pendingReview: 2,
    });
  });

  test('presentActivityFeed caps free users and exposes export for premium', () => {
    const many = Array.from({ length: 15 }, (_, index) =>
      activity({ id: `n${index}`, type: 'contribution_confirmed' }),
    );
    const free = presentActivityFeed({
      items: many,
      typeFilter: 'all',
      hasFullHistory: false,
      requestedLimit: 11,
      lastPageCount: 15,
      backendHasMore: null,
    });
    expect(free.visible).toHaveLength(10);
    expect(free.showUpgrade).toBe(true);
    expect(free.showExport).toBe(false);
    expect(free.showLoadMore).toBe(false);

    const premium = presentActivityFeed({
      items: many,
      typeFilter: 'all',
      hasFullHistory: true,
      requestedLimit: 50,
      lastPageCount: 15,
      backendHasMore: false,
    });
    expect(premium.visible).toHaveLength(15);
    expect(premium.showUpgrade).toBe(false);
    expect(premium.showExport).toBe(true);
    expect(premium.showLoadMore).toBe(false);
  });

  test('emptyFilter is true when a type filter hides every row', () => {
    const presented = presentActivityFeed({
      items: [activity({ id: 'c1', type: 'contribution_confirmed' })],
      typeFilter: 'payouts',
      hasFullHistory: true,
      requestedLimit: 50,
      lastPageCount: 1,
    });
    expect(presented.emptyFilter).toBe(true);
    expect(presented.visible).toHaveLength(0);
  });
});

describe('member names, provenance, and csv', () => {
  test('prefers metadata names over membership lookups', () => {
    const entry = activity({
      id: 'a1',
      type: 'payout_released',
      memberId: 'member-1',
      metadata: { memberName: 'Ana' },
    });
    expect(resolveActivityMemberName(entry, { 'member-1': 'Other' })).toBe(
      'Ana',
    );
    expect(activityNeedsMemberLookup(entry, {})).toBe(false);
    expect(
      activityNeedsMemberLookup(
        activity({ id: 'b1', type: 'payout_released', metadata: {} }),
        {},
      ),
    ).toBe(true);
  });

  test('reads organizer verification from the entry or metadata', () => {
    expect(
      activityProvenanceKind(
        activity({
          id: 'a1',
          type: 'contribution_confirmed',
          verificationStatus: 'organizer_confirmed',
        }),
      ),
    ).toBe('confirmed');
    expect(
      activityProvenanceKind(
        activity({
          id: 'a2',
          type: 'contribution_submitted',
          metadata: { verificationStatus: 'pending_organizer_confirmation' },
        }),
      ),
    ).toBe('pending');
  });

  test('merges pages without duplicating ids', () => {
    const merged = mergeActivityItems(
      [activity({ id: 'a1', type: 'payout_released' })],
      [
        activity({ id: 'a1', type: 'payout_released' }),
        activity({ id: 'a2', type: 'payout_released' }),
      ],
    );
    expect(merged.map((row) => row.id)).toEqual(['a1', 'a2']);
  });

  test('escapes csv cells and writes a dated filename', () => {
    expect(escapeCsvCell('Neighborhood Circle')).toBe('Neighborhood Circle');
    expect(escapeCsvCell('He said "ok"')).toBe('"He said ""ok"""');
    const csv = buildActivityCsv(
      ['Date', 'Event'],
      [['2026-09-02', 'Ana, confirmed']],
    );
    expect(csv).toBe('Date,Event\n2026-09-02,"Ana, confirmed"');
    expect(activityExportFilename(new Date(2026, 8, 2))).toBe(
      'circusave-activity-2026-09-02.csv',
    );
  });

  test('leaves ordinary csv text unchanged', () => {
    expect(escapeCsvCell('Neighborhood Circle')).toBe('Neighborhood Circle');
    expect(escapeCsvCell('Round 3')).toBe('Round 3');
  });

  test('still quotes commas and doubles embedded quotes', () => {
    expect(escapeCsvCell('Ana, confirmed')).toBe('"Ana, confirmed"');
    expect(escapeCsvCell('He said "ok"')).toBe('"He said ""ok"""');
  });

  test('neutralizes leading csv formula characters', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('-1+1')).toBe("'-1+1");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  test('neutralizes leading tab, CR, and LF', () => {
    expect(escapeCsvCell('\t=cmd')).toBe("'\t=cmd");
    expect(escapeCsvCell('\r=cmd')).toBe("\"'\r=cmd\"");
    expect(escapeCsvCell('\n=cmd')).toBe("\"'\n=cmd\"");
  });
});

describe('activity PDF report', () => {
  const reportCopy = {
    brand: 'CircuSave',
    title: 'Activity Report',
    circleLabel: 'Circle',
    circleName: 'All circles',
    scopeLabel: 'Report scope',
    scopeValue: 'All',
    generatedLabel: 'Generated',
    generatedAt: 'Sep 2, 2026, 3:00 PM',
    summaryTitle: 'Summary',
    contributedLabel: 'Contributed',
    contributed: '$100.00',
    receivedLabel: 'Received',
    received: '$400.00',
    reviewLabel: 'To review',
    review: '1',
    dateHeader: 'Date',
    eventHeader: 'Event',
    memberHeader: 'Member',
    circleHeader: 'Circle',
    roundHeader: 'Round',
    amountHeader: 'Amount',
    empty: 'No matching activity in this report.',
    informational:
      'This is an informational CircuSave Activity Report. It is not an official financial, tax, or bank statement.',
    recordsNote: 'Official member statements are available in Records.',
    footer: 'CircuSave Activity Report',
  };

  test('builds a professional HTML report without internal identifiers', () => {
    const html = buildActivityReportHtml(reportCopy, [
      {
        date: 'Sep 1, 2026',
        event: 'Ana submitted a contribution for Round 2.',
        member: 'Ana',
        circle: 'Neighborhood',
        round: '2',
        amount: '$50.00',
      },
    ]);
    expect(html).toContain('CircuSave');
    expect(html).toContain('Activity Report');
    expect(html).toContain('All circles');
    expect(html).toContain('Ana submitted a contribution for Round 2.');
    expect(html).toContain('Official member statements are available in Records.');
    expect(html).toContain('informational CircuSave Activity Report');
    expect(html).toContain('class="footer"');
    expect(html).not.toContain('@bottom-center');
    expect(html).not.toContain('counter(page)');
    expect(html).not.toContain('position: fixed');
    expect(html).not.toContain('contribution_submitted');
    expect(html).not.toContain('membership-1');
    expect(html).not.toContain('Member Activity Statement');
    expect(activityPdfExportFilename(new Date(2026, 8, 2))).toBe(
      'circusave-activity-report-2026-09-02.pdf',
    );
  });

  test('escapes dynamic HTML values including quotes and script-like text', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml('Ana & "Mia"')).toBe('Ana &amp; &quot;Mia&quot;');
    expect(escapeHtml("O'Neil")).toBe('O&#39;Neil');
    const html = buildActivityReportHtml(
      {
        ...reportCopy,
        circleName: '<img src=x onerror=alert(1)>',
        scopeValue: 'All & Review',
      },
      [
        {
          date: 'Sep 1',
          event: '<b>raw</b>',
          member: 'Ana "Queen"',
          circle: 'Neighborhood',
          round: '2',
          amount: '$50.00',
        },
      ],
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('All &amp; Review');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
    expect(html).toContain('Ana &quot;Queen&quot;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });

  test('exports the filtered dataset in chronological order, not the newest-first cap', () => {
    const rows = activityExportEntries({
      items: [
        activity({
          id: 'newer',
          type: 'payout_released',
          createdAt: '2026-09-02T15:00:00.000Z',
        }),
        activity({
          id: 'older',
          type: 'contribution_confirmed',
          createdAt: '2026-09-01T15:00:00.000Z',
        }),
      ],
      typeFilter: 'all',
    });
    expect(rows.map((row) => row.id)).toEqual(['older', 'newer']);
  });

  test('blocks duplicate exports and free-tier export', () => {
    expect(
      canBeginActivityExport({
        hasFullHistory: true,
        lockHeld: false,
        rowCount: 2,
      }),
    ).toBe(true);
    expect(
      canBeginActivityExport({
        hasFullHistory: true,
        lockHeld: true,
        rowCount: 2,
      }),
    ).toBe(false);
    expect(
      canBeginActivityExport({
        hasFullHistory: false,
        lockHeld: false,
        rowCount: 2,
      }),
    ).toBe(false);
    expect(isActivityExportPartial(true)).toBe(true);
    expect(isActivityExportPartial(false)).toBe(false);
  });
});
