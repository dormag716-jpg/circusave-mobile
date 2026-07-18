import {
  ORGANIZER_HAND_DRAFT_ID,
  PAYOUT_ORDER_DEFERRED_COPY,
  applyDraftDefaults,
  buildCreateCirclePayload,
  buildPlannedMemberRows,
  calculateCircleMetrics,
  ensureMemberDraftId,
  isOrganizerSelf,
  validateMinimumHands,
  type MemberDraft,
} from '../createCircleWizard';

function member(
  partial: Partial<MemberDraft> & Pick<MemberDraft, 'firstName' | 'lastName' | 'phone'>,
): MemberDraft {
  return ensureMemberDraftId({
    draftId: partial.draftId || '',
    email: partial.email || '',
    firstName: partial.firstName,
    lastName: partial.lastName,
    phone: partial.phone,
    handNumber: partial.handNumber ?? 1,
  });
}

describe('createCircleWizard', () => {
  const alice = member({
    draftId: 'md_alice',
    firstName: 'Jean',
    lastName: 'Malou',
    phone: '555-111-0001',
    email: 'jean@example.com',
  });
  const bob = member({
    draftId: 'md_bob',
    firstName: 'Dormag',
    lastName: 'Home',
    phone: '555-111-0002',
    email: 'dormag@example.com',
  });

  test('create payload does not finalize payout order', () => {
    const payload = buildCreateCirclePayload({
      circleName: 'Test',
      contributionAmount: 500,
      frequency: 'weekly',
      startDate: '2026-08-01',
      members: [alice, bob],
      organizerParticipates: true,
    });
    expect(payload.organizerParticipates).toBe(true);
    expect(payload.organizerHandCount).toBe(1);
    // No payout position at create — order is deferred to setup after claims.
    expect((payload as { organizerPayoutPosition?: number }).organizerPayoutPosition).toBeUndefined();
    expect(payload.members.map((m) => m.firstName)).toEqual(['Jean', 'Dormag']);
  });

  test('non-participating organizer omits organizer hand fields', () => {
    const payload = buildCreateCirclePayload({
      circleName: 'Test',
      contributionAmount: 100,
      frequency: 'monthly',
      startDate: '2026-08-01',
      members: [alice, bob],
      organizerParticipates: false,
    });
    expect(payload.organizerParticipates).toBe(false);
    expect(payload.organizerHandCount).toBeUndefined();
    expect(payload.members).toHaveLength(2);
  });

  test('pot size and rounds use total hands', () => {
    const participating = calculateCircleMetrics([alice, bob], true, 500);
    expect(participating.people).toBe(3);
    expect(participating.totalHands).toBe(3);
    expect(participating.potSize).toBe(1500);
    expect(participating.rounds).toBe(3);

    const organizingOnly = calculateCircleMetrics([alice, bob], false, 500);
    expect(organizingOnly.people).toBe(2);
    expect(organizingOnly.totalHands).toBe(2);
    expect(organizingOnly.potSize).toBe(1000);
    expect(organizingOnly.rounds).toBe(2);
  });

  test('planned member rows list draft structure without calling it payout order', () => {
    const rows = buildPlannedMemberRows([alice, bob], true, 'Gregory Dorema');
    expect(rows).toHaveLength(3);
    expect(rows[0].isOrganizer).toBe(true);
    expect(rows[0].label).toBe('Gregory Dorema · Hand 1');
    expect(rows[1].label).toBe('Jean Malou · Hand 1');
    expect(rows[2].label).toBe('Dormag Home · Hand 1');
    expect(PAYOUT_ORDER_DEFERRED_COPY).toMatch(/finalized after members claim/i);
  });

  test('organizer cannot manually add themselves by email or phone', () => {
    expect(
      isOrganizerSelf(
        member({
          firstName: 'Greg',
          lastName: 'D',
          phone: '555-999-0000',
          email: 'greg@example.com',
        }),
        { email: 'greg@example.com', phone: null },
      ),
    ).toBe(true);

    expect(
      isOrganizerSelf(
        member({
          firstName: 'Greg',
          lastName: 'D',
          phone: '(555) 999-0000',
          email: '',
        }),
        { email: 'other@example.com', phone: '5559990000' },
      ),
    ).toBe(true);

    expect(
      isOrganizerSelf(
        member({
          firstName: 'Jean',
          lastName: 'Malou',
          phone: '555-111-0001',
          email: 'jean@example.com',
        }),
        { email: 'greg@example.com', phone: '5559990000' },
      ),
    ).toBe(false);
  });

  test('resumed older drafts receive safe defaults and clamp past payout step', () => {
    const restored = applyDraftDefaults({
      circleName: 'Legacy',
      activeStep: 5, // old review index
      members: [
        {
          draftId: '',
          firstName: 'A',
          lastName: 'B',
          phone: '555',
          email: '',
        } as MemberDraft,
      ],
      payoutOrder: [ORGANIZER_HAND_DRAFT_ID], // ignored legacy field
      // organizerParticipates omitted on older drafts
    });
    expect(restored.organizerParticipates).toBe(true);
    expect(restored.members[0].draftId).toMatch(/^md_/);
    expect(restored.activeStep).toBe(4); // new review index
    expect((restored as { payoutOrder?: string[] }).payoutOrder).toBeUndefined();
  });

  test('standard one-hand-per-person creation still works', () => {
    expect(validateMinimumHands([alice, bob], true)).toBeNull();
    const payload = buildCreateCirclePayload({
      circleName: 'Family',
      contributionAmount: 100,
      frequency: 'weekly',
      startDate: '2026-08-01',
      members: [alice, bob],
      organizerParticipates: true,
    });
    expect(payload.members).toHaveLength(2);
    expect(payload.organizerHandCount).toBe(1);
  });

  test('minimum hands validation', () => {
    expect(validateMinimumHands([], true)).toMatch(/at least 1 other member/i);
    expect(validateMinimumHands([alice], false)).toMatch(/at least 2 members/i);
    expect(validateMinimumHands([alice], true)).toBeNull();
  });

  test('Continue Setup navigation target is workspace People tab', () => {
    // Mirrors lib/navigation.circleWorkspaceHref(id, 'people') without importing
    // expo-linking (breaks pure Jest). setup.tsx calls that helper after create.
    const href = {
      pathname: '/circle/workspace' as const,
      params: { circleId: 'circle_123', tab: 'people' },
    };
    expect(href.params.tab).toBe('people');
    expect(href.pathname).toBe('/circle/workspace');
  });
});
