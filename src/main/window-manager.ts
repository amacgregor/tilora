/**
 * WindowManager - Manages multiple application windows
 * Each window has its own isolated set of workspaces
 */

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import { APP_NAME, WINDOW_CONFIG } from '@shared/constants';
import {
  loadAppState,
  saveAppState,
  registerWindow,
  deleteWindowState,
  getAllWindowIds,
} from './persistence';
import { generateWindowId, AppState, WindowGeometry } from '@shared/workspace';
import { overlayManager } from './overlay-manager';
import type { OverlayUpdatePayload } from '@shared/overlay-types';

/**
 * Context for a managed window
 */
export interface WindowContext {
  id: string;
  window: BrowserWindow;
  appState: AppState;
}

/**
 * Manages multiple application windows
 */
export class WindowManager {
  private windows: Map<string, WindowContext> = new Map();
  private geometrySaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private onMenuCommand: ((channel: string, ...args: unknown[]) => void) | null = null;

  /**
   * Set a callback for menu commands that should be sent to renderer
   */
  setMenuCommandHandler(handler: (channel: string, ...args: unknown[]) => void): void {
    this.onMenuCommand = handler;
  }

  /**
   * Create a new window
   * @param windowId Optional ID for the window (for restoring existing windows)
   * @returns The created window context
   */
  createWindow(windowId?: string): WindowContext {
    const id = windowId || generateWindowId();
    const appState = loadAppState(id);

    // Determine window geometry
    const geometry = this.getValidGeometry(appState.geometry);

    const window = new BrowserWindow({
      width: geometry.width,
      height: geometry.height,
      x: geometry.x,
      y: geometry.y,
      minWidth: WINDOW_CONFIG.minWidth,
      minHeight: WINDOW_CONFIG.minHeight,
      title: APP_NAME,
      backgroundColor: '#1e1e1e',
      fullscreenable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // Increase max listeners to prevent warnings during rapid workspace switching
    // electron-chrome-extensions adds multiple listeners per window
    window.setMaxListeners(25);
    window.webContents.setMaxListeners(25);

    // Set window ID for IPC bridge to identify
    (window as BrowserWindow & { tiloraWindowId: string }).tiloraWindowId = id;

    // Maximize if that was the saved state
    if (geometry.isMaximized) {
      window.maximize();
    }

    // Load the renderer
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    void window.loadFile(rendererPath);

    // Track fullscreen state
    let userTriggeredFullscreen = false;

    // Prevent HTML5 fullscreen from webviews taking over the entire screen
    window.webContents.on('enter-html-full-screen', () => {
      if (!userTriggeredFullscreen && !window.isDestroyed()) {
        setImmediate(() => {
          window?.setFullScreen(false);
        });
      }
    });

    window.on('enter-full-screen', () => {
      if (!userTriggeredFullscreen && !window.isDestroyed()) {
        window.setFullScreen(false);
      }
      userTriggeredFullscreen = false;
    });

    // Save geometry on move/resize (debounced)
    window.on('move', () => this.debouncedSaveGeometry(id));
    window.on('resize', () => this.debouncedSaveGeometry(id));

    // Handle window close
    window.on('closed', () => {
      this.handleWindowClosed(id);
    });

    // Save geometry before close
    window.on('close', () => {
      this.saveWindowGeometry(id);
    });

    // Register window in persistence
    registerWindow(id);

    // Create and store context
    const context: WindowContext = {
      id,
      window,
      appState,
    };

    this.windows.set(id, context);

    // Create overlay window for this window
    window.once('ready-to-show', () => {
      overlayManager.createOverlay(id, window);
    });

    return context;
  }

  /**
   * Close a window by ID
   */
  closeWindow(windowId: string): void {
    const context = this.windows.get(windowId);
    if (context && !context.window.isDestroyed()) {
      context.window.close();
    }
  }

  /**
   * Get window context by ID
   */
  getWindowById(windowId: string): WindowContext | undefined {
    return this.windows.get(windowId);
  }

  /**
   * Get window context by BrowserWindow instance
   */
  getWindowByBrowserWindow(bw: BrowserWindow): WindowContext | undefined {
    for (const context of this.windows.values()) {
      if (context.window === bw) {
        return context;
      }
    }
    return undefined;
  }

  /**
   * Get the currently focused window context
   */
  getFocusedWindow(): WindowContext | null {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused) {
      return this.getWindowByBrowserWindow(focused) || null;
    }
    return null;
  }

  /**
   * Get all window contexts
   */
  getAllWindows(): WindowContext[] {
    return Array.from(this.windows.values());
  }

  /**
   * Get the number of open windows
   */
  getWindowCount(): number {
    return this.windows.size;
  }

  /**
   * Send a message to the focused window's renderer
   */
  sendToFocusedRenderer(channel: string, ...args: unknown[]): void {
    const focused = this.getFocusedWindow();
    if (focused && !focused.window.isDestroyed()) {
      focused.window.webContents.send(channel, ...args);
    }
  }

  /**
   * Send a message to a specific window's renderer
   */
  sendToRenderer(windowId: string, channel: string, ...args: unknown[]): void {
    const context = this.windows.get(windowId);
    if (context && !context.window.isDestroyed()) {
      context.window.webContents.send(channel, ...args);
    }
  }

  /**
   * Update overlay tiles for a window
   */
  updateOverlayTiles(windowId: string, payload: OverlayUpdatePayload): void {
    overlayManager.updateTiles(windowId, payload);
  }

  /**
   * Restore all windows from persistence
   * Called on app startup
   */
  restoreAllWindows(): void {
    const windowIds = getAllWindowIds();

    if (windowIds.length === 0) {
      // No saved windows, create a new one
      this.createWindow();
    } else {
      // Restore all saved windows
      for (const windowId of windowIds) {
        this.createWindow(windowId);
      }
    }
  }

  /**
   * Save app state for a window
   */
  saveWindowState(windowId: string, state: AppState): boolean {
    const context = this.windows.get(windowId);
    if (context) {
      context.appState = state;
      return saveAppState(state);
    }
    return false;
  }

  /**
   * Update and save window geometry
   */
  saveWindowGeometry(windowId: string): void {
    const context = this.windows.get(windowId);
    if (!context || context.window.isDestroyed()) return;

    const isMaximized = context.window.isMaximized();
    const bounds = context.window.getBounds();

    const geometry: WindowGeometry = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    };

    context.appState.geometry = geometry;
    saveAppState(context.appState);
  }

