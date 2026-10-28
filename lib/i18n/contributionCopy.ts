import type { TFunction, TOptions } from 'i18next';

const WORKSPACE_CARD_KEYS = [
  'workspace.myContribution',
  'workspace.myContributions',
  'workspace.amountDue',
  'workspace.totalDue',
  'workspace.roundLabel',
  'workspace.handLabel',
  'workspace.payoutTurn',
  'workspace.markAsSent',
  'workspace.payInCircusave',
  'workspace.payOutsideTitle',
  'workspace.sendUsingInstructions',
  'workspace.circuSaveDoesNotSend',
  'workspace.organizerVerifiesAfterReport',
  'workspace.markAsSentEducation',
  'workspace.instructionsMissingTitle',
  'workspace.instructionsMissingBody',
] as const;

export type ContributionCopyKey = (typeof WORKSPACE_CARD_KEYS)[number] | string;

export function contributionCopy(
  t: TFunction,
  key: ContributionCopyKey,
  options?: TOptions & Record<string, unknown>,
): string {
  const value = t(key, { ns: 'contributions', ...options });
  return typeof value === 'string' ? value : String(key);
}

export function contributionCopyLooksUnresolved(value: string, key: string): boolean {
  const normalized = String(value || '').trim();
  return (
    normalized.length === 0 ||
    normalized === key ||
    normalized === `contributions:${key}` ||
    normalized.startsWith('workspace.')
  );
}

export function unresolvedContributionCopyKeys(
  t: TFunction,
  keys: readonly string[] = WORKSPACE_CARD_KEYS,
): string[] {
  return keys.filter((key) =>
    contributionCopyLooksUnresolved(contributionCopy(t, key, { amount: '$1', number: 1, round: 1, position: '1st' }), key),
  );
}
