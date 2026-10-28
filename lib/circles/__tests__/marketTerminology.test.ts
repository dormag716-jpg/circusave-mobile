import { marketTerminologyKey } from '../marketTerminology';

describe('market terminology labels', () => {
  test('known markets use a settings label key', () => {
    expect(marketTerminologyKey('default')).toBe('markets.default');
    expect(marketTerminologyKey('DEFAULT')).toBe('markets.default');
    expect(marketTerminologyKey('SUSU')).toBe('markets.susu');
    expect(marketTerminologyKey(' pardner ')).toBe('markets.pardner');
  });

  test('an unknown market falls back to the standard label', () => {
    expect(marketTerminologyKey('')).toBe('markets.default');
    expect(marketTerminologyKey('not-a-market')).toBe('markets.default');
  });
});
