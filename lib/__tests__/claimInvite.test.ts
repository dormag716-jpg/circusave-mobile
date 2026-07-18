import {
  buildClaimInviteShareMessage,
  buildClaimInviteUrl,
  buildGenericCircleInviteShareMessage,
} from '../claimInvite';

describe('claimInvite', () => {
  test('builds claim URL with encoded token', () => {
    const url = buildClaimInviteUrl('c1', 'tok/abc+1', 'https://circusave.com');
    expect(url).toBe('https://circusave.com/invite/c1?claimToken=tok%2Fabc%2B1');
  });

  test('share message includes hand and circle', () => {
    const message = buildClaimInviteShareMessage({
      circleName: 'Family Susu',
      handName: 'Amina · Hand 1',
      claimUrl: 'https://circusave.com/invite/c1?claimToken=x',
    });
    expect(message).toMatch(/Amina/);
    expect(message).toMatch(/Family Susu/);
    expect(message).toMatch(/claimToken=x/);
  });

  test('generic invite includes code when present', () => {
    const message = buildGenericCircleInviteShareMessage({
      circleName: 'Family Susu',
      circleId: 'c1',
      circleCode: 'CSX-ABC',
      baseUrl: 'https://circusave.com',
    });
    expect(message).toMatch(/CSX-ABC/);
    expect(message).toMatch(/invite\/c1/);
  });
});
