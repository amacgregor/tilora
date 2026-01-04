/**
 * Types for the overlay window system
 */

import type { Bounds } from './tile-ipc';

/**
 * Tile state for overlay rendering
 */
export interface OverlayTileState {
  id: string;
  bounds: Bounds;
  isFocused: boolean;
  isAudioPlaying: boolean;
  isMuted: boolean;
}

/**
 * Full overlay update payload
 */
export interface OverlayUpdatePayload {
  tiles: OverlayTileState[];
  focusedTileId: string | null;
}
