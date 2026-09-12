import type { ARMapping } from '@/types';

const EXTENDING_FALLBACK_MS = 8000;

export function canPublishWorldMap(
  mapping: ARMapping,
  extendingSinceMs: number | null,
  nowMs: number,
): boolean {
  if (mapping === 'mapped') {
    return true;
  }
  if (mapping === 'extending' && extendingSinceMs != null) {
    return nowMs - extendingSinceMs >= EXTENDING_FALLBACK_MS;
  }
  return false;
}
