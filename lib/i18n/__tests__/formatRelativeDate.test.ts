import { formatRelativeDate } from '../formatters';

const NOW = new Date('2026-07-24T12:00:00Z');

function dateOffsetDays(days: number): string {
  const ms = NOW.getTime() + days * 86_400_000;
  return new Date(ms).toISOString();
}

describe('formatRelativeDate', () => {
  const intlObject = Intl as typeof Intl & {
    RelativeTimeFormat?: typeof Intl.RelativeTimeFormat;
  };
  const originalRelativeTimeFormat = intlObject.RelativeTimeFormat;

  afterEach(() => {
    if (originalRelativeTimeFormat === undefined) {
      Reflect.deleteProperty(intlObject, 'RelativeTimeFormat');
    } else {
      Object.defineProperty(intlObject, 'RelativeTimeFormat', {
        configurable: true,
        writable: true,
        value: originalRelativeTimeFormat,
      });
    }
  });

  describe('when Intl.RelativeTimeFormat is unavailable', () => {
    beforeEach(() => {
      // Simulate Hermes / React Native without RelativeTimeFormat.
      Object.defineProperty(intlObject, 'RelativeTimeFormat', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      expect(typeof intlObject.RelativeTimeFormat).toBe('undefined');
    });

    test('does not crash when Intl.RelativeTimeFormat is unavailable', () => {
      expect(() =>
        formatRelativeDate(dateOffsetDays(3), 'en', NOW),
      ).not.toThrow();
    });

    test('English fallback', () => {
      expect(formatRelativeDate(dateOffsetDays(0), 'en', NOW)).toBe('today');
      expect(formatRelativeDate(dateOffsetDays(1), 'en', NOW)).toBe('tomorrow');
      expect(formatRelativeDate(dateOffsetDays(-1), 'en', NOW)).toBe(
        'yesterday',
      );
      expect(formatRelativeDate(dateOffsetDays(5), 'en', NOW)).toBe(
        'in 5 days',
      );
      expect(formatRelativeDate(dateOffsetDays(-4), 'en', NOW)).toBe(
        '4 days ago',
      );
    });

    test('Spanish fallback', () => {
      expect(formatRelativeDate(dateOffsetDays(0), 'es', NOW)).toBe('hoy');
      expect(formatRelativeDate(dateOffsetDays(1), 'es', NOW)).toBe('mañana');
      expect(formatRelativeDate(dateOffsetDays(-1), 'es', NOW)).toBe('ayer');
      expect(formatRelativeDate(dateOffsetDays(5), 'es', NOW)).toBe(
        'dentro de 5 días',
      );
      expect(formatRelativeDate(dateOffsetDays(-4), 'es', NOW)).toBe(
        'hace 4 días',
      );
    });

    test('Haitian Creole fallback', () => {
      expect(formatRelativeDate(dateOffsetDays(0), 'ht', NOW)).toBe('jodi a');
      expect(formatRelativeDate(dateOffsetDays(1), 'ht', NOW)).toBe('demen');
      expect(formatRelativeDate(dateOffsetDays(-1), 'ht', NOW)).toBe('yè');
      expect(formatRelativeDate(dateOffsetDays(5), 'ht', NOW)).toBe(
        'nan 5 jou',
      );
      expect(formatRelativeDate(dateOffsetDays(-4), 'ht', NOW)).toBe(
        '4 jou pase',
      );
    });

    test('today', () => {
      expect(formatRelativeDate(dateOffsetDays(0), 'en', NOW)).toBe('today');
    });

    test('tomorrow', () => {
      expect(formatRelativeDate(dateOffsetDays(1), 'en', NOW)).toBe('tomorrow');
    });

    test('yesterday', () => {
      expect(formatRelativeDate(dateOffsetDays(-1), 'en', NOW)).toBe(
        'yesterday',
      );
    });

    test('future days', () => {
      expect(formatRelativeDate(dateOffsetDays(12), 'en', NOW)).toBe(
        'in 12 days',
      );
    });

    test('past days', () => {
      expect(formatRelativeDate(dateOffsetDays(-9), 'en', NOW)).toBe(
        '9 days ago',
      );
    });
  });

  describe('when Intl.RelativeTimeFormat is available', () => {
    test('existing RelativeTimeFormat behavior still works when available', () => {
      if (typeof intlObject.RelativeTimeFormat !== 'function') {
        // Environment without RTF: skip native-path assertion.
        return;
      }
      expect(
        formatRelativeDate(
          '2026-07-25T12:00:00Z',
          'en',
          new Date('2026-07-24T12:00:00Z'),
        ),
      ).toBe('tomorrow');
    });
  });

  test('invalid date remains safe', () => {
    expect(formatRelativeDate('not-a-date', 'en', NOW)).toBe('not-a-date');
    expect(() => formatRelativeDate('not-a-date', 'en', NOW)).not.toThrow();
  });

  test('empty string remains safe', () => {
    expect(formatRelativeDate('', 'en', NOW)).toBe('');
    expect(() => formatRelativeDate('', 'en', NOW)).not.toThrow();
  });
});
