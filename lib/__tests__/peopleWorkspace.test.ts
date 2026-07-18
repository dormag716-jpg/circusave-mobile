import {
  groupCurrentApiHandsForDisplay,
  initialsForDisplay,
  validateCurrentPayoutOrder,
} from '../peopleWorkspace';

describe('peopleWorkspace compatibility selectors', () => {
  test('groups multiple connected hands without duplicating the displayed member', () => {
    const groups = groupCurrentApiHandsForDisplay([
      { id: 'hand-1', userId: 'user-1' },
      { id: 'hand-2', userId: 'user-1' },
      { id: 'hand-3', userId: 'user-2' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].hands.map((hand) => hand.id)).toEqual(['hand-1', 'hand-2']);
  });

  test('keeps unclaimed API rows separate instead of guessing membership relationships', () => {
    const groups = groupCurrentApiHandsForDisplay([
      { id: 'planned-1', userId: null },
      { id: 'planned-2', userId: null },
    ]);
    expect(groups).toHaveLength(2);
  });

  test('reports missing, duplicate, and unknown payout-order entries', () => {
    const result = validateCurrentPayoutOrder(
      [{ id: 'hand-1' }, { id: 'hand-2' }],
      ['hand-1', 'hand-1', 'unknown'],
    );
    expect(result).toEqual({
      valid: false,
      missingHandIds: ['hand-2'],
      duplicateHandIds: ['hand-1'],
      unknownHandIds: ['unknown'],
    });
  });

  test('creates compact initials without profile imagery', () => {
    expect(initialsForDisplay('Naomi Price')).toBe('NP');
    expect(initialsForDisplay('Gregory')).toBe('GR');
    expect(initialsForDisplay('')).toBe('?');
  });
});
