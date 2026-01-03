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
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
