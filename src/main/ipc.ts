import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { ViewManager } from './view-manager';
import { NavigationState } from '@shared/types';

export function setupIpcHandlers(window: BrowserWindow, viewManager: ViewManager): void {
  // Navigation handlers
  ipcMain.handle(IPC_CHANNELS.NAVIGATE_TO, (_event, tileId: string, url: string) => {
    return viewManager.navigateTo(tileId, url);
  });

  ipcMain.handle(IPC_CHANNELS.NAVIGATE_BACK, (_event, tileId: string) => {
    return viewManager.goBack(tileId);
  });

  ipcMain.handle(IPC_CHANNELS.NAVIGATE_FORWARD, (_event, tileId: string) => {
    return viewManager.goForward(tileId);
  });

  ipcMain.handle(IPC_CHANNELS.RELOAD, (_event, tileId: string) => {
    return viewManager.reload(tileId);
  });

  // Tile management
  ipcMain.handle(IPC_CHANNELS.CREATE_TILE, (_event, url?: string) => {
    return viewManager.createView(url);
  });

  ipcMain.handle(IPC_CHANNELS.CLOSE_TILE, (_event, tileId: string) => {
    return viewManager.closeView(tileId);
  });

  ipcMain.handle(IPC_CHANNELS.FOCUS_TILE, (_event, tileId: string) => {
    return viewManager.focusView(tileId);
  });

  // Audio
  ipcMain.handle(IPC_CHANNELS.TOGGLE_MUTE, (_event, tileId: string) => {
    return viewManager.toggleMute(tileId);
  });

  // Window info
  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_BOUNDS, () => {
    const size = window.getContentSize();
    return { width: size[0] ?? 800, height: size[1] ?? 600 };
  });

  // Get current state
  ipcMain.handle(IPC_CHANNELS.GET_STATE, () => {
    const tiles = viewManager.getAllViews().map((v) => v.tile);
    const focusedTileId = viewManager.getFocusedViewId();
    return { tiles, focusedTileId };
  });

  // Setup callbacks to send events to renderer
  viewManager.setCallbacks({
    onNavigationChange: (tileId: string, state: NavigationState) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.NAVIGATION_STATE_CHANGED, tileId, state);
      }
    },
    onTitleChange: (tileId: string, title: string) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.TILE_UPDATED, { tileId, title });
      }
    },
    onFaviconChange: (tileId: string, favicons: string[]) => {
      if (!window.isDestroyed() && favicons[0]) {
        window.webContents.send(IPC_CHANNELS.TILE_UPDATED, { tileId, favicon: favicons[0] });
      }
    },
  });
}
