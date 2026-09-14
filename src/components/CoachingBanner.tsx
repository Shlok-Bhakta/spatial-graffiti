import { StyleSheet, Text, View } from 'react-native';

import { coachingMessage } from '@/site/mapping';
import type { AppPhase, ARStatus } from '@/types';

type Props = {
  phase: AppPhase;
  status: ARStatus | null;
};

export function CoachingBanner({ phase, status }: Props) {
  const message = coachingMessage(phase, status);
  if (!message) {
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(16, 14, 20, 0.82)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  text: {
    color: '#f4e8e4',
    fontSize: 13,
    textAlign: 'center',
  },
});
