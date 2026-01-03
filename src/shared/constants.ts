/**
 * Shared constants
 */

export const APP_NAME = 'Tilora';

export const DEFAULT_PREFERENCES = {
  modifierKey: 'ctrl' as const,
  theme: 'dark' as const,
  defaultUrl: 'https://www.google.com',
  minTileWidth: 200,
  minTileHeight: 150,
};

export const WINDOW_CONFIG = {
  minWidth: 800,
  minHeight: 600,
  defaultWidth: 1280,
  defaultHeight: 800,
  toolbarHeight: 52, // Extra margin to ensure toolbar is fully visible
};

export const LAYOUT_CONFIG = {
  borderWidth: 1,
  focusBorderWidth: 2,
  resizeHandleSize: 8,
  defaultSplitRatio: 0.5,
};

export const TILE_LIFECYCLE = {
  // Minimum dimensions before a tile is considered too small and put to sleep
  sleepThresholdWidth: 200,
  sleepThresholdHeight: 150,
  // Time in ms of inactivity before sleeping unfocused tiles (0 = disabled)
  sleepAfterInactiveMs: 0,
  // Snapshot quality (0-100)
  snapshotQuality: 80,
};

export const COLORS = {
  border: '#3a3a3a',
  focusBorder: '#0078d4',
  background: '#1e1e1e',
  surface: '#252526',
  text: '#cccccc',
  textMuted: '#808080',
};
