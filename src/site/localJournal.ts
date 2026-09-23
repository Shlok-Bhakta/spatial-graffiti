import { File, Paths } from 'expo-file-system';

import type { Site, Stroke } from '@/types';

import { applyJournalEvent, replayJournal, type JournalEvent, type JournalState } from './journalState';

export class LocalJournal {
  private readonly file: File;
  readonly state: JournalState;

  constructor() {
    this.file = new File(Paths.document, 'spatial-graffiti.journal');
    if (!this.file.exists) this.file.create();
    const contents = this.file.textSync();
    const replayed = replayJournal(contents);
    this.state = replayed.state;
    if (replayed.validLines.length !== contents.split('\n').filter(Boolean).length) {
      this.file.write(replayed.validLines.length ? `${replayed.validLines.join('\n')}\n` : '');
    }
  }

  private append(event: JournalEvent): void {
    this.file.write(`${JSON.stringify(event)}\n`, { append: true });
    applyJournalEvent(this.state, event);
  }

  rememberSite(site: Site, published = false): void {
    this.append({ type: 'site', site, published });
  }

  setActive(siteId: string): void {
    this.append({ type: 'active', siteId });
  }

  rememberMap(siteId: string, uri: string): void {
    this.append({ type: 'map', siteId, uri });
  }

  markPublished(siteId: string): void {
    this.append({ type: 'published', siteId });
  }

  rememberStroke(stroke: Stroke): void {
    this.append({ type: 'stroke', stroke });
  }

  markStrokeSynced(id: string): void {
    this.append({ type: 'strokeSynced', id });
  }

  rememberFeaturePrint(id: string, siteId: string, data: string): void {
    this.append({ type: 'featurePrint', id, siteId, data });
  }

  markFeaturePrintSynced(id: string): void {
    this.append({ type: 'featurePrintSynced', id });
  }

  pendingStrokes(siteId: string): Stroke[] {
    return Object.values(this.state.strokes)
      .filter((entry) => entry.stroke.siteId === siteId && !entry.synced)
      .map((entry) => entry.stroke);
  }

  allStrokes(siteId: string): Stroke[] {
    return Object.values(this.state.strokes)
      .filter((entry) => entry.stroke.siteId === siteId)
      .map((entry) => entry.stroke);
  }

  pendingFeaturePrints(siteId: string) {
    return Object.values(this.state.featurePrints)
      .filter((entry) => entry.siteId === siteId && !entry.synced);
  }
}
