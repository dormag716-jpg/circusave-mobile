/**
 * Workspace agreement snapshot is owned by WorkspaceContent.
 * People must reuse that result — do not start a second GET.
 */

export function shouldFetchWorkspaceAgreementSnapshot(input: {
  token?: string | null;
  circleNotStarted: boolean;
  isParticipating: boolean;
}): boolean {
  return (
    Boolean(String(input.token ?? '').trim()) &&
    input.circleNotStarted === true &&
    input.isParticipating === true
  );
}

export function workspaceAgreementLoadOwner(): 'workspace' {
  return 'workspace';
}
