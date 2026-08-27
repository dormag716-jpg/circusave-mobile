import { formatCurrency } from '../formatters';

describe('formatCurrency boundaries', () => {
  test.each(['en', 'es', 'ht'] as const)(
    'formats zero, large values, and decimals in %s without mutating cents',
    (language) => {
      const zero = formatCurrency(0, language, 'USD', 2);
      expect(zero).toMatch(/0[,.]00/);
      expect(zero).not.toMatch(/NaN|undefined/);

      const large = formatCurrency(1_000_000, language, 'USD', 0);
      expect(large).toMatch(/1[,.\s]000[,.\s]000|1000000/);
      expect(large).toMatch(/\$|USD|US\$/);

      const cents = formatCurrency(12.34, language, 'USD', 2);
      expect(cents).toMatch(/12[,.]34/);

      const half = formatCurrency(0.5, language, 'USD', 2);
      expect(half).toMatch(/0[,.]50/);

      expect(formatCurrency(Number.NaN, language, 'USD', 2)).toMatch(/0[,.]00/);
      expect(formatCurrency(Number.POSITIVE_INFINITY, language, 'USD', 0)).toMatch(
        /0/,
      );
    },
  );

  test('preserves USD as the currency code regardless of locale', () => {
    expect(formatCurrency(50, 'en', 'USD', 0)).toMatch(/\$|USD/);
    expect(formatCurrency(50, 'es', 'USD', 0)).toMatch(/\$|USD|US\$/);
    expect(formatCurrency(50, 'ht', 'USD', 0)).toMatch(/\$|USD|US\$/);
  });
});
