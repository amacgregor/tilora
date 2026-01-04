/**
 * TileViewManager - Manages WebContentsView instances for tiles
 *
 * This replaces the webview-based approach with main-process controlled views.
 * Requires Electron 29+ for WebContentsView support.
 */

import { WebContentsView, BrowserWindow, session } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import type {
  Bounds,
  NavigationStateUpdate,
  AudioStateUpdate,
  ErrorUpdate,
  FaviconUpdate,
} from '@shared/tile-ipc';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import { DEFAULT_PREFERENCES, WINDOW_CONFIG } from '@shared/constants';

// Extension registration callback type
type ExtensionCallback = {
  onTileCreated?: (tileId: string, windowId: string) => void;
  onTileDestroyed?: (tileId: string) => void;
  onTileFocused?: (tileId: string) => void;
};

/**
 * Internal representation of a managed tile view
 */
interface ManagedTileView {
  id: string;
  view: WebContentsView;
  windowId: string;
  bounds: Bounds;
  url: string;
  title: string;
  isMuted: boolean;
  isAudioPlaying: boolean;
  isLoading: boolean;
}

// Check if we're on Linux - need injected CSS indicators instead of overlay
const isLinux = process.platform === 'linux';

/**
 * Session partition for extension support
 */
const EXTENSION_PARTITION = 'persist:tilora';

/**
 * Manages WebContentsView instances for all windows
 */
export class TileViewManager {
  private views: Map<string, ManagedTileView> = new Map();
  private windowViews: Map<string, Set<string>> = new Map(); // windowId -> tileIds
  private lastFocusedId: Map<string, string> = new Map(); // windowId -> tileId
  private extensionCallbacks: ExtensionCallback = {};

  /**
   * Get or create the extension-enabled session
   */
  getSession(): Electron.Session {
    return session.fromPartition(EXTENSION_PARTITION);
  }

