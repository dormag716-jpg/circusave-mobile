import { readFileSync } from 'fs';
import path from 'path';

import {
  shouldFetchWorkspaceAgreementSnapshot,
  workspaceAgreementLoadOwner,
} from '../workspaceAgreementLoad';

describe('workspace agreement snapshot load', () => {
  it('fetches only for a participating member of a setup circle', () => {
    expect(
      shouldFetchWorkspaceAgreementSnapshot({
        token: 'tok',
        circleNotStarted: true,
        isParticipating: true,
      }),
    ).toBe(true);
    expect(
      shouldFetchWorkspaceAgreementSnapshot({
        token: 'tok',
        circleNotStarted: false,
        isParticipating: true,
      }),
    ).toBe(false);
    expect(
      shouldFetchWorkspaceAgreementSnapshot({
        token: 'tok',
        circleNotStarted: true,
        isParticipating: false,
      }),
    ).toBe(false);
    expect(
      shouldFetchWorkspaceAgreementSnapshot({
        token: '',
        circleNotStarted: true,
        isParticipating: true,
      }),
    ).toBe(false);
  });

  it('declares a single workspace owner', () => {
    expect(workspaceAgreementLoadOwner()).toBe('workspace');
  });

  it('People tab does not call getCircleAgreementSnapshot', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
      'utf8',
    );
    const peopleStart = source.indexOf('function PeopleTab(');
    expect(peopleStart).toBeGreaterThan(0);
    const peopleBody = source.slice(peopleStart);
    expect(peopleBody).not.toMatch(/getCircleAgreementSnapshot\(/);
    expect(source).toMatch(/shouldFetchWorkspaceAgreementSnapshot/);
    expect(
      source.split('getCircleAgreementSnapshot(').length - 1,
    ).toBe(1);
  });
});
