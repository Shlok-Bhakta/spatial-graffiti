import { canPublishWorldMap } from './mapping';

describe('canPublishWorldMap', () => {
  it('publishes once mapping is mapped', () => {
    expect(canPublishWorldMap('mapped', null, 10_000)).toBe(true);
  });

  it('never publishes limited or unavailable maps', () => {
    expect(canPublishWorldMap('limited', 0, 60_000)).toBe(false);
    expect(canPublishWorldMap('notAvailable', 0, 60_000)).toBe(false);
  });

  it('accepts extending only after several seconds', () => {
    expect(canPublishWorldMap('extending', 1000, 4000)).toBe(false);
    expect(canPublishWorldMap('extending', 1000, 10_000)).toBe(true);
  });
});
