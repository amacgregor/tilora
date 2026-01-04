/**
 * TileManager - Manages tiles using WebContentsView via IPC
 *
 * This version uses TileProxy objects to represent tiles that are
 * actually WebContentsViews managed by the main process.
 */

import {
  LayoutNode,
  SplitDirection,
  Bounds,
  TileBounds,
  Direction,
  createLeaf,
  splitNode,
  removeNode,
  calculateBounds,
  getAllTileIds,
  countTiles,
  findAdjacentTile,
  swapTiles,
  adjustSplitInDirection,
} from './bsp';
import { TileProxy, SleepingTile, createTileProxy } from './tile-proxy';
import type { Workspace, TileState, SerializedLayoutNode } from '@shared/workspace';
import type { BoundsUpdate } from '@shared/tile-ipc';
import type { OverlayTileState, OverlayUpdatePayload } from '@shared/overlay-types';
import { TILE_LIFECYCLE, WINDOW_CONFIG } from '@shared/constants';

export class TileManager {
  private container: HTMLElement;
  private layout!: LayoutNode;
  private tileProxies: Map<string, TileProxy> = new Map();
  private sleepingTiles: Map<string, SleepingTile> = new Map();
  private focusedTileId: string | null = null;
  private fullscreenTileId: string | null = null;

  // UI overlay elements
  private audioIndicators: Map<string, HTMLElement> = new Map();
  private errorOverlays: Map<string, HTMLElement> = new Map();
  private focusIndicators: Map<string, HTMLElement> = new Map();

  // Callbacks
  private onFocusChange?: (tileId: string) => void;
  private onUrlChange?: (tileId: string, url: string) => void;
  private onTitleChange?: (tileId: string, title: string) => void;
  private onStateChange?: () => void;

  // Event unsubscribe functions
  private eventUnsubscribers: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // Subscribe to main process events
    this.setupEventListeners();

