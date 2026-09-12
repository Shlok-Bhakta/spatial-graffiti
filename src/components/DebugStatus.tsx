import { StyleSheet, Text, View } from 'react-native';

import type { AppPhase, ARStatus } from '@/types';

type Props = {
  phase: AppPhase;
  status: ARStatus | null;
  siteId: string | null;
  strokeCount: number;
  error: string | null;
};

export function DebugStatus({ phase, status, siteId, strokeCount, error }: Props) {
  if (!__DEV__) {
    return null;
  }
  const shortSite = siteId ? siteId.slice(0, 8) : '—';
  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.line}>TRACK {status?.tracking ?? '—'}</Text>
      <Text style={styles.line}>MAP {status?.mapping ?? '—'}</Text>
      <Text style={styles.line}>SITE {shortSite}</Text>
      <Text style={styles.line}>MODE {status?.mode ?? phase}</Text>
      <Text style={styles.line}>STROKES {strokeCount}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 56,
    left: 12,
    maxWidth: 220,
  },
  line: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: '#ff8a80',
    fontSize: 10,
    marginTop: 4,
  },
});
