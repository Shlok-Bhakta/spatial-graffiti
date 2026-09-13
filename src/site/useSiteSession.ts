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
import { randomId } from '@/id';
import { getUsefulLocation, requestForegroundLocation, type GpsFix } from '@/location';
import type { AppPhase, ARStatus, NearbySite, Stroke } from '@/types';

import { canPublishWorldMap } from './mapping';

const CANDIDATE_LIMIT = 3;
const RELOCALIZE_TIMEOUT_MS = 15_000;
const STROKE_POLL_MS = 10_000;
const PUBLISH_RETRY_MS = 4000;

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
  const [published, setPublished] = useState(false);

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
      return null;
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
    const location = gpsRef.current;
    if (!id || !current || publishedRef.current || publishingRef.current) {
      return;
    }
    if (current.mode !== 'ready' || !current.rootAnchorReady || current.siteId !== id) {
      return;
    }
    if (!location) {
      setError('GPS is required to publish this site. Nearby discovery will fail without it.');
      return;
    }
    if (!canPublishWorldMap(current.mapping, extendingSinceRef.current, Date.now())) {
      return;
    }
    publishingRef.current = true;
    try {
      const ar = getSpatialAR();
      const mapUri = await ar.exportWorldMap();
      await createSite({
        id,
        latitude: location.latitude,
        longitude: location.longitude,
        horizontalAccuracyM: location.horizontalAccuracyM,
        createdAt: new Date().toISOString(),
      });
      await uploadWorldMap(id, mapUri);
      publishedRef.current = true;
      setPublished(true);
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
    setPublished(false);
    const ar = getSpatialAR();
    await ar.resetSession();
    await ar.startNewSite(id);
    const ready = await waitForStatus(
      (next) =>
        next.mode === 'ready' && next.rootAnchorReady && next.siteId === id,
      20_000,
    );
    if (!ready) {
      throw new Error('ARKit did not create a root anchor for the new site');
    }
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
      if (!ready) {
        return false;
      }
      const strokes = await getStrokes(candidate.id);
      await ar.setRemoteStrokes(strokes);
      setStrokeCount(strokes.length);
      publishedRef.current = true;
      setPublished(true);
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
          setError('Location permission denied. Nearby sites cannot be discovered.');
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
    if (phase !== 'ready' || !siteId) {
      return;
    }
    const timer = setInterval(() => {
      void (async () => {
        if (!publishedRef.current) {
          await publishNewSite();
          return;
        }
        try {
          await flushQueue(siteId);
          const strokes = await getStrokes(siteId);
          await getSpatialAR().setRemoteStrokes(strokes);
          setStrokeCount(strokes.length);
        } catch (err) {
          console.error('stroke poll failed', err);
        }
      })();
    }, published ? STROKE_POLL_MS : PUBLISH_RETRY_MS);
    return () => clearInterval(timer);
  }, [flushQueue, phase, publishNewSite, published, siteId]);

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
      if (!publishedRef.current) {
        void publishNewSite();
      }
    },
    [publishNewSite],
  );

  const onStrokeCompleted = useCallback((stroke: Stroke) => {
    setStrokeCount((count) => count + 1);
    const id = siteIdRef.current;
    if (!id || !publishedRef.current) {
      queueRef.current.push(stroke);
      return;
    }
    void createStroke(id, stroke).catch((err) => {
      console.error('stroke upload failed', err);
      queueRef.current.push(stroke);
    });
  }, []);

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
