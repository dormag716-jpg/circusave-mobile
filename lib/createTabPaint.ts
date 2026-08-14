/**
 * Create tab first paint. Marketing copy must not wait on /groups.
 * Plan-cap UI may appear only after a circles snapshot exists.
 */

export function shouldBlockCreateTabLanding(): false {
  return false;
}

export function shouldShowCreateTabLimitCard(input: {
  hasSnapshot: boolean;
  atCapacity: boolean;
}): boolean {
  return input.hasSnapshot === true && input.atCapacity === true;
}
