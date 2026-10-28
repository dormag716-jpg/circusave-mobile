import React from 'react';

import { ContributionCapabilityGate } from '../ContributionCapabilityGate';

const TestRenderer: any = require('react-test-renderer');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

test('workspace capability gate hides gated children and keeps manual recording', () => {
  let renderer: any;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        'WorkspaceActions',
        null,
        React.createElement('ManualMarkAsSent'),
        React.createElement(
          ContributionCapabilityGate,
          { enabled: false },
          React.createElement('InAppContributionAction'),
        ),
        React.createElement('OrganizerConfirmationAction'),
      ),
    );
  });

  expect(renderer.root.findAllByType('InAppContributionAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualMarkAsSent')).toHaveLength(1);
  expect(renderer.root.findAllByType('OrganizerConfirmationAction')).toHaveLength(
    1,
  );
  TestRenderer.act(() => renderer.unmount());
});

test('workspace capability gate does not restore in-app contribution payment when enabled', () => {
  const workspace = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'app', 'circle', 'workspace.tsx'),
    'utf8',
  );
  expect(workspace).not.toContain('ContributionCapabilityGate');
  expect(workspace).not.toContain('onPayInApp');
  expect(workspace).not.toContain("contributionCopy(t, 'workspace.payInCircusave')");
});
