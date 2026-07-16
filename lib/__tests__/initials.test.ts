import { getInitials } from '../initials';

describe('getInitials', () => {
  it('returns JD for John Doe', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns NP for Naomi Price', () => {
    expect(getInitials('Naomi Price')).toBe('NP');
  });

  it('returns G for Gregory', () => {
    expect(getInitials('Gregory')).toBe('G');
  });

  it('returns MS for padded Mary Jane Smith', () => {
    expect(getInitials('  Mary   Jane Smith  ')).toBe('MS');
  });

  it('returns ? for empty string', () => {
    expect(getInitials('')).toBe('?');
  });

  it('returns ? for undefined', () => {
    expect(getInitials(undefined)).toBe('?');
  });

  it('returns ? for null', () => {
    expect(getInitials(null as any)).toBe('?');
  });
});
