export type Vec3 = [number, number, number];

export type Stroke = {
  id: string;
  siteId: string;
  color: string;
  widthM: number;
  points: Vec3[];
  createdAt: string;
};

export type Site = {
  id: string;
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
  createdAt: string;
};

export type NearbySite = Site & {
  distanceM: number;
  strokeCount?: number;
};

export type ARTracking = 'notAvailable' | 'limited' | 'normal';
export type ARMapping = 'notAvailable' | 'limited' | 'extending' | 'mapped';
export type ARMode = 'starting' | 'newSite' | 'relocalizing' | 'ready' | 'failed';

export type ARStatus = {
  tracking: ARTracking;
  trackingReason?: string;
  mapping: ARMapping;
  mode: ARMode;
  siteId?: string;
  rootAnchorReady: boolean;
  drawingEnabled: boolean;
};

export type DebugState = ARStatus & {
  strokeCount: number;
  hasWorldMap: boolean;
};

export type AppPhase =
  | 'starting'
  | 'locating'
  | 'discovering'
  | 'relocalizing'
  | 'choosing'
  | 'mapping'
  | 'ready'
  | 'creating'
  | 'failed';
