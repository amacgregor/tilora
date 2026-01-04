/**
 * IPC Bridge for Tile View operations
 *
 * Registers IPC handlers that connect renderer requests to TileViewManager
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { tileViewManager } from './tile-view-manager';
import type {
  CreateTileRequest,
  CreateTileResponse,
  BoundsUpdate,
  NavigateRequest,
  MuteRequest,
  SnapshotResponse,
} from '@shared/tile-ipc';

/**
 * Get window ID from the sender
 */
function getWindowId(event: Electron.IpcMainInvokeEvent): string | null {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (!browserWindow) return null;

  // The window ID is stored on the BrowserWindow by WindowManager
  // We need to access it through a custom property
  return (browserWindow as BrowserWindow & { tiloraWindowId?: string }).tiloraWindowId || null;
}

/**
 * Register all tile-related IPC handlers
 */
export function registerTileIpcHandlers(): void {
  // Create tile
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_CREATE,
    (event, request: CreateTileRequest): CreateTileResponse => {
      try {
        const windowId = request.windowId || getWindowId(event);
        if (!windowId) {
          return { tileId: '', success: false, error: 'Window not found' };
        }

        const tileId = tileViewManager.createView(windowId, request.url);
        return { tileId, success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { tileId: '', success: false, error: message };
      }
    }
  );

  // Destroy tile
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_DESTROY,
    (_event, tileId: string): boolean => {
      return tileViewManager.destroyView(tileId);
    }
  );

  // Set bounds (batch)
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_SET_BOUNDS,
    (_event, updates: BoundsUpdate[]): void => {
      tileViewManager.batchSetBounds(updates);
    }
  );

  // Navigate
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_NAVIGATE,
    (_event, request: NavigateRequest): boolean => {
      return tileViewManager.navigate(request.id, request.url);
    }
  );

  // Go back
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_GO_BACK,
    (_event, tileId: string): boolean => {
      return tileViewManager.goBack(tileId);
    }
  );

  // Go forward
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_GO_FORWARD,
    (_event, tileId: string): boolean => {
      return tileViewManager.goForward(tileId);
    }
  );

  // Reload
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_RELOAD,
    (_event, tileId: string): boolean => {
      return tileViewManager.reload(tileId);
    }
  );

  // Stop
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_STOP,
    (_event, tileId: string): boolean => {
      return tileViewManager.stop(tileId);
    }
  );

  // Set muted
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_SET_MUTED,
    (_event, request: MuteRequest): boolean => {
      return tileViewManager.setMuted(request.id, request.muted);
    }
  );

  // Focus
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_FOCUS,
    (_event, tileId: string): boolean => {
      return tileViewManager.focus(tileId);
    }
  );

  // Capture snapshot
  ipcMain.handle(
    IPC_CHANNELS.TILE_VIEW_CAPTURE,
    async (_event, tileId: string): Promise<SnapshotResponse> => {
      const dataUrl = await tileViewManager.captureSnapshot(tileId);
      return { tileId, dataUrl };
    }
  );
}
