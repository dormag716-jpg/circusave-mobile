import { CREATE_CIRCLE_STEPS, createCircleStepTitles, estimateLabel } from '../createCircleFlow';

describe('createCircleFlow', () => {
  test('uses six focused steps without duplicate sections', () => {
    expect(CREATE_CIRCLE_STEPS.map((step) => step.id)).toEqual([
      'basics',
      'contribution',
      'organizer',
      'members',
      'schedule_preview',
      'review',
    ]);
    expect(new Set(createCircleStepTitles()).size).toBe(6);
  });

  test('labels draft calculations as estimates', () => {
    expect(estimateLabel('rounds')).toBe('Estimated rounds');
    expect(estimateLabel('pot / round')).toBe('Estimated pot / round');
  });
});
