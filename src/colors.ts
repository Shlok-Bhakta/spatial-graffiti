export const PALETTE = [
  '#ffffff',
  '#111111',
  '#ff3b30',
  '#ffd60a',
  '#34c759',
  '#0a84ff',
  '#bf5af2',
] as const;

export type PaletteColor = (typeof PALETTE)[number];

export const DEFAULT_STROKE_WIDTH_M = 0.01;
