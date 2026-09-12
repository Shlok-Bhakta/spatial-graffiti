import { Pressable, StyleSheet, View } from 'react-native';

import { PALETTE, type PaletteColor } from '@/colors';

type Props = {
  selected: PaletteColor;
  onSelect: (color: PaletteColor) => void;
};

export function ColorPicker({ selected, onSelect }: Props) {
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.palette} accessibilityRole="toolbar">
        {PALETTE.map((color) => {
          const isSelected = color === selected;
          return (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Color ${color}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                isSelected && styles.selected,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 36,
  },
  palette: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  selected: {
    borderWidth: 3,
    borderColor: '#ffffff',
    transform: [{ scale: 1.08 }],
  },
});
