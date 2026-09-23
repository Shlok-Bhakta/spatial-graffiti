import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpatialARView } from '@/ar/native';
import { DEFAULT_STROKE_WIDTH_M, PALETTE, type PaletteColor } from '@/colors';
import { ColorPicker } from '@/components/ColorPicker';
import { DebugStatus } from '@/components/DebugStatus';
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
          pendingCount={session.pendingCount}
          savedOnServer={session.savedOnServer}
        />
        {session.phase === 'ready' ? (
          <View pointerEvents="none" style={styles.saveBanner}>
            <Text style={styles.saveText}>
              {session.savedOnServer && session.pendingCount === 0
                ? 'Saved on kiwi'
                : session.savedOnServer
                  ? `${session.pendingCount} mark${session.pendingCount === 1 ? '' : 's'} waiting to upload`
                  : 'Room saved on this phone. Uploading when ready.'}
            </Text>
          </View>
        ) : null}
        {(session.phase === 'choosing' || session.phase === 'relocalizing' || session.phase === 'mapping' || session.phase === 'failed') ? (
          <View style={styles.roomPanel}>
            {session.phase === 'relocalizing' ? (
              <>
                <Text style={styles.panelTitle}>Finding this room</Text>
                <Text style={styles.panelBody}>Point at the same walls and furniture you scanned before. Move slowly.</Text>
                <Pressable onPress={session.showRoomChoices} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Choose another room</Text>
                </Pressable>
              </>
            ) : session.phase === 'mapping' ? (
              <>
                <Text style={styles.panelTitle}>Mapping this room</Text>
                <Text style={styles.panelBody}>Move the phone slowly across walls and furniture. Drawing unlocks once the room map is saved on your phone.</Text>
              </>
            ) : (
              <>
                <Text style={styles.panelTitle}>Choose a room</Text>
                <Text style={styles.panelBody}>GPS finds nearby rooms. The camera checks which one matches what you see.</Text>
                <ScrollView style={styles.roomList}>
                  {session.candidates.map((room, index) => (
                    <Pressable key={room.id} onPress={() => session.chooseSite(room.id)} style={styles.roomButton}>
                      <Text style={styles.roomTitle}>{index === 0 ? 'Suggested room' : `Room ${index + 1}`}</Text>
                      <Text style={styles.roomDetail}>{room.strokeCount ?? '?'} marks · {new Date(room.createdAt).toLocaleString()} · {Math.round(room.distanceM)} m away</Text>
                      <Text style={styles.roomCode}>Room code {room.id.slice(0, 8)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable onPress={session.createNewRoom} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Start a new room here</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
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
  roomPanel: {
    position: 'absolute', top: '28%', left: 20, right: 20,
    backgroundColor: 'rgba(20, 19, 27, 0.92)', borderColor: '#6f6373', borderWidth: 1,
    borderRadius: 18, padding: 18, gap: 10, maxHeight: '48%',
  },
  saveBanner: { position: 'absolute', bottom: 97, alignSelf: 'center', backgroundColor: 'rgba(20, 19, 27, 0.82)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  panelTitle: { color: '#fff', fontSize: 21, fontWeight: '700' },
  panelBody: { color: '#d7d1dc', fontSize: 14, lineHeight: 20 },
  roomList: { maxHeight: 180 },
  roomButton: { borderColor: '#766777', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  roomTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  roomDetail: { color: '#bdb4c0', fontSize: 11, marginTop: 3 },
  roomCode: { color: '#a48fa7', fontSize: 10, marginTop: 3 },
  secondaryButton: { padding: 12, borderRadius: 10, backgroundColor: '#d28db7', alignItems: 'center' },
  secondaryText: { color: '#201421', fontWeight: '700' },
});
