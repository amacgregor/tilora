import { BrowserView, BrowserWindow, session } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { Tile, Bounds, NavigationState } from '@shared/types';
import { DEFAULT_PREFERENCES, WINDOW_CONFIG } from '@shared/constants';

interface ManagedView {
  id: string;
  view: BrowserView;
  tile: Tile;
  bounds: Bounds;
}

type NavigationCallback = (tileId: string, state: NavigationState) => void;
type TitleCallback = (tileId: string, title: string) => void;
type FaviconCallback = (tileId: string, favicons: string[]) => void;

export class ViewManager {
  private window: BrowserWindow;
  private views: Map<string, ManagedView> = new Map();
  private focusedViewId: string | null = null;
  private toolbarHeight = WINDOW_CONFIG.toolbarHeight;

  private onNavigationChange?: NavigationCallback;
  private onTitleChange?: TitleCallback;
  private onFaviconChange?: FaviconCallback;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.setupWindowEvents();
  }

  private setupWindowEvents(): void {
    this.window.on('resize', () => {
      this.updateAllViewBounds();
    });
  }

  setCallbacks(callbacks: {
    onNavigationChange?: NavigationCallback;
    onTitleChange?: TitleCallback;
    onFaviconChange?: FaviconCallback;
  }): void {
    this.onNavigationChange = callbacks.onNavigationChange;
    this.onTitleChange = callbacks.onTitleChange;
    this.onFaviconChange = callbacks.onFaviconChange;
  }

  createView(url?: string): string {
    const id = uuidv4();
    const initialUrl = url || DEFAULT_PREFERENCES.defaultUrl;

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        session: session.defaultSession,
      },
    });

    const tile: Tile = {
      id,
      url: initialUrl,
      title: 'New Tab',
      state: 'live',
      isMuted: false,
      isAudioPlaying: false,
      history: [initialUrl],
      historyIndex: 0,
    };

    // Calculate initial bounds (full content area)
    const bounds = this.getContentBounds();

    const managedView: ManagedView = {
      id,
      view,
      tile,
      bounds,
    };

    this.views.set(id, managedView);
    this.window.addBrowserView(view);

    // Debug: log the bounds we're setting
    console.log('Setting BrowserView bounds:', bounds);
    console.log('Window content size:', this.window.getContentSize());
    console.log('Toolbar height:', this.toolbarHeight);

    view.setBounds(bounds);

    // Force bounds again after a short delay
    setTimeout(() => {
      const newBounds = this.getContentBounds();
      console.log('Re-setting bounds after delay:', newBounds);
      view.setBounds(newBounds);
    }, 200);

    // Setup webContents event listeners
    this.setupViewEvents(managedView);

    // Load the URL
    void view.webContents.loadURL(initialUrl);

    // Focus this view
    this.focusView(id);

    return id;
  }

  private setupViewEvents(managedView: ManagedView): void {
    const { id, view, tile } = managedView;
    const webContents = view.webContents;

    // Navigation state changes
    webContents.on('did-start-loading', () => {
      this.emitNavigationState(id);
    });

    webContents.on('did-stop-loading', () => {
      this.emitNavigationState(id);
    });

    webContents.on('did-navigate', (_event, url) => {
      tile.url = url;
      this.updateHistory(managedView, url);
      this.emitNavigationState(id);
    });

    webContents.on('did-navigate-in-page', (_event, url) => {
      tile.url = url;
      this.emitNavigationState(id);
    });

    webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
      this.emitNavigationState(id);
    });

    // Title changes
    webContents.on('page-title-updated', (_event, title) => {
      tile.title = title;
      this.onTitleChange?.(id, title);
    });

    // Favicon changes
    webContents.on('page-favicon-updated', (_event, favicons) => {
      if (favicons.length > 0) {
        tile.favicon = favicons[0];
        this.onFaviconChange?.(id, favicons);
      }
    });

    // Audio state
    webContents.on('media-started-playing', () => {
      tile.isAudioPlaying = true;
    });

    webContents.on('media-paused', () => {
      tile.isAudioPlaying = false;
    });

    // Handle new window requests (open in same view for now)
    webContents.setWindowOpenHandler(({ url }) => {
      void webContents.loadURL(url);
      return { action: 'deny' };
    });
  }

  private updateHistory(managedView: ManagedView, url: string): void {
    const { tile } = managedView;
    // Only add to history if it's a new URL
    if (tile.history[tile.historyIndex] !== url) {
      // Truncate forward history and add new entry
      tile.history = tile.history.slice(0, tile.historyIndex + 1);
      tile.history.push(url);
      tile.historyIndex = tile.history.length - 1;
    }
  }

  private emitNavigationState(id: string): void {
    const managedView = this.views.get(id);
    if (!managedView) return;

    const webContents = managedView.view.webContents;
    const state: NavigationState = {
      url: webContents.getURL(),
      title: webContents.getTitle(),
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      isLoading: webContents.isLoading(),
    };

    this.onNavigationChange?.(id, state);
  }

  private getContentBounds(): Bounds {
    const size = this.window.getContentSize();
    const width = size[0] ?? 800;
    const height = size[1] ?? 600;
    return {
      x: 0,
      y: this.toolbarHeight,
      width,
      height: height - this.toolbarHeight,
    };
  }

  private updateAllViewBounds(): void {
    const bounds = this.getContentBounds();
    for (const managedView of this.views.values()) {
      managedView.bounds = bounds;
      managedView.view.setBounds(bounds);
    }
  }

  focusView(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    this.focusedViewId = id;

    // Bring view to front
    this.window.setTopBrowserView(managedView.view);
    managedView.view.webContents.focus();

    // Emit navigation state for the focused view
    this.emitNavigationState(id);

    return true;
  }

  getFocusedViewId(): string | null {
    return this.focusedViewId;
  }

  navigateTo(id: string, url: string): boolean {
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

  goBack(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    if (managedView.view.webContents.canGoBack()) {
      managedView.view.webContents.goBack();
      return true;
    }
    return false;
  }

  goForward(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    if (managedView.view.webContents.canGoForward()) {
      managedView.view.webContents.goForward();
      return true;
    }
    return false;
  }

  reload(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    managedView.view.webContents.reload();
    return true;
  }

  closeView(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    this.window.removeBrowserView(managedView.view);

    // Destroy webContents
    if (!managedView.view.webContents.isDestroyed()) {
      managedView.view.webContents.close();
    }

    this.views.delete(id);

    if (this.focusedViewId === id) {
      this.focusedViewId = null;
      // Focus another view if available
      const remaining = this.views.keys().next();
      if (!remaining.done) {
        this.focusView(remaining.value);
      }
    }

    return true;
  }

  getView(id: string): ManagedView | undefined {
    return this.views.get(id);
  }

  getAllViews(): ManagedView[] {
    return Array.from(this.views.values());
  }

  getTile(id: string): Tile | undefined {
    return this.views.get(id)?.tile;
  }

  toggleMute(id: string): boolean {
    const managedView = this.views.get(id);
    if (!managedView) return false;

    const isMuted = !managedView.tile.isMuted;
    managedView.tile.isMuted = isMuted;
    managedView.view.webContents.setAudioMuted(isMuted);
    return true;
  }

  destroy(): void {
    for (const id of this.views.keys()) {
      this.closeView(id);
    }
  }
}
