import { contextBridge, ipcRenderer } from 'electron';
import type { AppState } from '@shared/workspace';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type {
  CreateTileRequest,
  CreateTileResponse,
  BoundsUpdate,
  NavigateRequest,
  MuteRequest,
  NavigationStateUpdate,
  AudioStateUpdate,
  ErrorUpdate,
  FaviconUpdate,
  FullscreenUpdate,
  FocusUpdate,
  SnapshotResponse,
} from '@shared/tile-ipc';
import type { OverlayUpdatePayload } from '@shared/overlay-types';

/**
 * Helper to create IPC listener
 */
function createListener(channel: string): (callback: () => void) => () => void {
  return (callback: () => void): (() => void) => {
    ipcRenderer.on(channel, callback);
    return (): void => { ipcRenderer.removeListener(channel, callback); };
  };
}

/**
 * Helper to create typed IPC listener
 */
function createTypedListener<T>(channel: string): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: T): void => { callback(data); };
    ipcRenderer.on(channel, handler);
    return (): void => { ipcRenderer.removeListener(channel, handler); };
  };
}

/**
 * Preload script - exposes IPC to renderer
 */
const api = {
  getWindowBounds: async (): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('get-window-bounds') as Promise<{ width: number; height: number }>,
  getWindowId: async (): Promise<string | null> =>
    ipcRenderer.invoke('get-window-id') as Promise<string | null>,

  // Persistence
  loadAppState: async (): Promise<AppState> =>
    ipcRenderer.invoke('load-app-state') as Promise<AppState>,
  saveAppState: async (state: AppState): Promise<boolean> =>
    ipcRenderer.invoke('save-app-state', state) as Promise<boolean>,

  // Fullscreen control
  exitWindowFullscreen: async (): Promise<void> =>
    ipcRenderer.invoke('exit-window-fullscreen') as Promise<void>,

  // Workspace switching
  onSwitchWorkspace: (callback: (index: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, index: number): void => { callback(index); };
    ipcRenderer.on('switch-workspace', handler);
    return (): void => { ipcRenderer.removeListener('switch-workspace', handler); };
  },
  onNewWorkspace: createListener('new-workspace'),

  // Listen for commands from main process menu
  onSplitVertical: createListener('split-vertical'),
  onSplitHorizontal: createListener('split-horizontal'),
  onCloseTile: createListener('close-tile'),
  onFocusUrlBar: createListener('focus-url-bar'),
  onReloadTile: createListener('reload-tile'),
  onGoBack: createListener('go-back'),
  onGoForward: createListener('go-forward'),

  // Directional focus navigation
  onFocusLeft: createListener('focus-left'),
  onFocusRight: createListener('focus-right'),
  onFocusUp: createListener('focus-up'),
  onFocusDown: createListener('focus-down'),

  // Tile swapping
  onSwapLeft: createListener('swap-left'),
  onSwapRight: createListener('swap-right'),
  onSwapUp: createListener('swap-up'),
  onSwapDown: createListener('swap-down'),

  // Directional resize
  onResizeLeft: createListener('resize-left'),
  onResizeRight: createListener('resize-right'),
  onResizeUp: createListener('resize-up'),
  onResizeDown: createListener('resize-down'),

  // Audio controls
  onToggleMute: createListener('toggle-mute'),
  onMuteAllExceptFocused: createListener('mute-all-except-focused'),
  onUnmuteAll: createListener('unmute-all'),

  // Open link in new tile (middle-click)
  onOpenInNewTile: (callback: (data: { url: string; focusNew: boolean }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string; focusNew: boolean }): void => {
      callback(data);
    };
    ipcRenderer.on('open-in-new-tile', handler);
    return (): void => { ipcRenderer.removeListener('open-in-new-tile', handler); };
  },

  // Tile Views API (WebContentsView-based)
  tiles: {
    // Lifecycle
    create: async (url?: string): Promise<CreateTileResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_CREATE, { url } as CreateTileRequest) as Promise<CreateTileResponse>,

    destroy: async (tileId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_DESTROY, tileId) as Promise<boolean>,

    // Bounds
    setBounds: async (updates: BoundsUpdate[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_SET_BOUNDS, updates) as Promise<void>,

    // Navigation
    navigate: async (id: string, url: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_NAVIGATE, { id, url } as NavigateRequest) as Promise<boolean>,

    goBack: async (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_GO_BACK, id) as Promise<boolean>,

    goForward: async (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_GO_FORWARD, id) as Promise<boolean>,

    reload: async (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_RELOAD, id) as Promise<boolean>,

    stop: async (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_STOP, id) as Promise<boolean>,

    // State
    setMuted: async (id: string, muted: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_SET_MUTED, { id, muted } as MuteRequest) as Promise<boolean>,

    focus: async (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_FOCUS, id) as Promise<boolean>,

    capture: async (id: string): Promise<SnapshotResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.TILE_VIEW_CAPTURE, id) as Promise<SnapshotResponse>,

    // Event listeners
    onNavigationState: createTypedListener<NavigationStateUpdate>(IPC_CHANNELS.TILE_VIEW_NAVIGATION_STATE),
    onTitleUpdated: createTypedListener<{ tileId: string; title: string }>(IPC_CHANNELS.TILE_VIEW_TITLE_UPDATED),
    onAudioState: createTypedListener<AudioStateUpdate>(IPC_CHANNELS.TILE_VIEW_AUDIO_STATE),
    onLoadError: createTypedListener<ErrorUpdate>(IPC_CHANNELS.TILE_VIEW_LOAD_ERROR),
    onFocused: createTypedListener<FocusUpdate>(IPC_CHANNELS.TILE_VIEW_FOCUSED),
    onFullscreen: createTypedListener<FullscreenUpdate>(IPC_CHANNELS.TILE_VIEW_FULLSCREEN),
    onFavicon: createTypedListener<FaviconUpdate>(IPC_CHANNELS.TILE_VIEW_FAVICON),
    onCreated: createTypedListener<CreateTileResponse>(IPC_CHANNELS.TILE_VIEW_CREATED),
  },

  // Overlay API
  overlay: {
    updateTiles: async (payload: OverlayUpdatePayload): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERLAY_UPDATE_TILES, payload) as Promise<void>,

    onToggleMute: (callback: (tileId: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tileId: string): void => {
        callback(tileId);
      };
      ipcRenderer.on(IPC_CHANNELS.OVERLAY_TOGGLE_MUTE, handler);
      return (): void => {
        ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_TOGGLE_MUTE, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('tilora', api);
