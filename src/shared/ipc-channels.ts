/**
 * IPC channel definitions for main <-> renderer communication
 */

export const IPC_CHANNELS = {
  // Navigation
  NAVIGATE_TO: 'navigate-to',
  NAVIGATE_BACK: 'navigate-back',
  NAVIGATE_FORWARD: 'navigate-forward',
  RELOAD: 'reload',
  NAVIGATION_STATE_CHANGED: 'navigation-state-changed',

  // Tile management
  CREATE_TILE: 'create-tile',
  CLOSE_TILE: 'close-tile',
  FOCUS_TILE: 'focus-tile',
  TILE_UPDATED: 'tile-updated',

  // Layout
  SPLIT_TILE: 'split-tile',
  RESIZE_SPLIT: 'resize-split',
  SWAP_TILES: 'swap-tiles',
  LAYOUT_CHANGED: 'layout-changed',

  // Workspace
  CREATE_WORKSPACE: 'create-workspace',
  SWITCH_WORKSPACE: 'switch-workspace',
  DELETE_WORKSPACE: 'delete-workspace',
  RENAME_WORKSPACE: 'rename-workspace',
  WORKSPACE_CHANGED: 'workspace-changed',
  WORKSPACES_LIST: 'workspaces-list',

  // Audio
  TOGGLE_MUTE: 'toggle-mute',
  MUTE_ALL_EXCEPT: 'mute-all-except',
  AUDIO_STATE_CHANGED: 'audio-state-changed',

  // App state
  GET_STATE: 'get-state',
  STATE_CHANGED: 'state-changed',
  SAVE_STATE: 'save-state',

  // Window
  WINDOW_RESIZED: 'window-resized',
  GET_WINDOW_BOUNDS: 'get-window-bounds',

  // Tile Views (WebContentsView-based) - Renderer -> Main
  TILE_VIEW_CREATE: 'tile-view:create',
  TILE_VIEW_DESTROY: 'tile-view:destroy',
  TILE_VIEW_SET_BOUNDS: 'tile-view:set-bounds',
  TILE_VIEW_NAVIGATE: 'tile-view:navigate',
  TILE_VIEW_GO_BACK: 'tile-view:go-back',
  TILE_VIEW_GO_FORWARD: 'tile-view:go-forward',
  TILE_VIEW_RELOAD: 'tile-view:reload',
  TILE_VIEW_STOP: 'tile-view:stop',
  TILE_VIEW_SET_MUTED: 'tile-view:set-muted',
  TILE_VIEW_FOCUS: 'tile-view:focus',
  TILE_VIEW_CAPTURE: 'tile-view:capture',

  // Tile Views - Main -> Renderer (Events)
  TILE_VIEW_CREATED: 'tile-view:created',
  TILE_VIEW_NAVIGATION_STATE: 'tile-view:navigation-state',
  TILE_VIEW_TITLE_UPDATED: 'tile-view:title-updated',
  TILE_VIEW_AUDIO_STATE: 'tile-view:audio-state',
  TILE_VIEW_LOAD_ERROR: 'tile-view:load-error',
  TILE_VIEW_FOCUSED: 'tile-view:focused',
  TILE_VIEW_FULLSCREEN: 'tile-view:fullscreen',
  TILE_VIEW_FAVICON: 'tile-view:favicon',

  // Overlay window
  OVERLAY_UPDATE_TILES: 'overlay:update-tiles',
  OVERLAY_TOGGLE_MUTE: 'overlay:toggle-mute',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
