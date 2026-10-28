export const CREATE_CIRCLE_STEPS = [
  { id: 'basics', title: 'Circle Basics' },
  { id: 'contribution', title: 'Contribution Setup' },
  { id: 'organizer', title: 'Organizer Participation' },
  { id: 'members', title: 'Planned Members' },
  { id: 'schedule_preview', title: 'Schedule' },
  { id: 'review', title: 'Review and Create' },
] as const;

export function createCircleStepTitles(): readonly string[] {
  return CREATE_CIRCLE_STEPS.map((step) => step.title);
}

export function estimateLabel(label: string): string {
  return `Estimated ${label}`;
}