  /**
   * Create a new tile view
   */
  createView(windowId: string, url?: string): string {
    const window = this.getWindow(windowId);
    if (!window) {
      throw new Error(`Window not found: ${windowId}`);
    }

    const id = uuidv4();
    const initialUrl = url || DEFAULT_PREFERENCES.defaultUrl;

    // Get the extension preload script path (must be absolute)
    let extensionPreload: string | undefined;
    try {
      const preloadPath = require.resolve('electron-chrome-extensions/preload');
      extensionPreload = path.isAbsolute(preloadPath) ? preloadPath : path.resolve(preloadPath);
    } catch {
      console.warn('[TileViewManager] Could not resolve extension preload script');
    }

    // Create WebContentsView with extension-enabled session
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        session: this.getSession(),
        preload: extensionPreload,
      },
    });

    const managedView: ManagedTileView = {
      id,
      view,
      windowId,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      url: initialUrl,
      title: 'New Tab',
      isMuted: false,
      isAudioPlaying: false,
      isLoading: false,
    };

    this.views.set(id, managedView);

    // Track views per window
    if (!this.windowViews.has(windowId)) {
      this.windowViews.set(windowId, new Set());
    }
    this.windowViews.get(windowId)!.add(id);

    // Add to window's content view
    window.contentView.addChildView(view);

    // Setup event listeners
    this.setupViewEvents(managedView);

    // Load the URL
    void view.webContents.loadURL(initialUrl);

    // Notify renderer
    window.webContents.send(IPC_CHANNELS.TILE_VIEW_CREATED, { tileId: id, success: true });

    // Notify extension system
    this.extensionCallbacks.onTileCreated?.(id, windowId);

    return id;
  }

  /**
   * Destroy a tile view
   */
  destroyView(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    // Notify extension system before destroying
    this.extensionCallbacks.onTileDestroyed?.(id);

    const window = this.getWindow(managedView.windowId);
    if (window && !window.isDestroyed()) {
      window.contentView.removeChildView(managedView.view);
    }

    // Destroy webContents
    if (!managedView.view.webContents.isDestroyed()) {
      managedView.view.webContents.close();
    }

    // Remove from tracking
    this.views.delete(id);
    this.windowViews.get(managedView.windowId)?.delete(id);

    // Update last focused if needed
    if (this.lastFocusedId.get(managedView.windowId) === id) {
      this.lastFocusedId.delete(managedView.windowId);
    }

    return true;
  }

  /**
   * Destroy all views for a window
   */
  destroyAllViewsForWindow(windowId: string): void {
    const viewIds = this.windowViews.get(windowId);
    if (viewIds) {
      for (const id of viewIds) {
        this.destroyView(id);
      }
    }
    this.windowViews.delete(windowId);
    this.lastFocusedId.delete(windowId);
  }

  /**
   * Set bounds for a single tile
   */
  setBounds(id: string, bounds: Bounds): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    managedView.bounds = bounds;
    managedView.view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y + WINDOW_CONFIG.toolbarHeight),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });

    return true;
  }

  /**
   * Batch set bounds for multiple tiles (more efficient)
   */
  batchSetBounds(updates: Array<{ id: string; bounds: Bounds }>): void {
    for (const update of updates) {
      this.setBounds(update.id, update.bounds);
    }
  }

  /**
   * Navigate to a URL
   */
  navigate(id: string, url: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    let finalUrl = url;
    // Add protocol if missing
    if (!url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
      if (url.includes('.') && !url.includes(' ')) {
        finalUrl = `https://${url}`;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }

    void managedView.view.webContents.loadURL(finalUrl);
    return true;
  }

  /**
   * Go back in history
   */
  goBack(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    if (managedView.view.webContents.canGoBack()) {
      managedView.view.webContents.goBack();
      return true;
    }
    return false;
  }

  /**
   * Go forward in history
   */
  goForward(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    if (managedView.view.webContents.canGoForward()) {
      managedView.view.webContents.goForward();
      return true;
    }
    return false;
  }

  /**
   * Reload the page
   */
  reload(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    managedView.view.webContents.reload();
    return true;
  }

  /**
   * Stop loading
   */
  stop(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    managedView.view.webContents.stop();
    return true;
  }

  /**
   * Set muted state
   */
  setMuted(id: string, muted: boolean): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    managedView.isMuted = muted;
    managedView.view.webContents.setAudioMuted(muted);

    // Update audio indicator (Linux only)
    void this.updateAudioIndicator(id, managedView.isAudioPlaying, muted);

    // Notify renderer
    this.emitAudioState(managedView);

    return true;
  }

  /**
   * Focus a tile view
   */
  focus(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    const window = this.getWindow(managedView.windowId);
    if (!window || window.isDestroyed()) return false;

    // Get previously focused tile to unfocus it
    const prevFocusedId = this.lastFocusedId.get(managedView.windowId);

    // Bring to front by reordering child views
    window.contentView.removeChildView(managedView.view);
    window.contentView.addChildView(managedView.view);

    // Focus the webContents
    managedView.view.webContents.focus();

    // Track as last focused
    this.lastFocusedId.set(managedView.windowId, id);

    // Update focus indicators (Linux only)
    if (prevFocusedId && prevFocusedId !== id) {
      void this.updateFocusIndicator(prevFocusedId, false);
    }
    void this.updateFocusIndicator(id, true);

    // Notify renderer
    window.webContents.send(IPC_CHANNELS.TILE_VIEW_FOCUSED, { tileId: id });

    // Notify extension system
    this.extensionCallbacks.onTileFocused?.(id);

    return true;
  }

  /**
   * Capture a snapshot of the tile
   */
  async captureSnapshot(id: string): Promise<string> {
    const managedView = this.views.get(id);
    if (!managedView) return '';

    try {
      const image = await managedView.view.webContents.capturePage();
      return image.toDataURL();
    } catch {
      return '';
    }
  }

  /**
   * Get navigation state for a tile
   */
  getNavigationState(id: string): NavigationStateUpdate | null {
    const managedView = this.views.get(id);
    if (!managedView) return null;

    const webContents = managedView.view.webContents;
    return {
      tileId: id,
      url: webContents.getURL(),
      title: webContents.getTitle(),
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      isLoading: webContents.isLoading(),
    };
  }

  /**
   * Get WebContents for a tile (for extension system)
   */
  getWebContents(id: string): Electron.WebContents | null {
    const managedView = this.views.get(id);
    return managedView?.view.webContents || null;
  }

  /**
   * Find tile ID by WebContents
   */
  findTileByWebContents(webContents: Electron.WebContents): string | null {
    for (const [id, view] of this.views) {
      if (view.view.webContents === webContents) {
        return id;
      }
    }
    return null;
  }

  /**
   * Get all views for a window
   */
  getViewsForWindow(windowId: string): ManagedTileView[] {
    const viewIds = this.windowViews.get(windowId);
    if (!viewIds) return [];

    const views: ManagedTileView[] = [];
    for (const id of viewIds) {
      const view = this.views.get(id);
      if (view) views.push(view);
    }
    return views;
  }

  /**
   * Get the last focused tile for a window
   */
  getLastFocusedId(windowId: string): string | null {
    return this.lastFocusedId.get(windowId) || null;
  }

  /**
   * Setup event listeners for a view
   */
  private setupViewEvents(managedView: ManagedTileView): void {
    const { id, view, windowId } = managedView;
    const webContents = view.webContents;

    // Navigation events
    webContents.on('did-start-loading', () => {
      managedView.isLoading = true;
      this.emitNavigationState(managedView);
    });

    webContents.on('did-stop-loading', () => {
      managedView.isLoading = false;
      this.emitNavigationState(managedView);
    });

    webContents.on('did-navigate', (_event, url) => {
      managedView.url = url;
      this.emitNavigationState(managedView);
    });

    webContents.on('did-navigate-in-page', (_event, url) => {
      managedView.url = url;
      this.emitNavigationState(managedView);
    });

    webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return; // Ignore aborted loads

      const window = this.getWindow(windowId);
      if (window && !window.isDestroyed()) {
        const update: ErrorUpdate = {
          tileId: id,
          errorCode,
          errorDescription,
          validatedURL,
        };
        window.webContents.send(IPC_CHANNELS.TILE_VIEW_LOAD_ERROR, update);
      }
    });

    // Title changes
    webContents.on('page-title-updated', (_event, title) => {
      managedView.title = title;
      const window = this.getWindow(windowId);
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.TILE_VIEW_TITLE_UPDATED, { tileId: id, title });
      }
    });

    // Favicon changes
    webContents.on('page-favicon-updated', (_event, favicons) => {
      const faviconUrl = favicons[0];
      if (faviconUrl) {
        const window = this.getWindow(windowId);
        if (window && !window.isDestroyed()) {
          const update: FaviconUpdate = { tileId: id, faviconUrl };
          window.webContents.send(IPC_CHANNELS.TILE_VIEW_FAVICON, update);
        }
      }
    });

    // Audio events
    webContents.on('media-started-playing', () => {
      managedView.isAudioPlaying = true;
      this.emitAudioState(managedView);
      void this.updateAudioIndicator(id, true, managedView.isMuted);
    });

    webContents.on('media-paused', () => {
      managedView.isAudioPlaying = false;
      this.emitAudioState(managedView);
      void this.updateAudioIndicator(id, false, managedView.isMuted);
    });

    // Focus detection - track when this view gets focused
    const notifyFocus = (): void => {
      const prevFocusedId = this.lastFocusedId.get(windowId);
      if (prevFocusedId !== id) {
        // Update focus indicators (Linux only)
        if (prevFocusedId) {
          void this.updateFocusIndicator(prevFocusedId, false);
        }
        void this.updateFocusIndicator(id, true);

        this.lastFocusedId.set(windowId, id);
        const window = this.getWindow(windowId);
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.TILE_VIEW_FOCUSED, { tileId: id });
        }

        // Notify extension system
        this.extensionCallbacks.onTileFocused?.(id);
      }
    };

    webContents.on('focus', notifyFocus);

    // Also detect focus via input events (more reliable for clicks)
    webContents.on('before-input-event', (_event, input) => {
      // Any mouse click or key press in this view means it's focused
      if (input.type === 'mouseDown' || input.type === 'keyDown') {
        notifyFocus();
      }
    });

    // Handle new window requests (middle-click, target="_blank", etc.)
    webContents.setWindowOpenHandler(({ url, disposition }) => {
      // Middle-click or ctrl+click opens in new tile
      if (disposition === 'foreground-tab' || disposition === 'background-tab') {
        // Tell renderer to create a new tile (it manages the layout)
        const window = this.getWindow(windowId);
        if (window && !window.isDestroyed()) {
          window.webContents.send('open-in-new-tile', {
            url,
            focusNew: disposition === 'foreground-tab',
          });
        }
      } else {
        // Regular click on target="_blank" - open in same tile
        void webContents.loadURL(url);
      }
      return { action: 'deny' };
    });

    // Fullscreen handling - prevent window fullscreen and keep menu bar visible
    webContents.on('enter-html-full-screen', () => {
      const window = this.getWindow(windowId);
      if (window && !window.isDestroyed()) {
        // Prevent window fullscreen and restore menu bar
        setImmediate(() => {
          if (window.isFullScreen()) {
            window.setFullScreen(false);
          }
          // Ensure menu bar stays visible
          window.setMenuBarVisibility(true);
          window.setAutoHideMenuBar(false);
        });

        // Force view to stay within its bounds
        const bounds = managedView.bounds;
        view.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y + WINDOW_CONFIG.toolbarHeight),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });

        window.webContents.send(IPC_CHANNELS.TILE_VIEW_FULLSCREEN, { tileId: id, isFullscreen: true });
      }
    });

    webContents.on('leave-html-full-screen', () => {
      const window = this.getWindow(windowId);
      if (window && !window.isDestroyed()) {
        // Ensure menu bar is visible after exiting fullscreen
        window.setMenuBarVisibility(true);
        window.setAutoHideMenuBar(false);

        // Re-apply bounds
        const bounds = managedView.bounds;
        view.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y + WINDOW_CONFIG.toolbarHeight),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });

        window.webContents.send(IPC_CHANNELS.TILE_VIEW_FULLSCREEN, { tileId: id, isFullscreen: false });
      }
    });

    // Inject fullscreen override
    webContents.on('dom-ready', () => {
      this.injectFullscreenOverride(webContents);
    });

    // Setup audio toggle listener for Linux injected indicators
    this.setupAudioToggleListener(managedView);
  }

  /**
   * Emit navigation state to renderer
   */
  private emitNavigationState(managedView: ManagedTileView): void {
    const window = this.getWindow(managedView.windowId);
    if (!window || window.isDestroyed()) return;

    const state = this.getNavigationState(managedView.id);
    if (state) {
      window.webContents.send(IPC_CHANNELS.TILE_VIEW_NAVIGATION_STATE, state);
    }
  }

  /**
   * Emit audio state to renderer
   */
  private emitAudioState(managedView: ManagedTileView): void {
    const window = this.getWindow(managedView.windowId);
    if (!window || window.isDestroyed()) return;

    const update: AudioStateUpdate = {
      tileId: managedView.id,
      isPlaying: managedView.isAudioPlaying,
    };
    window.webContents.send(IPC_CHANNELS.TILE_VIEW_AUDIO_STATE, update);
  }

  /**
   * Inject fullscreen override script
   */
  private injectFullscreenOverride(webContents: Electron.WebContents): void {
    const script = `
      (function() {
        if (window.__tiloraFullscreenOverride) return;
        window.__tiloraFullscreenOverride = true;

        const originalRequestFullscreen = Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen = function() {
          console.log('[Tilora] Fullscreen request intercepted');
          // Allow the request but it will be blocked by main process
          return originalRequestFullscreen.apply(this, arguments);
        };
      })();
    `;
    webContents.executeJavaScript(script).catch(() => {});
  }

  /**
   * Get BrowserWindow by ID (needs to be provided externally)
   */
  private windowGetter: ((id: string) => BrowserWindow | null) | null = null;

  setWindowGetter(getter: (id: string) => BrowserWindow | null): void {
    this.windowGetter = getter;
  }

  /**
   * Set callbacks for extension integration
   */
  setExtensionCallbacks(callbacks: ExtensionCallback): void {
    this.extensionCallbacks = callbacks;
  }

  private getWindow(windowId: string): BrowserWindow | null {
    return this.windowGetter?.(windowId) || null;
  }

  /**
   * Update focus indicator for a tile (Linux only - uses injected CSS)
   */
  async updateFocusIndicator(id: string, isFocused: boolean): Promise<void> {
    if (!isLinux) return; // Only needed on Linux

    const managedView = this.views.get(id);
    if (!managedView) return;

    const webContents = managedView.view.webContents;
    if (webContents.isDestroyed()) return;

    // Use JavaScript to add/remove a style element (more reliable than insertCSS)
    const script = `
      (function() {
        const styleId = '__tilora_focus_style';
        let style = document.getElementById(styleId);

        if (${!isFocused}) {
          // Remove focus border
          if (style) style.remove();
          return;
        }

        // Add focus border
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = \`
          html::after {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border: 3px solid #0078d4;
            pointer-events: none;
            z-index: 2147483647;
            box-sizing: border-box;
          }
        \`;
      })();
    `;

    try {
      await webContents.executeJavaScript(script);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Update audio indicator for a tile (Linux only - uses injected element)
   */
  async updateAudioIndicator(id: string, isPlaying: boolean, isMuted: boolean): Promise<void> {
    if (!isLinux) return; // Only needed on Linux

    const managedView = this.views.get(id);
    if (!managedView) return;

    const webContents = managedView.view.webContents;
    if (webContents.isDestroyed()) return;

    // Script to add/update/remove audio indicator - using simple text
    const script = `
      (function() {
        const indicatorId = '__tilora_audio_indicator';
        let indicator = document.getElementById(indicatorId);

        if (!${isPlaying}) {
          if (indicator) indicator.remove();
          return;
        }

        if (!indicator) {
          indicator = document.createElement('div');
          indicator.id = indicatorId;
          indicator.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.85);border-radius:6px;padding:8px 14px;cursor:pointer;font-family:system-ui,sans-serif;font-size:13px;font-weight:500;color:white;z-index:2147483647;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
          indicator.onmouseenter = function() { this.style.background = 'rgba(0,0,0,0.95)'; };
          indicator.onmouseleave = function() { this.style.background = 'rgba(0,0,0,0.85)'; };
          indicator.onclick = function() { console.log('__tilora_toggle_mute__'); };
          document.body.appendChild(indicator);
        }

        indicator.textContent = ${isMuted} ? '[x] Unmute' : '[*] Mute';
      })();
    `;

    try {
      await webContents.executeJavaScript(script);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Setup console message listener for audio toggle (Linux audio indicator)
   */
  private setupAudioToggleListener(managedView: ManagedTileView): void {
    if (!isLinux) return;

    const { id, view, windowId } = managedView;
    const webContents = view.webContents;

    webContents.on('console-message', (_event, _level, message) => {
      if (message === '__tilora_toggle_mute__') {
        // Toggle mute state
        const newMuted = !managedView.isMuted;
        this.setMuted(id, newMuted);

        // Update indicator
        void this.updateAudioIndicator(id, managedView.isAudioPlaying, newMuted);

        // Notify main window
        const window = this.getWindow(windowId);
        if (window && !window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.OVERLAY_TOGGLE_MUTE, id);
        }
      }
    });
  }
}

// Singleton instance
export const tileViewManager = new TileViewManager();
