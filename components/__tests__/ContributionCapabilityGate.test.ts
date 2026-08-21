import React from 'react';

import { ContributionCapabilityGate } from '../ContributionCapabilityGate';

const TestRenderer: any = require('react-test-renderer');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

test('workspace capability gate hides only Stripe contribution entry', () => {
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
          React.createElement('StripeContributionAction'),
        ),
        React.createElement('OrganizerConfirmationAction'),
      ),
    );
  });

  expect(renderer.root.findAllByType('StripeContributionAction')).toHaveLength(0);
  expect(renderer.root.findAllByType('ManualMarkAsSent')).toHaveLength(1);
  expect(renderer.root.findAllByType('OrganizerConfirmationAction')).toHaveLength(
    1,
  );
  TestRenderer.act(() => renderer.unmount());
});

test('workspace capability gate restores the preserved Stripe entry when enabled', () => {
  let renderer: any;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(
        ContributionCapabilityGate,
        { enabled: true },
        React.createElement('StripeContributionAction'),
      ),
    );
  });

  expect(renderer.root.findAllByType('StripeContributionAction')).toHaveLength(1);
  TestRenderer.act(() => renderer.unmount());
});