    // Handle window resize
    window.addEventListener('resize', () => this.updateLayout());
  }

  /**
   * Initialize with a default tile (async)
   */
  async initialize(): Promise<void> {
    const initialLeaf = createLeaf();
    this.layout = initialLeaf;

    // Create the tile via IPC
    await this.createTile(initialLeaf.tileId, 'https://www.google.com');
    this.focusedTileId = initialLeaf.tileId;

    // Initial layout
    this.updateLayout();
  }

  /**
   * Set up event listeners for main process events
   */
  private setupEventListeners(): void {
    const { tiles } = window.tilora;

    // Navigation state updates
    this.eventUnsubscribers.push(
      tiles.onNavigationState((data) => {
        // data.tileId is the view ID from main process
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        const proxy = this.tileProxies.get(tileId);
        if (proxy) {
          proxy.url = data.url;
          proxy.title = data.title;
          proxy.canGoBack = data.canGoBack;
          proxy.canGoForward = data.canGoForward;
          proxy.isLoading = data.isLoading;

          if (tileId === this.focusedTileId) {
            this.onUrlChange?.(tileId, data.url);
          }
        }
      })
    );

    // Title updates
    this.eventUnsubscribers.push(
      tiles.onTitleUpdated((data) => {
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        const proxy = this.tileProxies.get(tileId);
        if (proxy) {
          proxy.title = data.title;
          this.onTitleChange?.(tileId, data.title);
        }
      })
    );

    // Audio state updates
    this.eventUnsubscribers.push(
      tiles.onAudioState((data) => {
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        const proxy = this.tileProxies.get(tileId);
        if (proxy) {
          proxy.isAudioPlaying = data.isPlaying;
          this.updateAudioIndicator(tileId);
        }
      })
    );

    // Load error updates
    this.eventUnsubscribers.push(
      tiles.onLoadError((data) => {
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        const proxy = this.tileProxies.get(tileId);
        if (proxy) {
          proxy.hasError = true;
          proxy.errorCode = data.errorCode;
          proxy.errorMessage = data.errorDescription;
          this.showErrorOverlay(tileId, data.errorDescription);
        }
      })
    );

    // Focus updates (from main process detecting clicks in views)
    this.eventUnsubscribers.push(
      tiles.onFocused((data) => {
        // data.tileId is the view ID from main process, need to find our tile ID
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        if (tileId !== this.focusedTileId) {
          this.focusTile(tileId);
        }
      })
    );

    // Fullscreen updates
    this.eventUnsubscribers.push(
      tiles.onFullscreen((data) => {
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        this.handleTileFullscreen(tileId, data.isFullscreen);
      })
    );

    // Favicon updates
    this.eventUnsubscribers.push(
      tiles.onFavicon((data) => {
        const tileId = this.getTileIdByViewId(data.tileId) || data.tileId;
        const proxy = this.tileProxies.get(tileId);
        if (proxy) {
          proxy.faviconUrl = data.faviconUrl;
        }
      })
    );

    // Overlay mute toggle (from clicking audio indicator in overlay)
    this.eventUnsubscribers.push(
      window.tilora.overlay.onToggleMute((tileId) => {
        void this.toggleMute(tileId);
      })
    );

    // Open link in new tile (middle-click)
    this.eventUnsubscribers.push(
      window.tilora.onOpenInNewTile(({ url, focusNew }) => {
        void this.openInNewTile(url, focusNew);
      })
    );
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];
  }

  setCallbacks(callbacks: {
    onFocusChange?: (tileId: string) => void;
    onUrlChange?: (tileId: string, url: string) => void;
    onTitleChange?: (tileId: string, title: string) => void;
  }): void {
    this.onFocusChange = callbacks.onFocusChange;
    this.onUrlChange = callbacks.onUrlChange;
    this.onTitleChange = callbacks.onTitleChange;
  }

  setOnStateChange(callback: () => void): void {
    this.onStateChange = callback;
  }

  /**
   * Create a tile via IPC
   */
  private async createTile(tileId: string, url: string, muted: boolean = false): Promise<void> {
    const response = await window.tilora.tiles.create(url);

    if (!response.success) {
      console.error('Failed to create tile:', response.error);
      return;
    }

    // Create proxy with the ID from main process
    const proxy = createTileProxy(response.tileId, url);
    proxy.isMuted = muted;

    // Map our layout tileId to the actual view tileId
    // For simplicity, we'll use the response tileId directly
    this.tileProxies.set(tileId, proxy);

    // Store the mapping for later use
    (proxy as TileProxy & { viewId: string }).viewId = response.tileId;

    // Apply mute state if needed
    if (muted) {
      await window.tilora.tiles.setMuted(response.tileId, true);
    }

    // Create focus indicator element
    this.createFocusIndicator(tileId);
  }

  /**
   * Get the view ID for a proxy (the ID used by main process)
   */
  private getViewId(tileId: string): string {
    const proxy = this.tileProxies.get(tileId);
    return (proxy as TileProxy & { viewId?: string })?.viewId || tileId;
  }

  /**
   * Find tile ID by view ID (reverse lookup)
   */
  private getTileIdByViewId(viewId: string): string | null {
    for (const [tileId, proxy] of this.tileProxies) {
      if ((proxy as TileProxy & { viewId?: string })?.viewId === viewId) {
        return tileId;
      }
    }
    return null;
  }

  /**
   * Remove a tile
   */
  private async removeTile(tileId: string): Promise<void> {
    const viewId = this.getViewId(tileId);
    await window.tilora.tiles.destroy(viewId);

    // Remove UI elements
    this.audioIndicators.get(tileId)?.remove();
    this.audioIndicators.delete(tileId);
    this.errorOverlays.get(tileId)?.remove();
    this.errorOverlays.delete(tileId);
    this.focusIndicators.get(tileId)?.remove();
    this.focusIndicators.delete(tileId);

    this.tileProxies.delete(tileId);
  }

  /**
   * Create focus indicator overlay element
   * Note: This may not be visible with WebContentsViews rendering on top
   */
  private createFocusIndicator(tileId: string): void {
    const indicator = document.createElement('div');
    indicator.className = 'focus-indicator';
    indicator.dataset.tileId = tileId;
    indicator.style.cssText = `
      position: absolute;
      pointer-events: none;
      box-sizing: border-box;
      border: 2px solid transparent;
    `;
    this.container.appendChild(indicator);
    this.focusIndicators.set(tileId, indicator);
  }

  /**
   * Update or create the audio indicator for a tile
   */
  private updateAudioIndicator(tileId: string): void {
    const proxy = this.tileProxies.get(tileId);
    if (!proxy) return;

    const shouldShow = proxy.isAudioPlaying || proxy.isMuted;

    if (!shouldShow) {
      const indicator = this.audioIndicators.get(tileId);
      if (indicator) {
        indicator.remove();
        this.audioIndicators.delete(tileId);
      }
      return;
    }

    let indicator = this.audioIndicators.get(tileId);
    if (!indicator) {
      indicator = this.createAudioIndicatorElement(tileId);
      this.container.appendChild(indicator);
      this.audioIndicators.set(tileId, indicator);
    }

    // Update icon based on state
    const icon = indicator.querySelector('.audio-icon') as HTMLElement;
    if (icon) {
      if (proxy.isMuted) {
        icon.textContent = '🔇';
        icon.title = 'Muted (click to unmute)';
      } else {
        icon.textContent = '🔊';
        icon.title = 'Playing audio (click to mute)';
      }
    }

    // Position the indicator
    this.positionAudioIndicator(tileId);

    // Update overlay with new audio state
    this.sendOverlayUpdate();
  }

  /**
   * Create audio indicator element
   */
  private createAudioIndicatorElement(tileId: string): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'audio-indicator';
    indicator.dataset.tileId = tileId;
    indicator.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 4px;
      pointer-events: auto;
    `;

    const icon = document.createElement('span');
    icon.className = 'audio-icon';
    icon.style.fontSize = '14px';
    indicator.appendChild(icon);

    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.toggleMute(tileId);
    });

    return indicator;
  }

  /**
   * Position audio indicator in the top-right area of the tile
   * Note: May not be visible with WebContentsViews on top
   */
  private positionAudioIndicator(tileId: string): void {
    const indicator = this.audioIndicators.get(tileId);
    const proxy = this.tileProxies.get(tileId);
    if (!indicator || !proxy) return;

    const { bounds } = proxy;
    indicator.style.left = `${bounds.x + bounds.width - 40}px`;
    indicator.style.top = `${bounds.y + 6}px`;
  }

  /**
   * Toggle mute state for a tile
   */
  async toggleMute(tileId?: string): Promise<void> {
    const targetId = tileId || this.focusedTileId;
    if (!targetId) return;

    const proxy = this.tileProxies.get(targetId);
    if (!proxy) return;

    proxy.isMuted = !proxy.isMuted;
    const viewId = this.getViewId(targetId);
    await window.tilora.tiles.setMuted(viewId, proxy.isMuted);
    this.updateAudioIndicator(targetId);
    this.notifyStateChange();
  }

  /**
   * Mute a specific tile
   */
  async muteTile(tileId: string): Promise<void> {
    const proxy = this.tileProxies.get(tileId);
    if (!proxy) return;

    proxy.isMuted = true;
    const viewId = this.getViewId(tileId);
    await window.tilora.tiles.setMuted(viewId, true);
    this.updateAudioIndicator(tileId);
    this.notifyStateChange();
  }

  /**
   * Unmute a specific tile
   */
  async unmuteTile(tileId: string): Promise<void> {
    const proxy = this.tileProxies.get(tileId);
    if (!proxy) return;

    proxy.isMuted = false;
    const viewId = this.getViewId(tileId);
    await window.tilora.tiles.setMuted(viewId, false);
    this.updateAudioIndicator(tileId);
    this.notifyStateChange();
  }

  /**
   * Mute all tiles except the focused one
   */
  async muteAllExceptFocused(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [tileId, proxy] of this.tileProxies) {
      if (tileId === this.focusedTileId) {
        proxy.isMuted = false;
        promises.push(window.tilora.tiles.setMuted(this.getViewId(tileId), false).then(() => {}));
      } else {
        proxy.isMuted = true;
        promises.push(window.tilora.tiles.setMuted(this.getViewId(tileId), true).then(() => {}));
      }
      this.updateAudioIndicator(tileId);
    }
    await Promise.all(promises);
    this.notifyStateChange();
  }

  /**
   * Unmute all tiles
   */
  async unmuteAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [tileId, proxy] of this.tileProxies) {
      proxy.isMuted = false;
      promises.push(window.tilora.tiles.setMuted(this.getViewId(tileId), false).then(() => {}));
      this.updateAudioIndicator(tileId);
    }
    await Promise.all(promises);
    this.notifyStateChange();
  }

  /**
   * Check if focused tile is muted
   */
  isFocusedTileMuted(): boolean {
    if (!this.focusedTileId) return false;
    const proxy = this.tileProxies.get(this.focusedTileId);
    return proxy?.isMuted ?? false;
  }

  /**
   * Show error overlay on a tile
   */
  private showErrorOverlay(tileId: string, errorMessage: string): void {
    const proxy = this.tileProxies.get(tileId);
    if (!proxy) return;

    proxy.hasError = true;

    let overlay = this.errorOverlays.get(tileId);
    if (!overlay) {
      overlay = this.createErrorOverlayElement(tileId);
      this.container.appendChild(overlay);
      this.errorOverlays.set(tileId, overlay);
    }

    const messageEl = overlay.querySelector('.error-message') as HTMLElement;
    if (messageEl) {
      messageEl.textContent = errorMessage;
    }

    this.positionErrorOverlay(tileId);
    overlay.style.display = 'flex';
  }

  /**
   * Hide error overlay
   */
  private hideErrorOverlay(tileId: string): void {
    const proxy = this.tileProxies.get(tileId);
    if (proxy) {
      proxy.hasError = false;
    }

    const overlay = this.errorOverlays.get(tileId);
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  /**
   * Create error overlay element
   */
  private createErrorOverlayElement(tileId: string): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'error-overlay';
    overlay.dataset.tileId = tileId;
    overlay.style.cssText = `
      position: absolute;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(30, 30, 30, 0.95);
      z-index: 50;
      gap: 16px;
      padding: 24px;
    `;

    const icon = document.createElement('div');
    icon.textContent = '⚠️';
    icon.style.fontSize = '48px';
    overlay.appendChild(icon);

    const title = document.createElement('div');
    title.textContent = 'Page Load Failed';
    title.style.cssText = `color: #fff; font-size: 18px; font-weight: bold;`;
    overlay.appendChild(title);

    const message = document.createElement('div');
    message.className = 'error-message';
    message.style.cssText = `color: #888; font-size: 14px; text-align: center; max-width: 300px;`;
    overlay.appendChild(message);

    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.style.cssText = `
      background: #0078d4; color: white; border: none;
      padding: 8px 24px; border-radius: 4px; cursor: pointer;
      font-size: 14px; margin-top: 8px;
    `;
    retryBtn.addEventListener('click', () => {
      this.hideErrorOverlay(tileId);
      void window.tilora.tiles.reload(this.getViewId(tileId));
    });
    overlay.appendChild(retryBtn);

    return overlay;
  }

  /**
   * Position error overlay
   */
  private positionErrorOverlay(tileId: string): void {
    const overlay = this.errorOverlays.get(tileId);
    const proxy = this.tileProxies.get(tileId);
    if (!overlay || !proxy) return;

    const { bounds } = proxy;
    overlay.style.left = `${bounds.x}px`;
    overlay.style.top = `${bounds.y}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
  }

  /**
   * Convert local bounds to window bounds for WebContentsView positioning
   * WebContentsViews are positioned relative to window content area
   * Note: Main process adds toolbar offset, so we just pass local bounds
   */
  private toWindowBounds(localBounds: Bounds): Bounds {
    return {
      x: Math.round(localBounds.x),
      y: Math.round(localBounds.y),
      width: Math.round(localBounds.width),
      height: Math.round(localBounds.height),
    };
  }

  /**
   * Update all tile positions based on current layout
   */
  updateLayout(): void {
    const containerRect = this.container.getBoundingClientRect();

    const containerBounds: Bounds = {
      x: 0,
      y: 0,
      width: containerRect.width,
      height: containerRect.height,
    };

    const tileBounds = calculateBounds(this.layout, containerBounds);

    // Collect bounds updates for batch IPC call
    const boundsUpdates: BoundsUpdate[] = [];

    for (const { tileId, bounds } of tileBounds) {
      const proxy = this.tileProxies.get(tileId);
      const sleepingTile = this.sleepingTiles.get(tileId);

      if (proxy) {
        // Update proxy bounds (full bounds for overlay positioning)
        proxy.bounds = bounds;

        // Check if tile should sleep
        if (this.shouldSleep(bounds) && tileId !== this.focusedTileId) {
          void this.sleepTile(tileId);
        } else {
          // Add to batch update with window bounds for the view
          boundsUpdates.push({
            id: this.getViewId(tileId),
            bounds: this.toWindowBounds(bounds),
          });
        }
      } else if (sleepingTile) {
        // Check if tile should wake
        if (!this.shouldSleep(bounds)) {
          void this.wakeTile(tileId).then(() => {
            const awakened = this.tileProxies.get(tileId);
            if (awakened) {
              awakened.bounds = bounds;
              void window.tilora.tiles.setBounds([{
                id: this.getViewId(tileId),
                bounds: this.toWindowBounds(bounds),
              }]);
            }
          });
        } else {
          // Update placeholder position
          this.applyBoundsToElement(sleepingTile.element, bounds);
        }
      }
    }

    // Send batch bounds update to main process
    if (boundsUpdates.length > 0) {
      void window.tilora.tiles.setBounds(boundsUpdates);
    }

    // Update focus indicators (legacy - may not be visible)
    this.updateFocusIndicators();

    // Update audio indicator positions (legacy - may not be visible)
    for (const tileId of this.audioIndicators.keys()) {
      this.positionAudioIndicator(tileId);
    }

    // Update error overlay positions
    for (const tileId of this.errorOverlays.keys()) {
      this.positionErrorOverlay(tileId);
    }

    // Send update to overlay window
    this.sendOverlayUpdate();
  }

  /**
   * Send tile states to overlay window for rendering borders and audio indicators
   */
  private sendOverlayUpdate(): void {
    const tiles: OverlayTileState[] = [];

    for (const [tileId, proxy] of this.tileProxies) {
      // Convert bounds to window coordinates (add toolbar offset for overlay)
      const windowBounds: Bounds = {
        x: proxy.bounds.x,
        y: proxy.bounds.y + WINDOW_CONFIG.toolbarHeight,
        width: proxy.bounds.width,
        height: proxy.bounds.height,
      };

      tiles.push({
        id: tileId,
        bounds: windowBounds,
        isFocused: tileId === this.focusedTileId,
        isAudioPlaying: proxy.isAudioPlaying,
        isMuted: proxy.isMuted,
      });
    }

    const payload: OverlayUpdatePayload = {
      tiles,
      focusedTileId: this.focusedTileId,
    };

    void window.tilora.overlay.updateTiles(payload);
  }

  private applyBoundsToElement(element: HTMLElement, bounds: Bounds): void {
    element.style.left = `${bounds.x}px`;
    element.style.top = `${bounds.y}px`;
    element.style.width = `${bounds.width}px`;
    element.style.height = `${bounds.height}px`;
  }

  private updateFocusIndicators(): void {
    for (const [tileId, indicator] of this.focusIndicators) {
      const proxy = this.tileProxies.get(tileId);
      if (!proxy) continue;

      const { bounds } = proxy;
      indicator.style.left = `${bounds.x}px`;
      indicator.style.top = `${bounds.y}px`;
      indicator.style.width = `${bounds.width}px`;
      indicator.style.height = `${bounds.height}px`;

      // Note: Border may not be visible with WebContentsViews on top
      if (tileId === this.focusedTileId) {
        indicator.style.borderColor = '#0078d4';
      } else {
        indicator.style.borderColor = 'transparent';
      }
    }
  }

  /**
   * Split the focused tile
   */
  async split(direction: SplitDirection): Promise<string | null> {
    if (!this.focusedTileId) return null;

    const result = splitNode(this.layout, this.focusedTileId, direction);
    if (!result) return null;

    this.layout = result.newRoot;

    // Create tile for new split
    await this.createTile(result.newTileId, 'https://www.google.com');

    // Update layout
    this.updateLayout();

    // Focus the new tile
    this.focusTile(result.newTileId);

    return result.newTileId;
  }

  /**
   * Open a URL in a new tile (used for middle-click)
   */
  async openInNewTile(url: string, focusNew: boolean = true): Promise<void> {
    const originalTileId = this.focusedTileId;
    if (!originalTileId) return;

    // Split vertically to create a new tile
    const result = splitNode(this.layout, originalTileId, 'vertical');
    if (!result) return;

    this.layout = result.newRoot;

    // Create tile for new split with the target URL
    await this.createTile(result.newTileId, url);

    // Update layout
    this.updateLayout();

    // Focus based on disposition
    if (focusNew) {
      this.focusTile(result.newTileId);
    } else {
      // Keep focus on original tile
      this.focusTile(originalTileId);
    }
  }

  /**
   * Close a tile
   */
  async closeTile(tileId?: string): Promise<boolean> {
    const targetId = tileId || this.focusedTileId;
    if (!targetId) return false;

    // Don't close if it's the only tile
    if (countTiles(this.layout) <= 1) return false;

    const newLayout = removeNode(this.layout, targetId);
    if (!newLayout) return false;

    // Remove the tile
    if (this.tileProxies.has(targetId)) {
      await this.removeTile(targetId);
    } else if (this.sleepingTiles.has(targetId)) {
      this.removeSleepingTile(targetId);
    }

    this.layout = newLayout;

    // If we closed the focused tile, focus another
    if (this.focusedTileId === targetId) {
      const remaining = getAllTileIds(this.layout);
      if (remaining.length > 0) {
        this.focusTile(remaining[0]!);
      } else {
        this.focusedTileId = null;
      }
    }

    this.updateLayout();
    return true;
  }

  /**
   * Focus a tile
   */
  focusTile(tileId: string): void {
    // Check if tile is sleeping and wake it first
    if (this.sleepingTiles.has(tileId)) {
      void this.wakeTile(tileId);
    }

    if (!this.tileProxies.has(tileId)) return;

    this.focusedTileId = tileId;
    this.updateFocusIndicators();
    this.onFocusChange?.(tileId);

    // Focus the view in main process
    void window.tilora.tiles.focus(this.getViewId(tileId));

    // Update URL bar with this tile's URL
    const proxy = this.tileProxies.get(tileId);
    if (proxy) {
      this.onUrlChange?.(tileId, proxy.url);
    }

    this.updateLayout();
  }

  /**
   * Get focused tile proxy
   */
  getFocusedTile(): TileProxy | null {
    if (!this.focusedTileId) return null;
    return this.tileProxies.get(this.focusedTileId) || null;
  }

  /**
   * Navigate focused tile to URL
   */
  async navigate(url: string): Promise<void> {
    const proxy = this.getFocusedTile();
    if (!proxy) return;

    let finalUrl = url.trim();
    if (!finalUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
      }
    }

    if (this.focusedTileId) {
      const viewId = this.getViewId(this.focusedTileId);
      await window.tilora.tiles.navigate(viewId, finalUrl);
    }
  }

  /**
   * Navigation controls for focused tile
   */
  async goBack(): Promise<void> {
    if (!this.focusedTileId) return;
    const viewId = this.getViewId(this.focusedTileId);
    await window.tilora.tiles.goBack(viewId);
  }

  async goForward(): Promise<void> {
    if (!this.focusedTileId) return;
    const viewId = this.getViewId(this.focusedTileId);
    await window.tilora.tiles.goForward(viewId);
  }

  async reload(): Promise<void> {
    if (!this.focusedTileId) return;
    const proxy = this.tileProxies.get(this.focusedTileId);
    if (!proxy) return;

    const viewId = this.getViewId(this.focusedTileId);
    if (proxy.isLoading) {
      await window.tilora.tiles.stop(viewId);
    } else {
      await window.tilora.tiles.reload(viewId);
    }
  }

  canGoBack(): boolean {
    const proxy = this.getFocusedTile();
    return proxy?.canGoBack || false;
  }

  canGoForward(): boolean {
    const proxy = this.getFocusedTile();
    return proxy?.canGoForward || false;
  }

  isLoading(): boolean {
    const proxy = this.getFocusedTile();
    return proxy?.isLoading || false;
  }

  /**
   * Get tile count
   */
  getTileCount(): number {
    return countTiles(this.layout);
  }

  /**
   * Get current URL of focused tile
   */
  getCurrentUrl(): string {
    const proxy = this.getFocusedTile();
    return proxy?.url || '';
  }

  /**
   * Get current tile bounds for navigation calculations
   */
  private getTileBounds(): TileBounds[] {
    const containerRect = this.container.getBoundingClientRect();
    const containerBounds: Bounds = {
      x: 0,
      y: 0,
      width: containerRect.width,
      height: containerRect.height,
    };
    return calculateBounds(this.layout, containerBounds);
  }

  /**
   * Move focus to adjacent tile in given direction
   */
  focusDirection(direction: Direction): boolean {
    if (!this.focusedTileId) return false;

    const tileBounds = this.getTileBounds();
    const adjacentId = findAdjacentTile(tileBounds, this.focusedTileId, direction);

    if (adjacentId) {
      this.focusTile(adjacentId);
      return true;
    }
    return false;
  }

  /**
   * Swap focused tile with adjacent tile in given direction
   */
  swapDirection(direction: Direction): boolean {
    if (!this.focusedTileId) return false;

    const tileBounds = this.getTileBounds();
    const adjacentId = findAdjacentTile(tileBounds, this.focusedTileId, direction);

    if (!adjacentId) return false;

    // Swap the tiles in the layout tree (this swaps the tileIds at their positions)
    this.layout = swapTiles(this.layout, this.focusedTileId, adjacentId);

    // Update layout to recalculate bounds - tiles will get new positions
    this.updateLayout();
    return true;
  }

  /**
   * Resize the focused tile in a specific direction
   */
  resizeInDirection(direction: Direction, delta: number = 0.05): boolean {
    if (!this.focusedTileId) return false;

    this.layout = adjustSplitInDirection(this.layout, this.focusedTileId, direction, delta);
    this.updateLayout();
    return true;
  }

  /**
   * Serialize current state to a Workspace object
   */
  serialize(workspaceId: string, workspaceName: string): Workspace {
    const tiles: TileState[] = [];

    // Include active tiles
    for (const [id, proxy] of this.tileProxies) {
      tiles.push({
        id,
        url: proxy.url,
        title: proxy.title,
        isMuted: proxy.isMuted,
      });
    }

    // Include sleeping tiles
    for (const [id, sleepingTile] of this.sleepingTiles) {
      tiles.push({
        id,
        url: sleepingTile.url,
        title: sleepingTile.title,
        isMuted: sleepingTile.isMuted,
      });
    }

    return {
      id: workspaceId,
      name: workspaceName,
      layout: this.layout as SerializedLayoutNode,
      tiles,
      focusedTileId: this.focusedTileId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Restore from a Workspace object
   */
  async restore(workspace: Workspace): Promise<void> {
    // Clear existing tiles
    await this.clearAllTiles();

    // Restore layout
    this.layout = workspace.layout as LayoutNode;

    // Create tiles for each saved tile
    for (const tileState of workspace.tiles) {
      await this.createTile(tileState.id, tileState.url, tileState.isMuted ?? false);
      const proxy = this.tileProxies.get(tileState.id);
      if (proxy) {
        proxy.title = tileState.title;
      }
    }

    // Restore focus
    if (workspace.focusedTileId && this.tileProxies.has(workspace.focusedTileId)) {
      this.focusedTileId = workspace.focusedTileId;
    } else {
      const allIds = getAllTileIds(this.layout);
      this.focusedTileId = allIds[0] || null;
    }

    this.updateLayout();
  }

  /**
   * Clear all tiles
   */
  private async clearAllTiles(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const tileId of this.tileProxies.keys()) {
      promises.push(this.removeTile(tileId));
    }
    await Promise.all(promises);

    for (const tileId of this.sleepingTiles.keys()) {
      this.removeSleepingTile(tileId);
    }

    this.tileProxies.clear();
    this.sleepingTiles.clear();
    this.focusedTileId = null;
  }

  /**
   * Put a tile to sleep
   */
  private async sleepTile(tileId: string): Promise<void> {
    const proxy = this.tileProxies.get(tileId);
    if (!proxy) return;

    // Don't sleep the focused tile
    if (tileId === this.focusedTileId) return;

    // Capture snapshot
    let snapshot = '';
    try {
      const result = await window.tilora.tiles.capture(this.getViewId(tileId));
      snapshot = result.dataUrl;
    } catch (e) {
      console.warn('Failed to capture snapshot for tile:', tileId, e);
    }

    // Create placeholder element
    const element = this.createSleepingPlaceholder(tileId, proxy.title, snapshot);

    // Store sleeping tile data with placeholder element
    const sleepingTile: SleepingTile = {
      id: tileId,
      url: proxy.url,
      title: proxy.title,
      snapshot,
      isMuted: proxy.isMuted,
      element,
    };
    this.sleepingTiles.set(tileId, sleepingTile);

    // Remove the view
    await this.removeTile(tileId);

    // Add placeholder to container
    this.container.appendChild(element);

    console.log('Tile put to sleep:', tileId);
  }

  /**
   * Wake a sleeping tile
   */
  private async wakeTile(tileId: string): Promise<void> {
    const sleepingTile = this.sleepingTiles.get(tileId);
    if (!sleepingTile) return;

    // Remove placeholder
    sleepingTile.element.remove();
    this.sleepingTiles.delete(tileId);

    // Recreate tile
    await this.createTile(tileId, sleepingTile.url, sleepingTile.isMuted);
    const proxy = this.tileProxies.get(tileId);
    if (proxy) {
      proxy.title = sleepingTile.title;
    }

    console.log('Tile woken up:', tileId);
  }

  /**
   * Create placeholder for sleeping tile
   */
  private createSleepingPlaceholder(tileId: string, title: string, snapshot: string): HTMLElement {
    const element = document.createElement('div');
    element.className = 'sleeping-tile';
    element.dataset.tileId = tileId;
    element.style.cssText = `
      position: absolute;
      box-sizing: border-box;
      border: 1px solid #404040;
      background: #1e1e1e;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
    `;

    if (snapshot) {
      const img = document.createElement('img');
      img.src = snapshot;
      img.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        opacity: 0.5;
        filter: grayscale(50%);
      `;
      element.appendChild(img);
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
    `;

    const icon = document.createElement('div');
    icon.textContent = '💤';
    icon.style.fontSize = '24px';
    overlay.appendChild(icon);

    const label = document.createElement('div');
    label.textContent = title || 'Sleeping';
    label.style.cssText = `
      color: #888;
      font-size: 12px;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    `;
    overlay.appendChild(label);

    const hint = document.createElement('div');
    hint.textContent = 'Click to wake';
    hint.style.cssText = `color: #666; font-size: 10px;`;
    overlay.appendChild(hint);

    element.appendChild(overlay);

    element.addEventListener('click', () => {
      void this.wakeTile(tileId).then(() => {
        this.focusTile(tileId);
        this.updateLayout();
      });
    });

    return element;
  }

  /**
   * Remove sleeping tile placeholder
   */
  private removeSleepingTile(tileId: string): void {
    const sleepingTile = this.sleepingTiles.get(tileId);
    if (sleepingTile) {
      sleepingTile.element.remove();
      this.sleepingTiles.delete(tileId);
    }
  }

  /**
   * Check if tile should sleep based on size
   */
  private shouldSleep(bounds: Bounds): boolean {
    return bounds.width < TILE_LIFECYCLE.sleepThresholdWidth ||
           bounds.height < TILE_LIFECYCLE.sleepThresholdHeight;
  }

  /**
   * Check if a tile is sleeping
   */
  isTileSleeping(tileId: string): boolean {
    return this.sleepingTiles.has(tileId);
  }

  /**
   * Handle tile fullscreen
   */
  private handleTileFullscreen(tileId: string, entering: boolean): void {
    if (entering) {
      this.fullscreenTileId = tileId;
      void window.tilora.exitWindowFullscreen();
    } else {
      this.fullscreenTileId = null;
      // Restore tile bounds after exiting fullscreen
      this.updateLayout();
    }
  }

  /**
   * Check if any tile is in fullscreen
   */
  isFullscreen(): boolean {
    return this.fullscreenTileId !== null;
  }

  /**
   * Exit fullscreen mode
   */
  exitFullscreen(): void {
    // Fullscreen exit is handled by main process
  }

  private notifyStateChange(): void {
    this.onStateChange?.();
  }
}

// Re-export for backward compatibility
export type { TileProxy as Tile } from './tile-proxy';
