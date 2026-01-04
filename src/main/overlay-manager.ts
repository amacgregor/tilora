/**
 * OverlayManager - Manages transparent overlay windows for tile indicators
 *
 * Creates a frameless, transparent window that floats over the main window
 * to display focus borders and audio indicators on top of WebContentsViews.
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import * as path from 'path';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { OverlayUpdatePayload } from '@shared/overlay-types';

// Check if we're on Linux - transparent windows may not work well
const isLinux = process.platform === 'linux';

interface ManagedOverlay {
  window: BrowserWindow;
  parentId: number;
}

export class OverlayManager {
  private overlays: Map<string, ManagedOverlay> = new Map(); // windowId -> overlay

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * Create an overlay window for a parent window
   * Note: On Linux, transparent windows may not work properly without compositing
   */
  createOverlay(windowId: string, parent: BrowserWindow): BrowserWindow | null {
    // On Linux, transparent windows often don't work properly
    // Skip creating overlay and log a message
    if (isLinux) {
      console.log('Overlay window disabled on Linux due to transparency limitations');
      return null;
    }

    const parentBounds = parent.getBounds();

    // Note: Don't set backgroundColor when transparent is true
    const overlay = new BrowserWindow({
      x: parentBounds.x,
      y: parentBounds.y,
      width: parentBounds.width,
      height: parentBounds.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: false,
      parent: parent,
      modal: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'overlay-preload.js'),
      },
    });

    // Make clicks pass through transparent areas
    overlay.setIgnoreMouseEvents(true, { forward: true });

    // Load overlay HTML
    const overlayPath = path.join(__dirname, '../renderer/overlay.html');
    void overlay.loadFile(overlayPath);

    // Show when ready
    overlay.once('ready-to-show', () => {
      overlay.showInactive();
    });

    // Track overlay
    this.overlays.set(windowId, {
      window: overlay,
      parentId: parent.id,
    });

    // Sync position/size with parent
    this.setupParentSync(windowId, parent, overlay);

    return overlay;
  }

  /**
   * Destroy overlay for a window
   */
  destroyOverlay(windowId: string): void {
    const managed = this.overlays.get(windowId);
    if (managed && !managed.window.isDestroyed()) {
      managed.window.close();
    }
    this.overlays.delete(windowId);
  }

  /**
   * Get overlay for a window
   */
  getOverlay(windowId: string): BrowserWindow | null {
    const managed = this.overlays.get(windowId);
    return managed?.window || null;
  }

  /**
   * Update tile states in overlay
   */
  updateTiles(windowId: string, payload: OverlayUpdatePayload): void {
    const overlay = this.getOverlay(windowId);
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE_TILES, payload);
    }
  }

  /**
   * Setup sync between parent and overlay windows
   */
  private setupParentSync(
    windowId: string,
    parent: BrowserWindow,
    overlay: BrowserWindow
  ): void {
    const syncBounds = (): void => {
      if (overlay.isDestroyed() || parent.isDestroyed()) return;
      const bounds = parent.getBounds();
      overlay.setBounds(bounds);
    };

    const syncVisibility = (): void => {
      if (overlay.isDestroyed() || parent.isDestroyed()) return;
      if (parent.isMinimized()) {
        overlay.hide();
      } else {
        overlay.showInactive();
      }
    };

    // Sync on various parent events
    parent.on('move', syncBounds);
    parent.on('resize', syncBounds);
    parent.on('minimize', syncVisibility);
    parent.on('restore', syncVisibility);
    parent.on('show', syncVisibility);
    parent.on('hide', () => {
      if (!overlay.isDestroyed()) overlay.hide();
    });

    // Clean up when parent closes
    parent.on('closed', () => {
      this.destroyOverlay(windowId);
    });
  }

  /**
   * Setup IPC handlers
   */
  private setupIpcHandlers(): void {
    // Handle mute toggle from overlay
    ipcMain.on(IPC_CHANNELS.OVERLAY_TOGGLE_MUTE, (event, tileId: string) => {
      // Find the parent window for this overlay
      for (const managed of this.overlays.values()) {
        if (managed.window.webContents.id === event.sender.id) {
          // Forward to main window
          const parent = BrowserWindow.fromId(managed.parentId);
          if (parent && !parent.isDestroyed()) {
            parent.webContents.send(IPC_CHANNELS.OVERLAY_TOGGLE_MUTE, tileId);
          }
          break;
        }
      }
    });
  }
}

// Singleton instance
export const overlayManager = new OverlayManager();
