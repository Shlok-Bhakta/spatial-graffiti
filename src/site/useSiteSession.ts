import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createSite,
  createStroke,
  downloadWorldMap,
  getNearbySites,
  getStrokes,
  uploadWorldMap,
} from '@/api/client';
import { getSpatialAR } from '@/ar/native';
import { getUsefulLocation, requestForegroundLocation, type GpsFix } from '@/location';
import type { AppPhase, ARStatus, NearbySite, Stroke } from '@/types';

import { canPublishWorldMap } from './mapping';

const CANDIDATE_LIMIT = 3;
const RELOCALIZE_TIMEOUT_MS = 14_000;
const STROKE_POLL_MS = 10_000;

function randomId(): string {
  return crypto.randomUUID();
}

export type SiteSession = {
  phase: AppPhase;
  status: ARStatus | null;
  siteId: string | null;
  strokeCount: number;
  error: string | null;
  onStatusChange: (status: ARStatus) => void;
  onStrokeCompleted: (stroke: Stroke) => void;
};

export function useSiteSession(): SiteSession {
  const [phase, setPhase] = useState<AppPhase>('starting');
  const [status, setStatus] = useState<ARStatus | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const statusRef = useRef<ARStatus | null>(null);
  const siteIdRef = useRef<string | null>(null);
  const publishedRef = useRef(false);
  const publishingRef = useRef(false);
  const queueRef = useRef<Stroke[]>([]);
  const extendingSinceRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const gpsRef = useRef<GpsFix | null>(null);

  const waitForStatus = useCallback(
    async (predicate: (next: ARStatus) => boolean, timeoutMs: number) => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const current = statusRef.current;
        if (current && predicate(current)) {
          return current;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return statusRef.current;
    },
    [],
  );

  const flushQueue = useCallback(async (id: string) => {
    const pending = queueRef.current.splice(0, queueRef.current.length);
    for (const stroke of pending) {
      try {
        await createStroke(id, stroke);
      } catch (err) {
        console.error('stroke upload failed', err);
        queueRef.current.push(stroke);
      }
    }
  }, []);

  const publishNewSite = useCallback(async () => {
    const id = siteIdRef.current;
    const current = statusRef.current;
    if (!id || !current || publishedRef.current || publishingRef.current) {
      return;
    }
    if (current.mode !== 'ready' || !current.rootAnchorReady) {
      return;
    }
    if (!canPublishWorldMap(current.mapping, extendingSinceRef.current, Date.now())) {
      return;
    }
    publishingRef.current = true;
    try {
      const ar = getSpatialAR();
      const mapUri = await ar.exportWorldMap();
      const location = gpsRef.current;
      await createSite({
        id,
        latitude: location?.latitude ?? 0,
        longitude: location?.longitude ?? 0,
        horizontalAccuracyM: location?.horizontalAccuracyM ?? null,
        createdAt: new Date().toISOString(),
      });
      await uploadWorldMap(id, mapUri);
      publishedRef.current = true;
      await flushQueue(id);
    } catch (err) {
      console.error('new site publish failed', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      publishingRef.current = false;
    }
  }, [flushQueue]);

  const startNewSite = useCallback(async () => {
    const id = randomId();
    siteIdRef.current = id;
    setSiteId(id);
    setPhase('creating');
    publishedRef.current = false;
    const ar = getSpatialAR();
    await ar.resetSession();
    await ar.startNewSite(id);
    await waitForStatus(
      (next) => next.mode === 'ready' && next.rootAnchorReady,
      20_000,
    );
    setPhase('ready');
  }, [waitForStatus]);

  const tryCandidate = useCallback(
    async (candidate: NearbySite) => {
      setPhase('relocalizing');
      siteIdRef.current = candidate.id;
      setSiteId(candidate.id);
      const ar = getSpatialAR();
      await ar.resetSession();
      const mapUri = await downloadWorldMap(candidate.id);
      await ar.loadSite(candidate.id, mapUri);
      const ready = await waitForStatus(
        (next) =>
          next.mode === 'ready' &&
          next.rootAnchorReady &&
          next.tracking === 'normal' &&
          next.siteId === candidate.id,
        RELOCALIZE_TIMEOUT_MS,
      );
      if (!ready || ready.mode !== 'ready' || !ready.rootAnchorReady) {
        return false;
      }
      const strokes = await getStrokes(candidate.id);
      await ar.setRemoteStrokes(strokes);
      setStrokeCount(strokes.length);
      publishedRef.current = true;
      setPhase('ready');
      return true;
    },
    [waitForStatus],
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void (async () => {
      try {
        setPhase('locating');
        const granted = await requestForegroundLocation();
        if (!granted) {
          setError('Location permission denied. A new site will be created without GPS.');
        }
        const location = granted
          ? await getUsefulLocation().catch((err) => {
              console.error('location failed', err);
              return null;
            })
          : null;
        gpsRef.current = location;
        setPhase('discovering');
        const nearby = location
          ? await getNearbySites(location.latitude, location.longitude, 100)
          : [];
        const candidates = nearby.slice(0, CANDIDATE_LIMIT);
        for (const candidate of candidates) {
          try {
            if (await tryCandidate(candidate)) {
              return;
            }
          } catch (err) {
            console.error('candidate failed', candidate.id, err);
          }
        }
        await startNewSite();
      } catch (err) {
        console.error('site session failed', err);
        setError(err instanceof Error ? err.message : String(err));
        setPhase('failed');
        try {
          await startNewSite();
        } catch (startErr) {
          console.error('new site fallback failed', startErr);
        }
      }
    })();
  }, [startNewSite, tryCandidate]);

  useEffect(() => {
    if (phase !== 'ready' || !siteId || !publishedRef.current) {
      return;
    }
    const timer = setInterval(() => {
      void (async () => {
        try {
          const strokes = await getStrokes(siteId);
          await getSpatialAR().setRemoteStrokes(strokes);
          setStrokeCount(strokes.length);
        } catch (err) {
          console.error('stroke poll failed', err);
        }
      })();
    }, STROKE_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, siteId]);

  const onStatusChange = useCallback(
    (next: ARStatus) => {
      statusRef.current = next;
      setStatus(next);
      if (next.mapping === 'extending') {
        if (extendingSinceRef.current == null) {
          extendingSinceRef.current = Date.now();
        }
      } else if (next.mapping !== 'mapped') {
        extendingSinceRef.current = null;
      }
      if (phase === 'creating' || (phase === 'ready' && !publishedRef.current)) {
        void publishNewSite();
      }
    },
    [phase, publishNewSite],
  );

  const onStrokeCompleted = useCallback(
    (stroke: Stroke) => {
      setStrokeCount((count) => count + 1);
      const id = siteIdRef.current;
      if (!id) {
        queueRef.current.push(stroke);
        return;
      }
      if (!publishedRef.current) {
        queueRef.current.push(stroke);
        return;
      }
      void createStroke(id, stroke).catch((err) => {
        console.error('stroke upload failed', err);
        queueRef.current.push(stroke);
      });
    },
    [],
  );

  return {
    phase,
    status,
    siteId,
    strokeCount,
    error,
    onStatusChange,
    onStrokeCompleted,
  };
}
