import { readFileSync } from 'fs';
import path from 'path';

import {
  composePaymentInstructions,
  destinationsForPaymentSetupEditor,
  MAX_PAYMENT_DESTINATIONS,
  normalizePaymentDestinations,
  presentCirclePaymentInstructions,
} from '../paymentDestinations';

describe('normalizePaymentDestinations', () => {
  test('keeps method, destination, and optional memo', () => {
    expect(
      normalizePaymentDestinations([
        { method: 'zelle', destination: ' organizer@email.com ', memo: ' Include your name ' },
        { method: 'cashapp', destination: '$greg' },
      ]),
    ).toEqual([
      { method: 'zelle', destination: 'organizer@email.com', memo: 'Include your name' },
      { method: 'cashapp', destination: '$greg' },
    ]);
  });

  test('allows cash without a destination and drops rails that have none', () => {
    expect(
      normalizePaymentDestinations([
        { method: 'cash', destination: '  ' },
        { method: 'venmo', destination: '' },
        { method: 'stripe', destination: 'card' },
      ]),
    ).toEqual([{ method: 'cash', destination: '' }]);
  });

  test('caps the destination list and ignores non-arrays', () => {
    const many = Array.from({ length: MAX_PAYMENT_DESTINATIONS + 3 }, (_, index) => ({
      method: 'other',
      destination: `dest-${index}`,
    }));
    expect(normalizePaymentDestinations(many)).toHaveLength(MAX_PAYMENT_DESTINATIONS);
    expect(normalizePaymentDestinations(null)).toEqual([]);
    expect(normalizePaymentDestinations('Zelle: x')).toEqual([]);
  });
});

describe('composePaymentInstructions', () => {
  test('composes a backward-compatible free-text fallback', () => {
    expect(
      composePaymentInstructions([
        { method: 'zelle', destination: 'organizer@email.com', memo: 'Include your name' },
        { method: 'cashapp', destination: '$greg' },
      ]),
    ).toBe('Zelle: organizer@email.com\nInclude your name\nCash App: $greg');
  });

  test('stays within 280 characters', () => {
    const long = composePaymentInstructions([
      { method: 'other', destination: 'x'.repeat(120), memo: 'm'.repeat(80) },
      { method: 'other', destination: 'y'.repeat(120), memo: 'n'.repeat(80) },
      { method: 'other', destination: 'z'.repeat(120), memo: 'o'.repeat(80) },
    ]);
    expect(long.length).toBeLessThanOrEqual(280);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('presentCirclePaymentInstructions', () => {
  test('prefers structured destinations over legacy free text', () => {
    const presented = presentCirclePaymentInstructions({
      paymentInstructions: 'Legacy free text',
      paymentDestinations: [{ method: 'venmo', destination: '@circle' }],
    });
    expect(presented.hasInstructions).toBe(true);
    expect(presented.destinations).toEqual([
      { method: 'venmo', destination: '@circle' },
    ]);
    expect(presented.instructions).toBe('Venmo: @circle');
  });

  test('legacy free text stays unparsed when destinations are missing', () => {
    const presented = presentCirclePaymentInstructions({
      paymentInstructions: 'Zelle: organizer@email.com',
    });
    expect(presented.destinations).toEqual([]);
    expect(presented.instructions).toBe('Zelle: organizer@email.com');
    expect(presented.hasInstructions).toBe(true);
  });

  test('empty destinations and blank text are missing instructions', () => {
    expect(
      presentCirclePaymentInstructions({
        paymentInstructions: '   ',
        paymentDestinations: [],
      }).hasInstructions,
    ).toBe(false);
  });
});

describe('destinationsForPaymentSetupEditor', () => {
  test('loads structured destinations as-is', () => {
    expect(
      destinationsForPaymentSetupEditor({
        paymentDestinations: [{ method: 'paypal', destination: 'pay@example.com' }],
      }),
    ).toEqual([{ method: 'paypal', destination: 'pay@example.com' }]);
  });

  test('Payment Setup saves structured destinations and does not parse Zelle chips', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'circle', 'payment-setup.tsx'),
      'utf8',
    );
    expect(source).toContain('destinations: drafts');
    expect(source).toContain('PAYMENT_DESTINATION_METHODS');
    expect(source).toContain('destinationsForPaymentSetupEditor');
    expect(source).not.toContain('Zelle: organizer@email.com');
    expect(source).not.toContain('const EXAMPLES');
  });

  test('maps legacy free text to one Other destination without parsing Zelle', () => {
    expect(
      destinationsForPaymentSetupEditor({
        paymentInstructions: 'Zelle: organizer@email.com\nInclude your name',
      }),
    ).toEqual([
      {
        method: 'other',
        destination: 'Zelle: organizer@email.com\nInclude your name',
      },
    ]);
  });
});
