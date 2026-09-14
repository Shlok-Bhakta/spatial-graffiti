import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SpatialARView } from '@/ar/native';
import { DEFAULT_STROKE_WIDTH_M, PALETTE, type PaletteColor } from '@/colors';
import { ColorPicker } from '@/components/ColorPicker';
import { CoachingBanner } from '@/components/CoachingBanner';
import { DebugStatus } from '@/components/DebugStatus';
import { ServerStatus } from '@/components/ServerStatus';
import { useSiteSession } from '@/site/useSiteSession';

export default function DrawScreen() {
  const [color, setColor] = useState<PaletteColor>(PALETTE[2]);
  const session = useSiteSession();

  if (!SpatialARView) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          SpatialAR requires an Expo development or Release build. Expo Go cannot load this module.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <SpatialARView
        collapsable={false}
        color={color}
        style={styles.fill}
        onStatusChange={(event) => session.onStatusChange(event.nativeEvent)}
        onStrokeCompleted={(event) => {
          const stroke = event.nativeEvent;
          session.onStrokeCompleted({
            ...stroke,
            color: stroke.color || color,
            widthM: stroke.widthM || DEFAULT_STROKE_WIDTH_M,
          });
        }}
      />
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <DebugStatus
          phase={session.phase}
          status={session.status}
          siteId={session.siteId}
          strokeCount={session.strokeCount}
          error={session.error}
        />
        <ServerStatus />
        <CoachingBanner phase={session.phase} status={session.status} />
        <ColorPicker selected={color} onSelect={setColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  fallback: {
    flex: 1,
    backgroundColor: '#100e14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: {
    color: '#f4e8e4',
    textAlign: 'center',
  },
});
