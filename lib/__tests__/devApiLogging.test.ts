import { redactDevApiLogBody } from '../api';

describe('development API logging', () => {
  it('never emits raw response strings', () => {
    const html = '<html>sk_live_should_not_leak_aaaaaaaaaa</html>';
    expect(redactDevApiLogBody(html)).toBe('[redacted]');
    expect(redactDevApiLogBody(html)).not.toContain('sk_live');
  });

  it('redacts sensitive keys and secret-shaped nested strings', () => {
    const secret = `sk_test_${'r'.repeat(20)}`;
    const body = {
      status: 'ok',
      email: 'member@example.com',
      client_secret: 'cs_test_secret',
      note: `failed ${secret}`,
      nested: { token: 'tok_abc', count: 2 },
    };

    expect(redactDevApiLogBody(body)).toEqual({
      status: 'ok',
      email: '[redacted]',
      client_secret: '[redacted]',
      note: '[redacted]',
      nested: { token: '[redacted]', count: 2 },
    });
  });

  it('redacts strings inside arrays', () => {
    expect(redactDevApiLogBody([`whsec_${'s'.repeat(20)}`, 1])).toEqual([
      '[redacted]',
      1,
    ]);
  });
});
