export type Vec3 = [number, number, number];

export type Stroke = {
  id: string;
  siteId: string;
  color: string;
  widthM: number;
  points: Vec3[];
  createdAt: string;
};

export type ARStatus = {
  tracking: 'notAvailable' | 'limited' | 'normal';
  trackingReason?: string;
  mapping: 'notAvailable' | 'limited' | 'extending' | 'mapped';
  mode: 'starting' | 'newSite' | 'relocalizing' | 'ready' | 'failed';
  siteId?: string;
  rootAnchorReady: boolean;
  drawingEnabled: boolean;
};

export type DebugState = ARStatus & {
  strokeCount: number;
  hasWorldMap: boolean;
};

export const SPATIAL_AR_MODULE_NAME = 'SpatialAR';
