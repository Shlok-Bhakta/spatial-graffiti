import { DEFAULT_STROKE_WIDTH_M, PALETTE } from './colors';

describe('palette', () => {
  it('has the seven required colors', () => {
    expect(PALETTE).toEqual([
      '#ffffff',
      '#111111',
      '#ff3b30',
      '#ffd60a',
      '#34c759',
      '#0a84ff',
      '#bf5af2',
    ]);
  });

  it('uses a centimeter-scale stroke width', () => {
    expect(DEFAULT_STROKE_WIDTH_M).toBeGreaterThanOrEqual(0.008);
    expect(DEFAULT_STROKE_WIDTH_M).toBeLessThanOrEqual(0.012);
  });
});
