import type { NearbySite } from '@/types';

export function rankCandidates(
  candidates: NearbySite[],
  visualDistances: Record<string, number>,
  lastSiteId: string | null,
): NearbySite[] {
  return [...candidates].sort((a, b) => {
    const aVisual = visualDistances[a.id];
    const bVisual = visualDistances[b.id];
    if (Number.isFinite(aVisual) && Number.isFinite(bVisual)) return aVisual - bVisual;
    if (Number.isFinite(aVisual)) return -1;
    if (Number.isFinite(bVisual)) return 1;
    if (a.id === lastSiteId && b.id !== lastSiteId) return -1;
    if (b.id === lastSiteId && a.id !== lastSiteId) return 1;
    return a.distanceM - b.distanceM;
  });
}
