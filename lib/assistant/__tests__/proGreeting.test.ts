import {
  dismissProGreeting,
  initialProGreetingState,
  proGreetingAssistantTarget,
  proGreetingVisible,
  settleProGreeting,
  type ProGreetingInput,
  type ProGreetingState,
} from '../proGreeting';

const proUnlocked: ProGreetingInput = {
  userId: 'user-1',
  authenticated: true,
  locked: false,
  lockReady: true,
  pro: true,
  entitlementsReady: true,
};

function settle(state: ProGreetingState, input: ProGreetingInput) {
  return settleProGreeting(state, input);
}

describe('signed-in assistant greeting', () => {
  it('greets once on the first unlocked authenticated entry', () => {
    const armed = settle(initialProGreetingState, proUnlocked);
    expect(proGreetingVisible(armed, proUnlocked)).toBe(true);
    const again = settle(armed, proUnlocked);
    expect(again.epoch).toBe(armed.epoch);
    expect(proGreetingVisible(again, proUnlocked)).toBe(true);
  });

  it('does not greet again after dismiss until the next unlock', () => {
    const armed = settle(initialProGreetingState, proUnlocked);
    const dismissed = dismissProGreeting(armed);
    expect(proGreetingVisible(dismissed, proUnlocked)).toBe(false);
    const stillThere = settle(dismissed, proUnlocked);
    expect(proGreetingVisible(stillThere, proUnlocked)).toBe(false);

    const locked = settle(stillThere, { ...proUnlocked, locked: true });
    expect(proGreetingVisible(locked, { ...proUnlocked, locked: true })).toBe(false);
    const unlocked = settle(locked, proUnlocked);
    expect(unlocked.epoch).toBe(stillThere.epoch + 1);
    expect(proGreetingVisible(unlocked, proUnlocked)).toBe(true);
  });

  it('greets a signed-in user and keeps a dismissal after Organizer Pro', () => {
    const freeInput = { ...proUnlocked, pro: false };
    const free = settle(initialProGreetingState, freeInput);
    expect(proGreetingVisible(free, freeInput)).toBe(true);
    const upgraded = settle(free, proUnlocked);
    expect(upgraded.epoch).toBe(free.epoch);
    expect(proGreetingVisible(upgraded, proUnlocked)).toBe(true);

    const dismissed = dismissProGreeting(free);
    const stillDismissed = settle(dismissed, proUnlocked);
    expect(proGreetingVisible(stillDismissed, proUnlocked)).toBe(false);
  });

  it('resets on sign-out and does not reuse another account', () => {
    const armed = settle(initialProGreetingState, proUnlocked);
    const signedOut = settle(armed, {
      ...proUnlocked,
      authenticated: false,
      userId: null,
    });
    expect(signedOut).toEqual(initialProGreetingState);

    const other = settle(armed, { ...proUnlocked, userId: 'user-2' });
    expect(other.userId).toBe('user-2');
    expect(other.epoch).toBe(1);
    expect(proGreetingVisible(other, { ...proUnlocked, userId: 'user-2' })).toBe(
      true,
    );
  });

  it('waits for entitlements and the lock before showing', () => {
    const waiting = settle(initialProGreetingState, {
      ...proUnlocked,
      entitlementsReady: false,
    });
    expect(
      proGreetingVisible(waiting, { ...proUnlocked, entitlementsReady: false }),
    ).toBe(false);
    const ready = settle(waiting, proUnlocked);
    expect(ready.epoch).toBe(waiting.epoch);
    expect(proGreetingVisible(ready, proUnlocked)).toBe(true);

    const initializing = settle(initialProGreetingState, {
      ...proUnlocked,
      lockReady: false,
      locked: true,
    });
    expect(initializing.epoch).toBe(0);
  });

  it('opens the assistant for one circle and the circle list otherwise', () => {
    expect(proGreetingAssistantTarget([' circle-1 '])).toEqual({
      kind: 'assistant',
      href: '/circle/assistant?circleId=circle-1',
    });
    expect(proGreetingAssistantTarget(['a', 'b']).kind).toBe('circles');
    expect(proGreetingAssistantTarget([]).kind).toBe('circles');
  });
});
