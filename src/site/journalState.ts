import type { Site, Stroke } from '@/types';

export type SavedSite = Site & {
  mapUri: string | null;
  published: boolean;
};

export type SavedStroke = { stroke: Stroke; synced: boolean };
export type SavedFeaturePrint = { id: string; siteId: string; data: string; synced: boolean };

export type JournalState = {
  activeSiteId: string | null;
  sites: Record<string, SavedSite>;
  strokes: Record<string, SavedStroke>;
  featurePrints: Record<string, SavedFeaturePrint>;
};

export type JournalEvent =
  | { type: 'site'; site: Site; published: boolean }
  | { type: 'active'; siteId: string }
  | { type: 'map'; siteId: string; uri: string }
  | { type: 'published'; siteId: string }
  | { type: 'stroke'; stroke: Stroke }
  | { type: 'strokeSynced'; id: string }
  | { type: 'featurePrint'; id: string; siteId: string; data: string }
  | { type: 'featurePrintSynced'; id: string };

export function emptyJournalState(): JournalState {
  return { activeSiteId: null, sites: {}, strokes: {}, featurePrints: {} };
}

export function applyJournalEvent(state: JournalState, event: JournalEvent): void {
  switch (event.type) {
    case 'site':
      state.sites[event.site.id] = {
        ...event.site,
        mapUri: state.sites[event.site.id]?.mapUri ?? null,
        published: event.published || state.sites[event.site.id]?.published || false,
      };
      break;
    case 'active':
      state.activeSiteId = event.siteId;
      break;
    case 'map':
      if (state.sites[event.siteId]) state.sites[event.siteId].mapUri = event.uri;
      break;
    case 'published':
      if (state.sites[event.siteId]) state.sites[event.siteId].published = true;
      break;
    case 'stroke':
      state.strokes[event.stroke.id] = { stroke: event.stroke, synced: false };
      break;
    case 'strokeSynced':
      if (state.strokes[event.id]) state.strokes[event.id].synced = true;
      break;
    case 'featurePrint':
      state.featurePrints[event.id] = { id: event.id, siteId: event.siteId, data: event.data, synced: false };
      break;
    case 'featurePrintSynced':
      if (state.featurePrints[event.id]) state.featurePrints[event.id].synced = true;
      break;
  }
}

export function replayJournal(text: string): { state: JournalState; validLines: string[] } {
  const state = emptyJournalState();
  const validLines: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as JournalEvent;
      if (!event || typeof event !== 'object' || typeof event.type !== 'string') continue;
      applyJournalEvent(state, event);
      validLines.push(line);
    } catch {
      // A killed app can leave an incomplete final line. Keep earlier events.
    }
  }
  return { state, validLines };
}
