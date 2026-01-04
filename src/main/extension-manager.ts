/**
 * ExtensionManager - Manages Chrome extension support via electron-chrome-extensions
 *
 * Integrates Chrome extensions with Tilora's tile-based browsing.
 */

import { app, session, BrowserWindow } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import * as path from 'path';
import * as fs from 'fs';
import { tileViewManager } from './tile-view-manager';

// Extension session partition
const EXTENSION_PARTITION = 'persist:tilora';

/**
 * Manages Chrome extension lifecycle and integration
 */
export class ExtensionManager {
  private extensions: ElectronChromeExtensions | null = null;
  private extensionSession: Electron.Session | null = null;
  private windowGetter: ((id: string) => BrowserWindow | null) | null = null;

  /**
   * Initialize extension support
   */
  async initialize(): Promise<void> {
    // Get the extension-enabled session (same one used by TileViewManager)
    this.extensionSession = session.fromPartition(EXTENSION_PARTITION);

    // Create the extension handler
    this.extensions = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: this.extensionSession,

      // Handle chrome.tabs.create
      createTab: async (details) => {
        // Find an active window
        const windows = BrowserWindow.getAllWindows();
        const targetWindow = windows.find(w => !w.isDestroyed()) || null;

        if (!targetWindow) {
          throw new Error('No window available for new tab');
        }

        // Get window ID
        const windowId = this.getWindowIdForBrowserWindow(targetWindow);
        if (!windowId) {
          throw new Error('Window not registered');
        }

        // Create a new tile
        const tileId = tileViewManager.createView(windowId, details.url);
        const webContents = tileViewManager.getWebContents(tileId);

        if (!webContents) {
          throw new Error('Failed to create tab');
        }

        return [webContents, targetWindow];
      },

      // Handle chrome.tabs.update (select tab)
      selectTab: (tab, window) => {
        const tileId = tileViewManager.findTileByWebContents(tab);
        if (tileId) {
          tileViewManager.focus(tileId);
        }
      },

      // Handle chrome.tabs.remove
      removeTab: (tab, window) => {
        const tileId = tileViewManager.findTileByWebContents(tab);
        if (tileId) {
          tileViewManager.destroyView(tileId);
        }
      },
    });

    // Handle crx:// protocol for browser action icons
    ElectronChromeExtensions.handleCRXProtocol(this.extensionSession);

    // Load installed extensions
    await this.loadInstalledExtensions();

    console.log('[ExtensionManager] Initialized');
  }

  /**
   * Set the window getter function
   */
  setWindowGetter(getter: (id: string) => BrowserWindow | null): void {
    this.windowGetter = getter;
  }

  /**
   * Get window ID for a BrowserWindow (reverse lookup)
   */
  private getWindowIdForBrowserWindow(window: BrowserWindow): string | null {
    // Read the tiloraWindowId property set by WindowManager
    const tiloraWindow = window as BrowserWindow & { tiloraWindowId?: string };
    return tiloraWindow.tiloraWindowId || null;
  }

  /**
   * Register a tile with the extension system
   */
  registerTile(tileId: string, windowId: string): void {
    if (!this.extensions) return;

    const webContents = tileViewManager.getWebContents(tileId);
    const window = this.windowGetter?.(windowId);

    if (webContents && window) {
      this.extensions.addTab(webContents, window);
    }
  }

  /**
   * Unregister a tile from the extension system
   */
  unregisterTile(tileId: string): void {
    if (!this.extensions) return;

    const webContents = tileViewManager.getWebContents(tileId);
    if (webContents && !webContents.isDestroyed()) {
      try {
        this.extensions.removeTab(webContents);
      } catch (err) {
        // Ignore errors when removing destroyed tabs
        console.log('[ExtensionManager] Tab already removed or destroyed');
      }
    }
  }

  /**
   * Notify extension system that active tab changed
   */
  selectTile(tileId: string): void {
    if (!this.extensions) return;

    const webContents = tileViewManager.getWebContents(tileId);
    if (webContents) {
      this.extensions.selectTab(webContents);
    }
  }

  /**
   * Load an extension from a directory path
   */
  async loadExtension(extensionPath: string): Promise<Electron.Extension | null> {
    if (!this.extensionSession) return null;

    try {
      // Use new API if available, fallback to deprecated
      let extension: Electron.Extension;
      if (this.extensionSession.extensions?.loadExtension) {
        extension = await this.extensionSession.extensions.loadExtension(extensionPath, {
          allowFileAccess: true,
        });
      } else {
        extension = await this.extensionSession.loadExtension(extensionPath, {
          allowFileAccess: true,
        });
      }
      console.log(`[ExtensionManager] Loaded extension: ${extension.name}`);
      return extension;
    } catch (error) {
      console.error(`[ExtensionManager] Failed to load extension from ${extensionPath}:`, error);
      return null;
    }
  }

  /**
   * Get all loaded extensions
   */
  getLoadedExtensions(): Electron.Extension[] {
    if (!this.extensionSession) return [];
    // Use new API if available, fallback to deprecated
    if (this.extensionSession.extensions?.getAllExtensions) {
      return this.extensionSession.extensions.getAllExtensions();
    }
    return this.extensionSession.getAllExtensions();
  }

  /**
   * Load extensions from the default extensions directory
   */
  private async loadInstalledExtensions(): Promise<void> {
    const extensionsDir = path.join(app.getPath('userData'), 'extensions');

    // Create extensions directory if it doesn't exist
    if (!fs.existsSync(extensionsDir)) {
      fs.mkdirSync(extensionsDir, { recursive: true });
      return;
    }

    // Load each subdirectory as an extension
    const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extPath = path.join(extensionsDir, entry.name);
        // Check if it has a manifest.json
        if (fs.existsSync(path.join(extPath, 'manifest.json'))) {
          await this.loadExtension(extPath);
        }
      }
    }
  }

  /**
   * Get context menu items for an extension
   */
  getContextMenuItems(webContents: Electron.WebContents, params: Electron.ContextMenuParams): Electron.MenuItem[] {
    if (!this.extensions) return [];
    return this.extensions.getContextMenuItems(webContents, params);
  }

  /**
   * Get the extension session
   */
  getSession(): Electron.Session | null {
    return this.extensionSession;
  }
}

// Singleton instance
export const extensionManager = new ExtensionManager();
