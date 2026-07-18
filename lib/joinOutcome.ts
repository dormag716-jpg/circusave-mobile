/**
 * Interpret a join API response so the UI can show honest claimed vs pending copy.
 * Pure helpers for unit tests without React Native.
 */

export type JoinOutcome = 'claimed' | 'pending' | 'unknown';

export type JoinOutcomeMemberLike = {
  id?: string;
  userId?: string | null;
};

export type JoinOutcomeDetailLike = {
  members?: JoinOutcomeMemberLike[] | null;
  waitlist?: JoinOutcomeMemberLike[] | null;
  viewerHands?: JoinOutcomeMemberLike[] | null;
  viewerHandCount?: number | null;
  userRole?: string | null;
};

export function resolveJoinOutcome(
  detail: JoinOutcomeDetailLike | null | undefined,
  viewerUserId: string | null | undefined,
): JoinOutcome {
  if (!detail) {
    return 'unknown';
  }

  const uid = String(viewerUserId || '').trim();
  const viewerHands = Array.isArray(detail.viewerHands) ? detail.viewerHands : [];
  if (viewerHands.length > 0 || Number(detail.viewerHandCount || 0) > 0) {
    return 'claimed';
  }

  if (uid) {
    const members = Array.isArray(detail.members) ? detail.members : [];
    if (members.some((member) => String(member.userId || '').trim() === uid)) {
      return 'claimed';
    }
    const waitlist = Array.isArray(detail.waitlist) ? detail.waitlist : [];
    if (waitlist.some((entry) => String(entry.userId || '').trim() === uid)) {
      return 'pending';
    }
  }

  const role = String(detail.userRole || '').trim().toLowerCase();
  if (role === 'member' || role === 'organizer' || role === 'participant') {
    return 'claimed';
  }
  if (role === 'waitlist') {
    return 'pending';
  }

  // Join endpoints usually return the circle after enqueueing a waitlist row.
  // Without a viewer id we cannot prove membership, so prefer pending over claimed.
  return 'pending';
}

export function joinOutcomeTitle(outcome: JoinOutcome): string {
  if (outcome === 'claimed') {
    return "You're in!";
  }
  if (outcome === 'pending') {
    return 'Request sent';
  }
  return 'Request submitted';
}

export function joinOutcomeMessage(
  outcome: JoinOutcome,
  circleName?: string | null,
): string {
  const name = String(circleName || '').trim() || 'this circle';
  if (outcome === 'claimed') {
    return `Your hand in ${name} is ready. You can open the circle workspace when you're ready.`;
  }
  if (outcome === 'pending') {
    return `Your request to join ${name} is waiting for the organizer to approve. You'll be notified once they review it.`;
  }
  return `Your request for ${name} was submitted. Check your circles for the latest status.`;
}
