/**
 * "Who reported this payment and who confirmed it" sentence for statement history.
 *
 * Older confirmations may have no stored reporter or report time. The sentence then falls back
 * to a variant that names only what is known, so it never reads "Unknown reporter on —".
 */
import type { TFunction } from 'i18next';

import type { StatementActor } from '@/lib/api';
import { formatDisplayDateTime } from '@/lib/shared/statementPresentation';

export type ExternalProvenance = {
  paymentOrigin?: string | null;
  verificationStatus?: string | null;
  reportedBy?: StatementActor | null;
  reportedAt?: string | null;
  confirmedBy?: StatementActor | null;
  confirmedAt?: string | null;
  rejectedBy?: StatementActor | null;
  rejectedAt?: string | null;
};

function known(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function knownDate(value: string | null | undefined): string | null {
  const text = known(value);
  if (!text) return null;
  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

export function externalContributionProvenanceText(
  item: ExternalProvenance,
  t: TFunction,
  language?: string,
): string | null {
  if (item.paymentOrigin !== 'external') return null;

  const reporter = known(item.reportedBy?.displayName);
  const reportedAt = knownDate(item.reportedAt);
  const organizer =
    known(item.confirmedBy?.displayName) ||
    known(item.rejectedBy?.displayName) ||
    t('ledger:provenance.organizer');

  if (item.verificationStatus === 'pending_organizer_confirmation') {
    return reporter && reportedAt
      ? t('ledger:provenance.pending', {
          member: reporter,
          date: formatDisplayDateTime(reportedAt, language),
        })
      : t('ledger:provenance.pendingNoReporter');
  }

  if (item.verificationStatus === 'organizer_confirmed') {
    const confirmedAt = knownDate(item.confirmedAt);
    if (reporter && reportedAt && confirmedAt) {
      return t('ledger:provenance.confirmed', {
        member: reporter,
        reportedAt: formatDisplayDateTime(reportedAt, language),
        organizer,
        confirmedAt: formatDisplayDateTime(confirmedAt, language),
      });
    }
    return confirmedAt
      ? t('ledger:provenance.activityConfirmed', {
          organizer,
          date: formatDisplayDateTime(confirmedAt, language),
        })
      : t('ledger:provenance.confirmedNoDate', { organizer });
  }

  if (item.verificationStatus === 'organizer_rejected') {
    const rejectedAt = knownDate(item.rejectedAt);
    return rejectedAt
      ? t('ledger:provenance.rejected', {
          organizer,
          rejectedAt: formatDisplayDateTime(rejectedAt, language),
        })
      : t('ledger:provenance.rejectedNoDate', { organizer });
  }

  return null;
}
