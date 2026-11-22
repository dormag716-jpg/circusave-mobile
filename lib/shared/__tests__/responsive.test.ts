import { getLayoutMetrics } from '../responsive';

describe('getLayoutMetrics', () => {
  it('treats 360 x 640 dp as compact in height but not narrow', () => {
    const m = getLayoutMetrics({ width: 360, height: 640, fontScale: 1 });
    expect(m.compactHeight).toBe(true);
    expect(m.narrow).toBe(false);
    expect(m.compact).toBe(true);
    expect(m.stackRow).toBe(false);
    expect(m.gutter).toBe(20);
  });

  it('treats 320 dp wide as narrow, stacks rows and tightens the gutter', () => {
    const m = getLayoutMetrics({ width: 320, height: 568, fontScale: 1 });
    expect(m.narrow).toBe(true);
    expect(m.stackRow).toBe(true);
    expect(m.gutter).toBe(16);
  });

  it('keeps a normal phone roomy', () => {
    const m = getLayoutMetrics({ width: 412, height: 915, fontScale: 1 });
    expect(m.compact).toBe(false);
    expect(m.wide).toBe(false);
    expect(m.stackRow).toBe(false);
  });

  it('stacks side-by-side rows when system text is large', () => {
    const m = getLayoutMetrics({ width: 412, height: 915, fontScale: 1.5 });
    expect(m.largeText).toBe(true);
    expect(m.stackRow).toBe(true);
    expect(m.compact).toBe(false);
  });

  it('flags tablets as wide', () => {
    expect(getLayoutMetrics({ width: 800, height: 1280 }).wide).toBe(true);
    expect(getLayoutMetrics({ width: 599, height: 900 }).wide).toBe(false);
  });

  it('falls back to safe defaults for bad input', () => {
    const m = getLayoutMetrics({ width: NaN, height: NaN, fontScale: 0 });
    expect(m.fontScale).toBe(1);
    expect(m.compact).toBe(false);
  });
});
