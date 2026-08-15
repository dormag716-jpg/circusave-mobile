/**
 * P0.5.3: financial action gating uses backend permissions only.
 * Local conditions may further restrict; never promote backend false → true.
 */

import {
  canShowBackendGatedAction,
  getCircleLifecyclePhase,
  isBackendPermissionGranted,
  isReadOnlyLifecyclePhase,
} from '../startCircleReadiness';

type ViewerPermissions = {
  canSubmitOwnContribution?: boolean;
  canApproveContributions?: boolean;
  canRejectContributions?: boolean;
  canRemindMembers?: boolean;
  canReleasePayout?: boolean;
};

function financialUiFlags(
  perms: ViewerPermissions | null | undefined,
  local: {
    handDue?: boolean;
    readyForPayout?: boolean;
    payoutReleased?: boolean;
  } = {},
) {
  return {
    canSubmit: canShowBackendGatedAction(
      perms?.canSubmitOwnContribution,
      local.handDue !== false,
    ),
    canApprove: canShowBackendGatedAction(perms?.canApproveContributions),
    canReject: canShowBackendGatedAction(
      perms?.canRejectContributions ?? perms?.canApproveContributions,
    ),
    canRemind: canShowBackendGatedAction(perms?.canRemindMembers),
    canRelease: canShowBackendGatedAction(
      perms?.canReleasePayout,
      Boolean(local.readyForPayout) && !local.payoutReleased,
    ),
  };
}

describe('lifecycle financial gating (P0.5.3)', () => {
  const activePerms: ViewerPermissions = {
    canSubmitOwnContribution: true,
    canApproveContributions: true,
    canRejectContributions: true,
    canRemindMembers: true,
    canReleasePayout: true,
  };

  const deniedPerms: ViewerPermissions = {
    canSubmitOwnContribution: false,
    canApproveContributions: false,
    canRejectContributions: false,
    canRemindMembers: false,
    canReleasePayout: false,
  };

  test('missing permission defaults false for every financial action', () => {
    const flags = financialUiFlags(undefined, {
      handDue: true,
      readyForPayout: true,
    });
    expect(flags.canSubmit).toBe(false);
    expect(flags.canApprove).toBe(false);
    expect(flags.canReject).toBe(false);
    expect(flags.canRemind).toBe(false);
    expect(flags.canRelease).toBe(false);
    expect(isBackendPermissionGranted(undefined)).toBe(false);
  });

  test('backend false always hides/disables even when local conditions allow', () => {
    const flags = financialUiFlags(deniedPerms, {
      handDue: true,
      readyForPayout: true,
      payoutReleased: false,
    });
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
  });

  test('backend true plus valid local condition shows action', () => {
    expect(
      financialUiFlags(activePerms, { handDue: true }).canSubmit,
    ).toBe(true);
    expect(
      financialUiFlags(activePerms, {
        readyForPayout: true,
        payoutReleased: false,
      }).canRelease,
    ).toBe(true);
  });

  test('backend true with failing local condition stays hidden', () => {
    expect(
      financialUiFlags(activePerms, { handDue: false }).canSubmit,
    ).toBe(false);
    expect(
      financialUiFlags(activePerms, {
        readyForPayout: false,
        payoutReleased: false,
      }).canRelease,
    ).toBe(false);
    expect(
      financialUiFlags(activePerms, {
        readyForPayout: true,
        payoutReleased: true,
      }).canRelease,
    ).toBe(false);
  });

  test('participant active can submit when backend allows; cannot approve/release', () => {
    const participant: ViewerPermissions = {
      canSubmitOwnContribution: true,
      canApproveContributions: false,
      canRejectContributions: false,
      canRemindMembers: false,
      canReleasePayout: false,
    };
    const flags = financialUiFlags(participant, {
      handDue: true,
      readyForPayout: true,
    });
    expect(flags.canSubmit).toBe(true);
    expect(flags.canApprove).toBe(false);
    expect(flags.canRelease).toBe(false);
  });

  test('participant paused cannot submit (backend false)', () => {
    expect(getCircleLifecyclePhase({ status: 'paused' })).toBe('paused');
    const flags = financialUiFlags(deniedPerms, { handDue: true });
    expect(flags.canSubmit).toBe(false);
  });

  test('organizer active can approve/release when backend allows', () => {
    const flags = financialUiFlags(activePerms, {
      handDue: true,
      readyForPayout: true,
      payoutReleased: false,
    });
    expect(flags.canApprove).toBe(true);
    expect(flags.canReject).toBe(true);
    expect(flags.canRemind).toBe(true);
    expect(flags.canRelease).toBe(true);
  });

  test('organizer paused cannot approve/release', () => {
    expect(getCircleLifecyclePhase({ status: 'paused' })).toBe('paused');
    const flags = financialUiFlags(deniedPerms, {
      readyForPayout: true,
      payoutReleased: false,
    });
    expect(flags.canApprove).toBe(false);
    expect(flags.canRelease).toBe(false);
  });

  test('closed and completed expose no financial actions', () => {
    for (const status of ['closed', 'completed'] as const) {
      expect(isReadOnlyLifecyclePhase(getCircleLifecyclePhase({ status }))).toBe(
        true,
      );
      const flags = financialUiFlags(deniedPerms, {
        handDue: true,
        readyForPayout: true,
      });
      expect(flags.canSubmit).toBe(false);
      expect(flags.canApprove).toBe(false);
      expect(flags.canRelease).toBe(false);
    }
  });

  test('read-only phases remain viewable (phase model)', () => {
    expect(isReadOnlyLifecyclePhase('paused')).toBe(true);
    expect(isReadOnlyLifecyclePhase('closed')).toBe(true);
    expect(isReadOnlyLifecyclePhase('completed')).toBe(true);
    expect(isReadOnlyLifecyclePhase('active')).toBe(false);
    expect(isReadOnlyLifecyclePhase('setup')).toBe(false);
  });

  test('a locally reportable viewer hand cannot override canSubmitOwnContribution=false', () => {
    // Mirrors workspace.tsx: canShowBackendGatedAction(
    //   viewerPermissions?.canSubmitOwnContribution,
    //   memberContributionCard.anyReportable,
    // )
    // anyReportable is AND-restricted, never OR'd with the backend flag.
    // due / missed / rejected all set anyReportable=true; none may promote a deny.
    const anyReportable = true;
    expect(canShowBackendGatedAction(false, anyReportable)).toBe(false);
    expect(canShowBackendGatedAction(undefined, anyReportable)).toBe(false);
    expect(canShowBackendGatedAction(null, anyReportable)).toBe(false);
    expect(canShowBackendGatedAction(true, true)).toBe(true);
    expect(canShowBackendGatedAction(true, false)).toBe(false);
  });
});
