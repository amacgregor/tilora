/**
 * IPC message types for tile communication between renderer and main process
 */

/**
 * Bounds for a tile view
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Request to create a new tile
 */
export interface CreateTileRequest {
  url: string;
  windowId?: string;
}

/**
 * Response after creating a tile
 */
export interface CreateTileResponse {
  tileId: string;
  success: boolean;
  error?: string;
}

/**
 * Single bounds update for a tile
 */
export interface BoundsUpdate {
  id: string;
  bounds: Bounds;
}

/**
 * Navigation request
 */
export interface NavigateRequest {
  id: string;
  url: string;
}

/**
 * Mute state change request
 */
export interface MuteRequest {
  id: string;
  muted: boolean;
}

/**
 * Navigation state update (main -> renderer)
 */
export interface NavigationStateUpdate {
  tileId: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

/**
 * Title update (main -> renderer)
 */
export interface TitleUpdate {
  tileId: string;
  title: string;
}

/**
 * Audio state update (main -> renderer)
 */
export interface AudioStateUpdate {
  tileId: string;
  isPlaying: boolean;
}

/**
 * Load error update (main -> renderer)
 */
export interface ErrorUpdate {
  tileId: string;
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
}

/**
 * Fullscreen state update (main -> renderer)
 */
export interface FullscreenUpdate {
  tileId: string;
  isFullscreen: boolean;
}

/**
 * Focus update (main -> renderer)
 */
export interface FocusUpdate {
  tileId: string;
}

/**
 * Favicon update (main -> renderer)
 */
export interface FaviconUpdate {
  tileId: string;
  faviconUrl: string;
}

/**
 * Snapshot response
 */
export interface SnapshotResponse {
  tileId: string;
  dataUrl: string;
}
