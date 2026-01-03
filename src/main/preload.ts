import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, Workspace } from '@shared/workspace';

/**
 * Helper to create IPC listener
 */
function createListener(channel: string) {
  return (callback: () => void) => {
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeListener(channel, callback);
  };
}

/**
 * Preload script - exposes IPC to renderer
 */
const api = {
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),

  // Persistence
  loadAppState: () => ipcRenderer.invoke('load-app-state') as Promise<AppState>,
  saveAppState: (state: AppState) => ipcRenderer.invoke('save-app-state', state) as Promise<boolean>,

  // Workspace switching
  onSwitchWorkspace: (callback: (index: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, index: number) => callback(index);
    ipcRenderer.on('switch-workspace', handler);
    return () => ipcRenderer.removeListener('switch-workspace', handler);
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
};

contextBridge.exposeInMainWorld('tilora', api);
