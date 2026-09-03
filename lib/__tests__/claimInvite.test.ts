import peopleEn from '../i18n/locales/en/people.json';
import peopleEs from '../i18n/locales/es/people.json';
import peopleHt from '../i18n/locales/ht/people.json';
import {
  buildClaimInviteShareMessage,
  buildClaimInviteUrl,
  buildGenericCircleInviteShareMessage,
  getWebAppBaseUrl,
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

  test('localized formatters preserve circle, hand, code, and claim identifiers', () => {
    const claimUrl = buildClaimInviteUrl(
      'circle-id',
      'claim-token',
      'https://circusave.com',
    );
    const claimMessage = buildClaimInviteShareMessage({
      circleName: 'Familia',
      handName: 'Ana · Mano 2',
      claimUrl,
      formatMessage: ({ circleName, handName, claimUrl: url }) =>
        `${circleName}|${handName}|${url}`,
    });
    const genericMessage = buildGenericCircleInviteShareMessage({
      circleName: 'Familia',
      circleId: 'circle-id',
      circleCode: 'CSX-ABC',
      baseUrl: 'https://circusave.com',
      formatMessage: ({ circleName, circleCode, inviteUrl }) =>
        `${circleName}|${circleCode}|${inviteUrl}`,
    });

    expect(claimMessage).toContain('circle-id');
    expect(claimMessage).toContain('claim-token');
    expect(genericMessage).toContain('CSX-ABC');
    expect(genericMessage).toContain('circle-id');
  });

  test('people invite share messages use the canonical circusave.com host', () => {
    const shareMessages = [
      peopleEn.invite.shareMessage,
      peopleEs.invite.shareMessage,
      peopleHt.invite.shareMessage,
    ];
    for (const message of shareMessages) {
      expect(message).toContain('https://circusave.com/invite/{{code}}');
      expect(message).not.toContain('app.circusave.com');
    }

    expect(getWebAppBaseUrl()).toBe('https://circusave.com');
    expect(buildClaimInviteUrl('c1', 'tok')).toBe(
      'https://circusave.com/invite/c1?claimToken=tok',
    );
    const generic = buildGenericCircleInviteShareMessage({
      circleName: 'Family Susu',
      circleId: 'c1',
      circleCode: 'CSX-ABC',
    });
    expect(generic).toContain('https://circusave.com/invite/c1');
    expect(generic).not.toContain('app.circusave.com');
    const claim = buildClaimInviteShareMessage({
      circleName: 'Family Susu',
      handName: 'Amina · Hand 1',
      claimUrl: buildClaimInviteUrl('c1', 'x'),
    });
    expect(claim).toContain('https://circusave.com/invite/c1?claimToken=x');
    expect(claim).not.toContain('app.circusave.com');
  });
});
