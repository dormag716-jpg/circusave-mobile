/**
 * Invite screen first paint. Chrome must not wait on the public preview GET.
 */

export function shouldBlockInviteLanding(): false {
  return false;
}

export function shouldShowInvitePreviewSkeleton(input: {
  loading: boolean;
  hasPreview: boolean;
}): boolean {
  return input.loading === true && input.hasPreview !== true;
}

export function shouldShowInviteUnavailable(input: {
  loading: boolean;
  hasPreview: boolean;
  error: string | null;
}): boolean {
  return (
    input.loading !== true &&
    input.hasPreview !== true &&
    Boolean(input.error)
  );
}
