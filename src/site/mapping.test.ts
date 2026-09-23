import { canPublishWorldMap, coachingMessage } from './mapping';

describe('canPublishWorldMap', () => {
  it('publishes once mapping is mapped', () => {
    expect(canPublishWorldMap('mapped')).toBe(true);
  });

  it('never publishes limited, extending, or unavailable maps', () => {
    expect(canPublishWorldMap('limited')).toBe(false);
    expect(canPublishWorldMap('extending')).toBe(false);
    expect(canPublishWorldMap('notAvailable')).toBe(false);
  });
});

describe('coachingMessage', () => {
  it('prompts a room scan while relocalizing', () => {
    expect(
      coachingMessage('relocalizing', {
        tracking: 'limited',
        trackingReason: 'relocalizing',
        mapping: 'limited',
        mode: 'relocalizing',
        rootAnchorReady: false,
      }),
    ).toMatch(/slowly move the camera/);
  });

  it('prompts a room scan while creating', () => {
    expect(coachingMessage('creating', null)).toMatch(/Scanning the room/);
    expect(coachingMessage('locating', null)).toMatch(/Scanning the room/);
    expect(coachingMessage('discovering', null)).toMatch(/Scanning the room/);
  });

  it('nudges for more motion when ready but under-mapped', () => {
    expect(
      coachingMessage('ready', {
        tracking: 'normal',
        mapping: 'extending',
        mode: 'ready',
        rootAnchorReady: true,
      }),
    ).toMatch(/Keep moving/);
  });

  it('stays quiet when ready and mapped', () => {
    expect(
      coachingMessage('ready', {
        tracking: 'normal',
        mapping: 'mapped',
        mode: 'ready',
        rootAnchorReady: true,
      }),
    ).toBeNull();
  });
});
