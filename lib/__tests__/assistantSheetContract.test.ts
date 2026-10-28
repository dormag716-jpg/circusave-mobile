import { readFileSync } from 'fs';
import path from 'path';

const read = (...parts: string[]) =>
  readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8');

describe('assistant bottom sheet contract', () => {
  const sheet = read('components', 'AssistantSheet.tsx');
  const provider = read('components', 'AssistantSheetContext.tsx');
  const panel = read('components', 'CircleAssistantPanel.tsx');

  it('closes on Android Back instead of navigating underneath', () => {
    expect(sheet).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
  });

  it('sizes from the live window, not a height captured at module load', () => {
    expect(sheet).toMatch(/useWindowDimensions\(\)/);
    expect(sheet).not.toMatch(/Dimensions\.get\('window'\)/);
  });

  it('expands above the keyboard so the conversation keeps room', () => {
    expect(sheet).toMatch(/keyboardDidShow/);
    expect(sheet).toMatch(/keyboardOpen \? expandedH : baseH/);
  });

  it('unmounts the sheet and its chat when the device locks or the user signs out', () => {
    expect(provider).toMatch(/isLocked \|\| status !== 'authenticated'/);
    expect(provider).toMatch(/setCircleId\(null\)/);
    expect(provider).toMatch(/<AssistantSheet key=\{epoch\}/);
    expect(provider).toMatch(/mustBeClosed/);
  });

  it('keeps the money-move limit pinned in the sheet and the header reachable', () => {
    expect(panel).toMatch(/presentation === 'sheet'[\s\S]*pinnedNote/);
    expect(panel).toMatch(/keyboardVisible && presentation !== 'sheet'/);
    expect(panel).toMatch(/headerCopy/);
  });
});
