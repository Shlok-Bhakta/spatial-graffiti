import type { AppPhase, ARMapping, ARStatus } from '@/types';

/**
 * Only a fully-mapped session produces a world map worth persisting.
 * `extending` means ARKit is still under-mapped (blank walls, too little
 * motion) — publishing those maps is the main source of relocalization
 * failures after restart, so we no longer accept them.
 */
export function canPublishWorldMap(mapping: ARMapping): boolean {
  return mapping === 'mapped';
}

/**
 * User-facing coaching prompt for the "move the camera around" scan flow.
 * Returns null when no coaching is needed (ready / failed handled elsewhere).
 */
export function coachingMessage(phase: AppPhase, status: ARStatus | null): string | null {
  if (phase === 'relocalizing' || status?.mode === 'relocalizing') {
    return 'Looking for your space — slowly move the camera around the room.';
  }
  if (phase === 'creating' || phase === 'locating' || phase === 'discovering') {
    return 'Scanning the room — slowly move the camera to map the space.';
  }
  if (phase === 'ready' && status && status.mapping !== 'mapped') {
    return 'Keep moving the camera slowly to improve mapping.';
  }
  return null;
}
