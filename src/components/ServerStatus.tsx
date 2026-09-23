import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { apiBaseUrl, apiHostLabel, getHealth } from '@/api/client';

type Ping =
  | { kind: 'checking' }
  | { kind: 'ok'; ms: number }
  | { kind: 'fail'; detail: string };

export function ServerStatus() {
  const [ping, setPing] = useState<Ping>({ kind: 'checking' });
  const host = apiHostLabel(apiBaseUrl());

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (!apiBaseUrl()) {
        setPing({ kind: 'fail', detail: 'EXPO_PUBLIC_API_BASE_URL empty' });
        return;
      }
      const started = Date.now();
      try {
        const health = await getHealth(4000);
        if (cancelled) {
          return;
        }
        if (!health.ok) {
          setPing({ kind: 'fail', detail: 'health not ok' });
          return;
        }
        setPing({ kind: 'ok', ms: Date.now() - started });
      } catch (err) {
        if (cancelled) {
          return;
        }
        setPing({
          kind: 'fail',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.line}>{host}</Text>
      {ping.kind === 'checking' ? (
        <Text style={styles.warn}>PING …</Text>
      ) : null}
      {ping.kind === 'ok' ? (
        <Text style={styles.ok}>PING ok {ping.ms}ms</Text>
      ) : null}
      {ping.kind === 'fail' ? (
        <Text style={styles.fail}>PING fail {ping.detail}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 56,
    right: 12,
    maxWidth: 180,
    alignItems: 'flex-end',
  },
  line: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  ok: {
    color: '#8fd694',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  warn: {
    color: '#f0d48a',
    fontSize: 10,
    textAlign: 'right',
  },
  fail: {
    color: '#ff8a80',
    fontSize: 10,
    textAlign: 'right',
  },
});
