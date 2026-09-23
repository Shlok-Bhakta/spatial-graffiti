import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createFeaturePrint, createSite, createStroke, downloadWorldMap, downloadWorldMapVersion,
  getFeaturePrints, getNearbySites, getStrokes, getWorldMapHistory, uploadWorldMap,
} from '@/api/client';
import { getSpatialAR } from '@/ar/native';
import { randomId } from '@/id';
import { getUsefulLocation, requestForegroundLocation, type GpsFix } from '@/location';
import type { AppPhase, ARStatus, NearbySite, Site, Stroke } from '@/types';

import { rankCandidates } from './candidates';
import { LocalJournal } from './localJournal';
import { canPublishWorldMap } from './mapping';

const RELOCALIZE_MS = 35_000;
const POLL_MS = 10_000;
const RETRY_MS = 4000;
const PRINT_INTERVAL_MS = 12_000;

export type SiteSession = {
  phase: AppPhase;
  status: ARStatus | null;
  siteId: string | null;
  strokeCount: number;
  pendingCount: number;
  savedOnServer: boolean;
  candidates: NearbySite[];
  error: string | null;
  chooseSite: (id: string) => void;
  showRoomChoices: () => void;
  createNewRoom: () => void;
  onStatusChange: (status: ARStatus) => void;
  onStrokeCompleted: (stroke: Stroke) => void;
};

