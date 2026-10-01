/**
 * Join-by-code preview paint. A new lookup must not unmount last-known preview.
 */

export function shouldClearJoinPreviewDuringLookup(): false {
  return false;
}

export function shouldKeepJoinPreviewDuringLookup(hasPreview: boolean): boolean {
  return hasPreview === true;
}
