export type MarketType = 'default' | 'susu' | 'tanda' | 'sol' | 'hagbad' | 'pardner';

export const MARKET_TYPES: readonly MarketType[] = [
  'default',
  'susu',
  'tanda',
  'sol',
  'hagbad',
  'pardner',
];

/** i18n key under the settings namespace. Never the raw market id. */
export function marketTerminologyKey(market: string): `markets.${MarketType}` {
  const normalized = String(market || '').trim().toLowerCase();
  if ((MARKET_TYPES as readonly string[]).includes(normalized)) {
    return `markets.${normalized as MarketType}`;
  }
  return 'markets.default';
}
