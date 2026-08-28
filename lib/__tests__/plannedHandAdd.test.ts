import { readFileSync } from 'fs';
import path from 'path';

import {
  validatePlannedHandAdd,
  type PlannedHandAddPayload,
} from '../plannedHandAdd';

const root = path.join(__dirname, '..', '..');

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

describe('planned hand add form', () => {
  test('revised people-card and destination labels are in English copy', () => {
    const people = JSON.parse(source('lib/i18n/locales/en/people.json')) as {
      invite: { title: string; collapsedHint: string; inviteMembers: string };
    };
    const invite = JSON.parse(source('lib/i18n/locales/en/invite.json')) as {
      organizer: {
        kicker: string;
        circleInviteTitle: string;
        claimSectionTitle: string;
        addPlannedTitle: string;
      };
    };
    expect(people.invite.title).toBe('Invite or add members');
    expect(people.invite.collapsedHint).toBe(
      'Share an invite, or manually add a planned hand for someone.',
    );
    expect(people.invite.inviteMembers).toBe('Invite or add members');
    expect(invite.organizer.kicker).toBe('Invite or add');
    expect(invite.organizer.circleInviteTitle).toBe('Invite to the circle');
    expect(invite.organizer.claimSectionTitle).toBe('Invite to claim a hand');
    expect(invite.organizer.addPlannedTitle).toBe('Manually add a planned hand');
  });

  test('invite destination keeps the circle code with copy and share actions', () => {
    const screen = source('app/circle/invite.tsx');
    expect(screen).toContain('circle.circleCode');
    expect(screen).toContain("t('people:invite.copy')");
    expect(screen).toContain("t('people:invite.share')");
    expect(screen).toContain('handleCopyCircleCode');
    expect(screen).toContain('handleShareGenericLink');
    expect(screen).not.toMatch(/trimmedContact\.includes\('@'\)/);
  });

  test('phone only submits phone and an empty email', () => {
    const result = validatePlannedHandAdd({
      fullName: 'Ada Claim',
      phone: '555-880-0002',
      email: '',
    });
    expect(result.ok).toBe(true);
    const payload = result.payload as PlannedHandAddPayload;
    expect(payload.phone).toBe('555-880-0002');
    expect(payload.email).toBe('');
    expect(Object.prototype.hasOwnProperty.call(payload, 'phone')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(payload, 'email')).toBe(true);
  });

  test('email only submits email and an empty phone', () => {
    const result = validatePlannedHandAdd({
      fullName: 'Ada Claim',
      phone: '',
      email: 'ada@example.com',
    });
    expect(result.ok).toBe(true);
    const payload = result.payload as PlannedHandAddPayload;
    expect(payload.phone).toBe('');
    expect(payload.email).toBe('ada@example.com');
  });

  test('both phone and email remain separate submitted properties', () => {
    const result = validatePlannedHandAdd({
      fullName: 'Ada Claim',
      phone: '(555) 880-0002',
      email: 'ada@example.com',
    });
    expect(result.ok).toBe(true);
    const payload = result.payload as PlannedHandAddPayload;
    expect(payload.phone).toBe('(555) 880-0002');
    expect(payload.email).toBe('ada@example.com');
    expect(payload.phone).not.toContain('@');
    expect(payload.email).not.toMatch(/\d{7,}/);
  });

  test('neither contact method is rejected', () => {
    const result = validatePlannedHandAdd({
      fullName: 'Ada Claim',
      phone: '',
      email: '',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.contact).toBe('contactRequired');
    expect(result.payload).toBeNull();
  });

  test('invalid phone is rejected independently of email', () => {
    const result = validatePlannedHandAdd({
      fullName: 'Ada Claim',
      phone: '12',
      email: 'ada@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.phone).toBe('invalidPhone');
    expect(result.errors.email).toBeUndefined();
  });

  test('invalid email is rejected independently of phone', () => {
    const result = validatePlannedHandAdd({
      fullName: 'Ada Claim',
      phone: '5558800002',
      email: 'not-an-email',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBe('invalidEmail');
    expect(result.errors.phone).toBeUndefined();
  });

  test('full name is required before contact checks', () => {
    const result = validatePlannedHandAdd({
      fullName: '  ',
      phone: '5558800002',
      email: 'ada@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.fullName).toBe('fullName');
  });

  test('invite screen never implies automatic membership for manual add', () => {
    const inviteEn = JSON.parse(source('lib/i18n/locales/en/invite.json')) as {
      organizer: { addPlannedSubtitle: string; plannedAddedMessage: string };
    };
    expect(inviteEn.organizer.addPlannedSubtitle.toLowerCase()).toContain(
      'planned hand',
    );
    expect(inviteEn.organizer.addPlannedSubtitle.toLowerCase()).toContain('claim');
    expect(inviteEn.organizer.addPlannedSubtitle.toLowerCase()).not.toMatch(
      /becomes a member automatically|already a member/,
    );
    expect(inviteEn.organizer.plannedAddedMessage.toLowerCase()).toContain(
      'claim',
    );
  });
});
