/**
 * Cross-circle Activity feed presentation.
 * Entitlement, filter, grouping, and CSV helpers stay out of the screen.
 */

import type { BackendActivity } from '@/lib/types';

export const FREE_ACTIVITY_VISIBLE_LIMIT = 10;
export const FREE_ACTIVITY_FETCH_LIMIT = 11;
export const PREMIUM_ACTIVITY_PAGE_SIZE = 50;

export type ActivityTypeFilter = 'all' | 'contributions' | 'payouts' | 'reviews';

export type ActivityDayBucket = 'today' | 'yesterday' | 'earlier';

export type ActivityDayGroup = {
  key: string;
  bucket: ActivityDayBucket;
  entries: BackendActivity[];
};

export type ActivityCircleOption = {
  id: string;
  name: string;
};

export type ActivitySummary = {
  contributed: number;
  received: number;
  pendingReview: number;
};

export type NormalizedActivityPage = {
  items: BackendActivity[];
  limit: number;
  hasMore: boolean | null;
  nextCursor: string | null;
};

export function activityFetchLimit(hasFullHistory: boolean): number {
  return hasFullHistory
    ? PREMIUM_ACTIVITY_PAGE_SIZE
    : FREE_ACTIVITY_FETCH_LIMIT;
}

export function activityRequestParams(input: {
  hasFullHistory: boolean;
  append?: boolean;
  loadedCount?: number;
  cursor?: string | null;
}): { limit: number; cursor?: string } {
  const page = activityFetchLimit(input.hasFullHistory);
  if (!input.append) {
    return { limit: page };
  }
  const cursor = String(input.cursor || '').trim();
  if (cursor) {
    return { limit: page, cursor };
  }
  const loaded = Number.isFinite(input.loadedCount)
    ? Math.max(0, Math.floor(input.loadedCount as number))
    : 0;
  return { limit: loaded + page };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asActivityItem(value: unknown): BackendActivity | null {
  if (!isRecord(value)) return null;
  const id = String(value.id || '').trim();
  const type = String(value.type || '').trim();
  if (!id && !type) return null;
  const amountRaw = value.amount;
  const amount =
    typeof amountRaw === 'number' && Number.isFinite(amountRaw)
      ? amountRaw
      : null;
  const roundRaw = value.round;
  const round =
    typeof roundRaw === 'number' && Number.isFinite(roundRaw) ? roundRaw : null;
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const verificationStatus =
    typeof value.verificationStatus === 'string'
      ? value.verificationStatus
      : typeof metadata.verificationStatus === 'string'
        ? metadata.verificationStatus
        : null;
  const paymentOrigin =
    typeof value.paymentOrigin === 'string'
      ? value.paymentOrigin
      : typeof metadata.paymentOrigin === 'string'
        ? metadata.paymentOrigin
        : null;
  return {
    id: id || `${type}:${String(value.createdAt || '')}`,
    circleId: String(value.circleId || ''),
    circleName: String(value.circleName || ''),
    type,
    title: String(value.title || ''),
    message: String(value.message || ''),
    amount,
    createdAt: String(value.createdAt || ''),
    round,
    memberId:
      value.memberId == null || value.memberId === ''
        ? null
        : String(value.memberId),
    metadata,
    verificationStatus,
    paymentOrigin,
  };
}

export function normalizeActivityResponse(
  raw: unknown,
): NormalizedActivityPage {
  const empty: NormalizedActivityPage = {
    items: [],
    limit: 0,
    hasMore: null,
    nextCursor: null,
  };
  if (Array.isArray(raw)) {
    const items = raw
      .map(asActivityItem)
      .filter((item): item is BackendActivity => item != null);
    return { ...empty, items, limit: items.length };
  }
  if (!isRecord(raw)) return empty;

  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw
    .map(asActivityItem)
    .filter((item): item is BackendActivity => item != null);
  const limitNum = Number(raw.limit);
  const limit =
    Number.isFinite(limitNum) && limitNum > 0 ? limitNum : items.length;
  const cursorRaw = raw.nextCursor ?? raw.next_cursor;
  const nextCursor =
    typeof cursorRaw === 'string' && cursorRaw.trim()
      ? cursorRaw.trim()
      : null;
  let hasMore: boolean | null = null;
  if (raw.hasMore === true || raw.has_more === true) hasMore = true;
  else if (raw.hasMore === false || raw.has_more === false) hasMore = false;
  else if (nextCursor) hasMore = true;
  return { items, limit, hasMore, nextCursor };
}

export function mergeActivityItems(
  current: BackendActivity[],
  incoming: BackendActivity[],
): BackendActivity[] {
  const merged: BackendActivity[] = [];
  const seen = new Set<string>();
  for (const item of [...current, ...incoming]) {
    const id = String(item.id || '').trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    merged.push(item);
  }
  return merged;
}

export function shouldShowActivityUpgrade(input: {
  hasFullHistory: boolean;
  itemCount: number;
  requestedLimit: number;
  visibleLimit?: number;
  backendHasMore?: boolean | null;
}): boolean {
  if (input.hasFullHistory) return false;
  if (input.backendHasMore === true) return true;
  if (input.backendHasMore === false) return false;
  const visibleLimit = input.visibleLimit ?? FREE_ACTIVITY_VISIBLE_LIMIT;
  if (input.itemCount > visibleLimit) return true;
  if (input.itemCount >= input.requestedLimit && input.requestedLimit > 0) {
    return true;
  }
  return false;
}

export function shouldShowActivityLoadMore(input: {
  hasFullHistory: boolean;
  visibleCount: number;
  backendHasMore?: boolean | null;
  lastPageCount: number;
  requestedLimit: number;
}): boolean {
  if (!input.hasFullHistory || input.visibleCount <= 0) return false;
  if (input.backendHasMore === true) return true;
  if (input.backendHasMore === false) return false;
  return (
    input.lastPageCount >= input.requestedLimit && input.requestedLimit > 0
  );
}

export function matchesActivityTypeFilter(
  entry: BackendActivity,
  filter: ActivityTypeFilter,
): boolean {
  const type = String(entry.type || '').toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'contributions') return type.includes('contribution');
  if (filter === 'payouts') return type.includes('payout');
  return (
    type.includes('review') ||
    type.includes('rejected') ||
    type.includes('missed')
  );
}

