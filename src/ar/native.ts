import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import type { ARStatus, DebugState, Stroke } from '@/types';

export type SpatialARNativeProps = ViewProps & {
  color: string;
  onStatusChange?: (event: { nativeEvent: ARStatus }) => void;
  onStrokeCompleted?: (event: { nativeEvent: Stroke }) => void;
};

type SpatialARModule = {
  startDiscovery(): Promise<void>;
  startNewSite(siteId: string): Promise<void>;
  loadSite(siteId: string, worldMapFileUri: string): Promise<void>;
  exportWorldMap(): Promise<string>;
  captureFeaturePrint(): Promise<string>;
  compareFeaturePrints(first: string, second: string): Promise<number>;
  setDrawingEnabled(enabled: boolean): Promise<void>;
  setRemoteStrokes(strokes: Stroke[]): Promise<void>;
  getDebugState(): Promise<DebugState>;
  resetSession(): Promise<void>;
};

const nativeModule: SpatialARModule | null = (() => {
  try {
    return requireNativeModule<SpatialARModule>('SpatialAR');
  } catch {
    return null;
  }
})();

export function getSpatialAR(): SpatialARModule {
  if (!nativeModule) {
    throw new Error('SpatialAR native module is unavailable. Use an Expo development build, not Expo Go.');
  }
  return nativeModule;
}

export const SpatialARView: ComponentType<SpatialARNativeProps> | null = (() => {
  try {
    return requireNativeViewManager<SpatialARNativeProps>('SpatialAR');
  } catch {
    return null;
  }
})();