export function useSiteSession(): SiteSession {
  const [phase, setPhase] = useState<AppPhase>('starting');
  const [status, setStatus] = useState<ARStatus | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [savedOnServer, setSavedOnServer] = useState(false);
  const [candidates, setCandidates] = useState<NearbySite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const journalRef = useRef<LocalJournal | null>(null);
  const statusRef = useRef<ARStatus | null>(null);
  const siteIdRef = useRef<string | null>(null);
  const gpsRef = useRef<GpsFix | null>(null);
  const remoteIdsRef = useRef(new Set<string>());
  const candidatesRef = useRef<NearbySite[]>([]);
  const selectedRef = useRef<NearbySite | null>(null);
  const completedSiteRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const busyRef = useRef({ checkpoint: false, publish: false, flush: false, complete: false, print: false });
  const lastPrintAtRef = useRef(0);
  const extendingSinceRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const waitForStatus = useCallback(async (predicate: (status: ARStatus) => boolean, ms: number, attempt?: number) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (attempt != null && attempt !== attemptRef.current) return null;
      if (statusRef.current && predicate(statusRef.current)) return statusRef.current;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }, []);

  const flushStrokes = useCallback(async (id: string) => {
    const journal = journalRef.current;
    if (!journal || busyRef.current.flush) return;
    busyRef.current.flush = true;
    try {
      for (const stroke of journal.pendingStrokes(id)) {
        try {
          await createStroke(id, stroke);
          journal.markStrokeSynced(stroke.id);
          setPendingCount(journal.pendingStrokes(id).length);
        } catch (err) {
          console.error('stroke upload failed', err);
          setError('Some marks are saved on this phone and will retry uploading.');
          break;
        }
      }
    } finally {
      busyRef.current.flush = false;
    }
  }, []);

  const flushPrints = useCallback(async (id: string) => {
    const journal = journalRef.current;
    if (!journal) return;
    for (const print of journal.pendingFeaturePrints(id)) {
      try {
        await createFeaturePrint(id, print);
        journal.markFeaturePrintSynced(print.id);
      } catch (err) {
        console.error('feature print upload failed', err);
        break;
      }
    }
  }, []);

  const capturePrint = useCallback(async (id: string) => {
    const journal = journalRef.current;
    if (!journal || busyRef.current.print || statusRef.current?.tracking !== 'normal') return;
    const count = Object.values(journal.state.featurePrints).filter((item) => item.siteId === id).length;
    if (count >= 5 || Date.now() - lastPrintAtRef.current < PRINT_INTERVAL_MS) return;
    busyRef.current.print = true;
    lastPrintAtRef.current = Date.now();
    try {
      journal.rememberFeaturePrint(randomId(), id, await getSpatialAR().captureFeaturePrint());
      if (journal.state.sites[id]?.published) await flushPrints(id);
    } catch (err) {
      console.error('feature print capture failed', err);
    } finally {
      busyRef.current.print = false;
    }
  }, [flushPrints]);

  const publishSite = useCallback(async () => {
    const id = siteIdRef.current;
    const journal = journalRef.current;
    const current = statusRef.current;
    if (!id || !journal || !current || busyRef.current.publish) return;
    const saved = journal.state.sites[id];
    if (!saved || saved.published || !saved.mapUri || current.mode !== 'ready' || current.siteId !== id) return;
    if (!canPublishWorldMap(current.mapping)) return;
    const latitude = saved.latitude || gpsRef.current?.latitude;
    const longitude = saved.longitude || gpsRef.current?.longitude;
    if (latitude == null || longitude == null) {
      setError('This room is on your phone. Enable location to share it nearby.');
      return;
    }
    busyRef.current.publish = true;
    try {
      let mapUri = saved.mapUri;
      try {
        mapUri = await getSpatialAR().exportWorldMap();
        journal.rememberMap(id, mapUri);
      } catch (err) {
        console.warn('using earlier room map', err);
      }
      await createSite({ id, latitude, longitude, horizontalAccuracyM: saved.horizontalAccuracyM, createdAt: saved.createdAt });
      await uploadWorldMap(id, mapUri);
      journal.markPublished(id);
      setSavedOnServer(true);
      setError(null);
      await flushStrokes(id);
      await flushPrints(id);
    } catch (err) {
      console.error('room upload failed', err);
      setError('Room is saved on this phone. Server upload will retry.');
    } finally {
      busyRef.current.publish = false;
    }
  }, [flushPrints, flushStrokes]);

  const checkpointMap = useCallback(async () => {
    const id = siteIdRef.current;
    const journal = journalRef.current;
    const current = statusRef.current;
    if (!id || !journal || !current || busyRef.current.checkpoint) return;
    if (current.mode !== 'ready' || current.siteId !== id || !current.rootAnchorReady) return;
    if (current.mapping !== 'extending' && current.mapping !== 'mapped') return;
    if (journal.state.sites[id]?.mapUri) return;
    busyRef.current.checkpoint = true;
    try {
      const uri = await getSpatialAR().exportWorldMap();
      journal.rememberMap(id, uri);
      await getSpatialAR().setDrawingEnabled(true);
      setPhase('ready');
      setError(null);
      void capturePrint(id);
      void publishSite();
    } catch (err) {
      console.error('local map save failed', err);
      setError('Scan walls and furniture in good light so this room can be saved.');
    } finally {
      busyRef.current.checkpoint = false;
    }
  }, [capturePrint, publishSite]);

  const startNewSite = useCallback(async () => {
    const journal = journalRef.current;
    if (!journal) return;
    const attempt = ++attemptRef.current;
    selectedRef.current = null;
    completedSiteRef.current = null;
    const id = randomId();
    const site: Site = {
      id, latitude: gpsRef.current?.latitude ?? 0, longitude: gpsRef.current?.longitude ?? 0,
      horizontalAccuracyM: gpsRef.current?.horizontalAccuracyM ?? null,
      createdAt: new Date().toISOString(),
    };
    try {
      journal.rememberSite(site);
      journal.setActive(id);
      siteIdRef.current = id;
      setSiteId(id);
      setStrokeCount(0);
      setPendingCount(0);
      setSavedOnServer(false);
      setError(null);
      setPhase('creating');
      await getSpatialAR().startNewSite(id);
      const ready = await waitForStatus(
        (next) => next.mode === 'ready' && next.rootAnchorReady && next.siteId === id,
        20_000, attempt,
      );
      if (attemptRef.current !== attempt) return;
      if (!ready) throw new Error('ARKit did not establish a room anchor. Move the phone slowly and try again.');
      setPhase('mapping');
      void checkpointMap();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('failed');
    }
  }, [checkpointMap, waitForStatus]);

  const completeCandidate = useCallback(async (candidate: NearbySite) => {
    const journal = journalRef.current;
    if (!journal || busyRef.current.complete || completedSiteRef.current === candidate.id || siteIdRef.current !== candidate.id) return;
    busyRef.current.complete = true;
    try {
      const published = remoteIdsRef.current.has(candidate.id) || journal.state.sites[candidate.id]?.published || false;
      if (!journal.state.sites[candidate.id]) journal.rememberSite(candidate, published);
      else if (published && !journal.state.sites[candidate.id].published) journal.markPublished(candidate.id);
      journal.setActive(candidate.id);
      const local = journal.allStrokes(candidate.id);
      await getSpatialAR().setRemoteStrokes(local);
      await getSpatialAR().setDrawingEnabled(true);
      setStrokeCount(local.length);
      setPendingCount(journal.pendingStrokes(candidate.id).length);
      setSavedOnServer(published);
      setPhase('ready');
      completedSiteRef.current = candidate.id;
      selectedRef.current = null;
      if (published) {
        void flushStrokes(candidate.id);
        void flushPrints(candidate.id);
        void getStrokes(candidate.id).then(async (remote) => {
          if (siteIdRef.current !== candidate.id) return;
          const merged = new Map(remote.map((stroke) => [stroke.id, stroke]));
          for (const stroke of journal.allStrokes(candidate.id)) merged.set(stroke.id, stroke);
          await getSpatialAR().setRemoteStrokes([...merged.values()]);
          setStrokeCount(merged.size);
        }).catch((err) => {
          console.error('stroke download failed', err);
          setError('Room found. Showing marks saved on this phone while the server is unavailable.');
        });
      } else void publishSite();
      void capturePrint(candidate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('choosing');
    } finally {
      busyRef.current.complete = false;
    }
  }, [capturePrint, flushPrints, flushStrokes, publishSite]);

  const tryCandidate = useCallback(async (candidate: NearbySite) => {
    const attempt = ++attemptRef.current;
    completedSiteRef.current = null;
    selectedRef.current = candidate;
    siteIdRef.current = candidate.id;
    setSiteId(candidate.id);
    setPhase('relocalizing');
    setError(null);
    setSavedOnServer(false);
    const ar = getSpatialAR();
    const localUri = journalRef.current?.state.sites[candidate.id]?.mapUri;
    let triedMap = false;
    const tryMap = async (uri: string, timeoutMs: number): Promise<boolean> => {
      if (attemptRef.current !== attempt) return false;
      triedMap = true;
      try {
        await ar.loadSite(candidate.id, uri);
        if (attemptRef.current !== attempt) return false;
        const ready = await waitForStatus(
          (next) => next.mode === 'ready' && next.rootAnchorReady && next.tracking === 'normal' && next.siteId === candidate.id,
          timeoutMs, attempt,
        );
        if (attemptRef.current !== attempt || !ready) return false;
        // Keep a local copy so this room can reopen even while Kiwi is offline.
        if (journalRef.current?.state.sites[candidate.id]) journalRef.current.rememberMap(candidate.id, uri);
        await completeCandidate(candidate);
        return completedSiteRef.current === candidate.id;
      } catch (err) {
        console.error('room map failed', candidate.id, err);
        return false;
      }
    };
    if (localUri && await tryMap(localUri, RELOCALIZE_MS)) return;
    if (attemptRef.current !== attempt) return;
    if (remoteIdsRef.current.has(candidate.id) || journalRef.current?.state.sites[candidate.id]?.published) {
      try {
        const latest = await downloadWorldMap(candidate.id);
        if (await tryMap(latest, localUri ? 20_000 : RELOCALIZE_MS)) return;
      } catch (err) { console.error('latest room map download failed', candidate.id, err); }
      if (attemptRef.current !== attempt) return;
      try {
        const history = await getWorldMapHistory(candidate.id);
        for (const version of history.slice(0, 2)) {
          if (attemptRef.current !== attempt) return;
          try {
            const older = await downloadWorldMapVersion(candidate.id, version.sha256);
            if (await tryMap(older, 20_000)) return;
          } catch (err) { console.error('older room map download failed', candidate.id, err); }
        }
      } catch (err) { console.error('room map history unavailable', candidate.id, err); }
    }
    if (attemptRef.current !== attempt) return;
    setPhase('choosing');
    setError(triedMap
      ? 'Still looking for this room. Aim at the same walls and furniture, or choose another room.'
      : 'Could not download this room. Choose a room saved on this phone, or try again online.');
  }, [completeCandidate, waitForStatus]);

  const chooseSite = useCallback((id: string) => {
    const candidate = candidatesRef.current.find((item) => item.id === id);
    if (candidate) void tryCandidate(candidate);
  }, [tryCandidate]);
  const showRoomChoices = useCallback(() => {
    ++attemptRef.current;
    selectedRef.current = null;
    setPhase('choosing');
  }, []);
  const createNewRoom = useCallback(() => { void startNewSite(); }, [startNewSite]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      try {
        const journal = new LocalJournal();
        journalRef.current = journal;
        setPhase('locating');
        const granted = await requestForegroundLocation();
        const location = granted ? await getUsefulLocation().catch(() => null) : null;
        gpsRef.current = location;
        setPhase('discovering');
        let nearby: NearbySite[] = [];
        let discoveryFailed = !location;
        if (location) {
          try { nearby = await getNearbySites(location.latitude, location.longitude, 200); }
          catch (err) {
            discoveryFailed = true;
            console.error('nearby request failed', err);
            setError('Server unavailable. Looking for rooms saved on this phone.');
          }
        }
        remoteIdsRef.current = new Set(nearby.map((item) => item.id));
        const lastId = journal.state.activeSiteId;
        const last = lastId ? journal.state.sites[lastId] : null;
        if (last && (last.mapUri || last.published) && !nearby.some((item) => item.id === last.id)) {
          nearby.unshift({ ...last, distanceM: 0 });
        }
        if (!nearby.length) {
          if (last && !last.mapUri && journal.allStrokes(last.id).length) {
            setError('Last marks are on this phone, but that room never mapped. They cannot be placed accurately.');
            setPhase('choosing');
          } else if (discoveryFailed) {
            setError('Could not check nearby rooms. Try again with location and server access, or start a new room on this phone.');
            setPhase('choosing');
          } else await startNewSite();
          return;
        }
        const visual: Record<string, number> = {};
        if (nearby.length > 1) {
          try {
            const ar = getSpatialAR();
            await ar.startDiscovery();
            await waitForStatus((next) => next.tracking === 'normal', 10_000);
            const query = await ar.captureFeaturePrint();
            await Promise.all(nearby.map(async (item) => {
              try {
                const prints = await getFeaturePrints(item.id);
                const results = await Promise.allSettled(prints.map((print) => ar.compareFeaturePrints(query, print.data)));
                const distances = results
                  .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
                  .map((result) => result.value);
                if (distances.length) visual[item.id] = Math.min(...distances);
              } catch (err) { console.warn('visual ranking unavailable', item.id, err); }
            }));
          } catch (err) { console.warn('visual discovery unavailable', err); }
        }
        const ranked = rankCandidates(nearby, visual, lastId);
        candidatesRef.current = ranked;
        setCandidates(ranked);
        if (ranked.length > 1 && !ranked.some((item) => item.id === lastId) && !Object.keys(visual).length) {
          setPhase('choosing');
          setError('These rooms are too close for GPS to tell apart. Choose the room you recognize.');
          return;
        }
        await tryCandidate(ranked[0]);
      } catch (err) {
        console.error('room startup failed', err);
        setError(err instanceof Error ? err.message : String(err));
        setPhase('failed');
      }
    })();
  }, [startNewSite, tryCandidate, waitForStatus]);

  useEffect(() => {
    if ((phase !== 'ready' && phase !== 'mapping') || !siteId) return;
    const timer = setInterval(() => {
      if (phase === 'mapping') void checkpointMap();
      else if (journalRef.current?.state.sites[siteId]?.published) {
        void flushStrokes(siteId);
        void flushPrints(siteId);
        void getStrokes(siteId).then(async (remote) => {
          if (siteIdRef.current !== siteId) return;
          const merged = new Map(remote.map((stroke) => [stroke.id, stroke]));
          for (const stroke of journalRef.current?.allStrokes(siteId) ?? []) merged.set(stroke.id, stroke);
          await getSpatialAR().setRemoteStrokes([...merged.values()]);
          setStrokeCount(merged.size);
        }).catch((err) => console.error('stroke poll failed', err));
        void capturePrint(siteId);
      } else void publishSite();
    }, phase === 'mapping' ? RETRY_MS : POLL_MS);
    return () => clearInterval(timer);
  }, [capturePrint, checkpointMap, flushPrints, flushStrokes, phase, publishSite, siteId]);

  const onStatusChange = useCallback((next: ARStatus) => {
    statusRef.current = next;
    setStatus(next);
    if (next.mapping === 'extending' && extendingSinceRef.current == null) extendingSinceRef.current = Date.now();
    if (next.mapping === 'limited' || next.mapping === 'notAvailable') extendingSinceRef.current = null;
    if (!selectedRef.current && next.mode === 'ready' && next.rootAnchorReady && !next.drawingEnabled) {
      void checkpointMap();
    }
  }, [checkpointMap]);

  const onStrokeCompleted = useCallback((stroke: Stroke) => {
    const journal = journalRef.current;
    if (!journal || stroke.siteId !== siteIdRef.current) return;
    try {
      journal.rememberStroke(stroke);
      setStrokeCount((count) => count + 1);
      setPendingCount(journal.pendingStrokes(stroke.siteId).length);
      if (journal.state.sites[stroke.siteId]?.published) void flushStrokes(stroke.siteId);
    } catch (err) {
      console.error('local stroke save failed', err);
      setError('Could not save this mark on the phone. Check available storage.');
    }
  }, [flushStrokes]);

  return {
    phase, status, siteId, strokeCount, pendingCount, savedOnServer,
    candidates, error, chooseSite, showRoomChoices, createNewRoom, onStatusChange, onStrokeCompleted,
  };
}
