import { contextBridge, ipcRenderer } from 'electron';

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

  // Resize
  onResizeGrow: createListener('resize-grow'),
  onResizeShrink: createListener('resize-shrink'),
};

contextBridge.exposeInMainWorld('tilora', api);