  /**
   * Validate and adjust geometry to ensure window is visible on screen
   */
  private getValidGeometry(geometry?: WindowGeometry): WindowGeometry {
    const defaultGeometry: WindowGeometry = {
      width: WINDOW_CONFIG.defaultWidth,
      height: WINDOW_CONFIG.defaultHeight,
    };

    if (!geometry) {
      return defaultGeometry;
    }

    // Get all displays
    const displays = screen.getAllDisplays();

    // Check if the saved position is visible on any display
    if (geometry.x !== undefined && geometry.y !== undefined) {
      const isVisible = displays.some((display) => {
        const { x, y, width, height } = display.bounds;
        // Check if at least part of the window is visible
        return (
          geometry.x! < x + width &&
          geometry.x! + geometry.width > x &&
          geometry.y! < y + height &&
          geometry.y! + geometry.height > y
        );
      });

      if (isVisible) {
        return geometry;
      }
    }

    // Position is invalid or off-screen, use default dimensions but no position
    // (let the OS decide where to place it)
    return {
      width: geometry.width || defaultGeometry.width,
      height: geometry.height || defaultGeometry.height,
      isMaximized: geometry.isMaximized,
    };
  }

  /**
   * Debounced geometry save to avoid excessive disk writes
   */
  private debouncedSaveGeometry(windowId: string): void {
    // Clear existing timer
    const existingTimer = this.geometrySaveTimers.get(windowId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.saveWindowGeometry(windowId);
      this.geometrySaveTimers.delete(windowId);
    }, 500);

    this.geometrySaveTimers.set(windowId, timer);
  }

  /**
   * Handle window closed event
   */
  private handleWindowClosed(windowId: string): void {
    // Clear any pending geometry save timer
    const timer = this.geometrySaveTimers.get(windowId);
    if (timer) {
      clearTimeout(timer);
      this.geometrySaveTimers.delete(windowId);
    }

    // Remove from tracked windows
    this.windows.delete(windowId);

    // Note: We don't delete the window state here, so it can be restored
    // If the user wants to truly close a window and remove its state,
    // that would be a separate "Close and Forget" action
  }

  /**
   * Close all windows (for app quit)
   */
  closeAllWindows(): void {
    for (const context of this.windows.values()) {
      if (!context.window.isDestroyed()) {
        context.window.close();
      }
    }
  }

  /**
   * Delete a window's persisted state
   */
  deleteWindowPersistence(windowId: string): void {
    deleteWindowState(windowId);
  }
}

// Singleton instance
export const windowManager = new WindowManager();
