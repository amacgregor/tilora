/**
 * Type declarations for the tilora API exposed via preload
 */

import type { AppState } from '../../shared/workspace';
import type {
  BoundsUpdate,
  CreateTileResponse,
  NavigationStateUpdate,
  AudioStateUpdate,
  ErrorUpdate,
  FaviconUpdate,
  FullscreenUpdate,
  FocusUpdate,
  SnapshotResponse,
} from '../../shared/tile-ipc';
import type { OverlayUpdatePayload } from '../../shared/overlay-types';

/**
 * Tile Views API for WebContentsView-based tiles
 */
interface TilesAPI {
  // Lifecycle
  create: (url?: string) => Promise<CreateTileResponse>;
  destroy: (tileId: string) => Promise<boolean>;

  // Bounds
  setBounds: (updates: BoundsUpdate[]) => Promise<void>;

  // Navigation
  navigate: (id: string, url: string) => Promise<boolean>;
  goBack: (id: string) => Promise<boolean>;
  goForward: (id: string) => Promise<boolean>;
  reload: (id: string) => Promise<boolean>;
  stop: (id: string) => Promise<boolean>;

  // State
  setMuted: (id: string, muted: boolean) => Promise<boolean>;
  focus: (id: string) => Promise<boolean>;
  capture: (id: string) => Promise<SnapshotResponse>;

  // Event listeners (return unsubscribe function)
  onNavigationState: (callback: (data: NavigationStateUpdate) => void) => () => void;
  onTitleUpdated: (callback: (data: { tileId: string; title: string }) => void) => () => void;
  onAudioState: (callback: (data: AudioStateUpdate) => void) => () => void;
  onLoadError: (callback: (data: ErrorUpdate) => void) => () => void;
  onFocused: (callback: (data: FocusUpdate) => void) => () => void;
  onFullscreen: (callback: (data: FullscreenUpdate) => void) => () => void;
  onFavicon: (callback: (data: FaviconUpdate) => void) => () => void;
  onCreated: (callback: (data: CreateTileResponse) => void) => () => void;
}

interface TiloraAPI {
  getWindowBounds: () => Promise<{ width: number; height: number }>;

  // Persistence
  loadAppState: () => Promise<AppState>;
  saveAppState: (state: AppState) => Promise<boolean>;

  // Fullscreen control
  exitWindowFullscreen: () => Promise<void>;

  // Workspace switching
  onSwitchWorkspace: (callback: (index: number) => void) => () => void;
  onNewWorkspace: (callback: () => void) => () => void;

  onSplitVertical: (callback: () => void) => () => void;
  onSplitHorizontal: (callback: () => void) => () => void;
  onCloseTile: (callback: () => void) => () => void;
  onFocusUrlBar: (callback: () => void) => () => void;
  onReloadTile: (callback: () => void) => () => void;
  onGoBack: (callback: () => void) => () => void;
  onGoForward: (callback: () => void) => () => void;

  // Directional focus navigation
  onFocusLeft: (callback: () => void) => () => void;
  onFocusRight: (callback: () => void) => () => void;
  onFocusUp: (callback: () => void) => () => void;
  onFocusDown: (callback: () => void) => () => void;

  // Tile swapping
  onSwapLeft: (callback: () => void) => () => void;
  onSwapRight: (callback: () => void) => () => void;
  onSwapUp: (callback: () => void) => () => void;
  onSwapDown: (callback: () => void) => () => void;

  // Directional resize
  onResizeLeft: (callback: () => void) => () => void;
  onResizeRight: (callback: () => void) => () => void;
  onResizeUp: (callback: () => void) => () => void;
  onResizeDown: (callback: () => void) => () => void;

  // Audio controls
  onToggleMute: (callback: () => void) => () => void;
  onMuteAllExceptFocused: (callback: () => void) => () => void;
  onUnmuteAll: (callback: () => void) => () => void;

  // Tile Views API (WebContentsView-based)
  tiles: TilesAPI;

  // Overlay API
  overlay: OverlayAPI;
}

/**
 * Overlay API for transparent overlay window
 */
interface OverlayAPI {
  updateTiles: (payload: OverlayUpdatePayload) => Promise<void>;
  onToggleMute: (callback: (tileId: string) => void) => () => void;
}

declare global {
  interface Window {
    tilora: TiloraAPI;
  }
}

export {};