export function uniqueActivityCircles(
  items: BackendActivity[],
): ActivityCircleOption[] {
  const seen = new Set<string>();
  const circles: ActivityCircleOption[] = [];
  for (const item of items) {
    const id = String(item.circleId || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    circles.push({
      id,
      name: String(item.circleName || '').trim() || id,
    });
  }
  return circles;
}

export function filterActivityEntries(input: {
  items: BackendActivity[];
  typeFilter: ActivityTypeFilter;
  circleId?: string | null;
}): BackendActivity[] {
  const circleId = String(input.circleId || '').trim();
  return input.items.filter((entry) => {
    if (circleId && String(entry.circleId || '').trim() !== circleId) {
      return false;
    }
    return matchesActivityTypeFilter(entry, input.typeFilter);
  });
}

export function visibleActivityEntries(input: {
  items: BackendActivity[];
  hasFullHistory: boolean;
  visibleLimit?: number;
}): BackendActivity[] {
  if (input.hasFullHistory) return input.items;
  const limit = input.visibleLimit ?? FREE_ACTIVITY_VISIBLE_LIMIT;
  return input.items.slice(0, limit);
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupActivityByDay(
  entries: BackendActivity[],
  now: Date = new Date(),
): ActivityDayGroup[] {
  const todayKey = localDayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday);

  const buckets = new Map<string, ActivityDayGroup>();
  const order: string[] = [];

  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const key = Number.isNaN(date.getTime()) ? 'unknown' : localDayKey(date);
    const existing = buckets.get(key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    const bucket: ActivityDayBucket =
      key === todayKey
        ? 'today'
        : key === yesterdayKey
          ? 'yesterday'
          : 'earlier';
    buckets.set(key, { key, bucket, entries: [entry] });
    order.push(key);
  }

  return order.map((key) => buckets.get(key)!);
}

export function summarizeActivity(items: BackendActivity[]): ActivitySummary {
  let contributed = 0;
  let received = 0;
  let pendingReview = 0;
  for (const entry of items) {
    const type = String(entry.type || '').toLowerCase();
    const amount =
      typeof entry.amount === 'number' && Number.isFinite(entry.amount)
        ? Math.abs(entry.amount)
        : 0;
    if (
      type.includes('contribution') &&
      !type.includes('rejected') &&
      !type.includes('missed')
    ) {
      contributed += amount;
    }
    if (type.includes('payout')) {
      received += amount;
    }
    if (
      (type.includes('review') && type.includes('required')) ||
      (type.includes('contribution') && type.includes('submitted'))
    ) {
      pendingReview += 1;
    }
  }
  return { contributed, received, pendingReview };
}

function readMetaString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string {
  if (!metadata) return '';
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function resolveActivityMemberName(
  entry: BackendActivity,
  memberMap: Record<string, string> = {},
): string {
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  const metadataName = readMetaString(metadata, [
    'member_name',
    'memberName',
    'recipient_name',
    'recipientName',
  ]);
  if (metadataName) return metadataName;

  const rawMemberId = String(
    entry.memberId ||
      metadata.member_id ||
      metadata.memberId ||
      metadata.recipient_member_id ||
      metadata.recipientMemberId ||
      '',
  ).trim();
  if (rawMemberId && memberMap[rawMemberId]) return memberMap[rawMemberId];
  return '';
}

export function activityNeedsMemberLookup(
  entry: BackendActivity,
  memberMap: Record<string, string>,
): boolean {
  if (resolveActivityMemberName(entry, memberMap)) return false;
  return Boolean(String(entry.circleId || '').trim());
}

export function activityProvenanceKind(
  entry: BackendActivity,
): 'pending' | 'confirmed' | 'rejected' | null {
  const metadata = isRecord(entry.metadata) ? entry.metadata : {};
  const status = String(
    entry.verificationStatus || metadata.verificationStatus || '',
  )
    .trim()
    .toLowerCase();
  if (status === 'pending_organizer_confirmation' || status === 'pending') {
    return 'pending';
  }
  if (status === 'organizer_confirmed' || status === 'confirmed') {
    return 'confirmed';
  }
  if (status === 'organizer_rejected' || status === 'rejected') {
    return 'rejected';
  }
  return null;
}

export function escapeCsvCell(value: string): string {
  let text = String(value ?? '');
  const first = text.charAt(0);
  if (
    first === '=' ||
    first === '+' ||
    first === '-' ||
    first === '@' ||
    first === '\t' ||
    first === '\r' ||
    first === '\n'
  ) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildActivityCsv(
  headers: string[],
  rows: string[][],
): string {
  return [headers, ...rows]
    .map((line) => line.map((cell) => escapeCsvCell(String(cell ?? ''))).join(','))
    .join('\n');
}

export function activityExportFilename(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `circusave-activity-${year}-${month}-${day}.csv`;
}

export function activityPdfExportFilename(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `circusave-activity-report-${year}-${month}-${day}.pdf`;
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sortActivityChronological(
  entries: BackendActivity[],
): BackendActivity[] {
  return entries.slice().sort((left, right) => {
    const leftTime = Date.parse(left.createdAt) || 0;
    const rightTime = Date.parse(right.createdAt) || 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
}

export function activityExportEntries(input: {
  items: BackendActivity[];
  typeFilter: ActivityTypeFilter;
  circleId?: string | null;
}): BackendActivity[] {
  return sortActivityChronological(filterActivityEntries(input));
}

export function isActivityExportPartial(
  backendHasMore: boolean | null | undefined,
): boolean {
  return backendHasMore === true;
}

export function canBeginActivityExport(input: {
  hasFullHistory: boolean;
  lockHeld: boolean;
  rowCount: number;
}): boolean {
  return (
    input.hasFullHistory === true &&
    input.lockHeld !== true &&
    input.rowCount > 0
  );
}

export type ActivityReportRow = {
  date: string;
  event: string;
  member: string;
  circle: string;
  round: string;
  amount: string;
};

export type ActivityReportCopy = {
  brand: string;
  title: string;
  circleLabel: string;
  circleName: string;
  scopeLabel: string;
  scopeValue: string;
  generatedLabel: string;
  generatedAt: string;
  summaryTitle: string;
  contributedLabel: string;
  contributed: string;
  receivedLabel: string;
  received: string;
  reviewLabel: string;
  review: string;
  dateHeader: string;
  eventHeader: string;
  memberHeader: string;
  circleHeader: string;
  roundHeader: string;
  amountHeader: string;
  empty: string;
  informational: string;
  recordsNote: string;
  footer: string;
};

export function buildActivityReportHtml(
  copy: ActivityReportCopy,
  rows: ActivityReportRow[],
): string {
  const safe = {
    brand: escapeHtml(copy.brand),
    title: escapeHtml(copy.title),
    circleLabel: escapeHtml(copy.circleLabel),
    circleName: escapeHtml(copy.circleName),
    scopeLabel: escapeHtml(copy.scopeLabel),
    scopeValue: escapeHtml(copy.scopeValue),
    generatedLabel: escapeHtml(copy.generatedLabel),
    generatedAt: escapeHtml(copy.generatedAt),
    summaryTitle: escapeHtml(copy.summaryTitle),
    contributedLabel: escapeHtml(copy.contributedLabel),
    contributed: escapeHtml(copy.contributed),
    receivedLabel: escapeHtml(copy.receivedLabel),
    received: escapeHtml(copy.received),
    reviewLabel: escapeHtml(copy.reviewLabel),
    review: escapeHtml(copy.review),
    dateHeader: escapeHtml(copy.dateHeader),
    eventHeader: escapeHtml(copy.eventHeader),
    memberHeader: escapeHtml(copy.memberHeader),
    circleHeader: escapeHtml(copy.circleHeader),
    roundHeader: escapeHtml(copy.roundHeader),
    amountHeader: escapeHtml(copy.amountHeader),
    empty: escapeHtml(copy.empty),
    informational: escapeHtml(copy.informational),
    recordsNote: escapeHtml(copy.recordsNote),
    footer: escapeHtml(copy.footer),
  };
  const bodyRows =
    rows.length === 0
      ? `<tr><td colspan="6">${safe.empty}</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.event)}</td><td>${escapeHtml(row.member)}</td><td>${escapeHtml(row.circle)}</td><td>${escapeHtml(row.round)}</td><td>${escapeHtml(row.amount)}</td></tr>`,
          )
          .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${safe.title}</title>
<style>
  @page { margin: 16mm; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #0F172A;
    margin: 0;
    padding: 0;
  }
  .brand {
    color: #6B46C1;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  h1 {
    font-size: 26px;
    margin: 6px 0 16px;
  }
  .meta, .note, .footer {
    color: #64748B;
    font-size: 12px;
  }
  .meta p { margin: 0 0 4px; }
  .chips { margin: 16px 0 20px; }
  .chip {
    display: inline-block;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 8px 12px;
    margin: 0 8px 8px 0;
    min-width: 110px;
  }
  .chip span { display: block; font-size: 10px; font-weight: 700; color: #64748B; }
  .chip b { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th {
    text-align: left;
    background: #F5F3FF;
    color: #4C1D95;
    padding: 8px;
  }
  td {
    border-bottom: 1px solid #E2E8F0;
    padding: 8px;
    vertical-align: top;
  }
  .note { margin-top: 18px; }
  .footer {
    margin-top: 24px;
    border-top: 1px solid #E2E8F0;
    padding-top: 8px;
    font-size: 10px;
  }
</style>
</head>
<body>
  <div class="brand">${safe.brand}</div>
  <h1>${safe.title}</h1>
  <div class="meta">
    <p>${safe.circleLabel}: ${safe.circleName}</p>
    <p>${safe.scopeLabel}: ${safe.scopeValue}</p>
    <p>${safe.generatedLabel}: ${safe.generatedAt}</p>
  </div>
  <div class="chips">
    <div class="chip"><span>${safe.contributedLabel}</span><b>${safe.contributed}</b></div>
    <div class="chip"><span>${safe.receivedLabel}</span><b>${safe.received}</b></div>
    <div class="chip"><span>${safe.reviewLabel}</span><b>${safe.review}</b></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${safe.dateHeader}</th>
        <th>${safe.eventHeader}</th>
        <th>${safe.memberHeader}</th>
        <th>${safe.circleHeader}</th>
        <th>${safe.roundHeader}</th>
        <th>${safe.amountHeader}</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="note">${safe.informational}</p>
  <p class="note">${safe.recordsNote}</p>
  <div class="footer">${safe.footer}</div>
</body>
</html>`;
}

export function presentActivityFeed(input: {
  items: BackendActivity[];
  typeFilter: ActivityTypeFilter;
  circleId?: string | null;
  hasFullHistory: boolean;
  backendHasMore?: boolean | null;
  requestedLimit: number;
  lastPageCount: number;
  now?: Date;
}): {
  circles: ActivityCircleOption[];
  circleScoped: BackendActivity[];
  visible: BackendActivity[];
  sections: ActivityDayGroup[];
  summary: ActivitySummary;
  showUpgrade: boolean;
  showExport: boolean;
  showLoadMore: boolean;
  emptyFilter: boolean;
} {
  const circles = uniqueActivityCircles(input.items);
  const circleScoped = filterActivityEntries({
    items: input.items,
    typeFilter: 'all',
    circleId: input.circleId,
  });
  const filtered = filterActivityEntries({
    items: input.items,
    typeFilter: input.typeFilter,
    circleId: input.circleId,
  });
  const visible = visibleActivityEntries({
    items: filtered,
    hasFullHistory: input.hasFullHistory,
  });
  const showUpgrade = shouldShowActivityUpgrade({
    hasFullHistory: input.hasFullHistory,
    itemCount: input.items.length,
    requestedLimit: input.requestedLimit,
    backendHasMore: input.backendHasMore,
  });
  return {
    circles,
    circleScoped,
    visible,
    sections: groupActivityByDay(visible, input.now),
    summary: summarizeActivity(circleScoped),
    showUpgrade,
    showExport: input.hasFullHistory && visible.length > 0,
    showLoadMore: shouldShowActivityLoadMore({
      hasFullHistory: input.hasFullHistory,
      visibleCount: visible.length,
      backendHasMore: input.backendHasMore,
      lastPageCount: input.lastPageCount,
      requestedLimit: input.requestedLimit,
    }),
    emptyFilter: input.items.length > 0 && visible.length === 0,
  };
}
