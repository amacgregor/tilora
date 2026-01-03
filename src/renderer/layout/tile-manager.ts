/**
 * TileManager - Manages tiles (webviews) and their layout
 */

import {
  LayoutNode,
  LeafNode,
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
import type { Workspace, TileState, SerializedLayoutNode } from '@shared/workspace';
import { TILE_LIFECYCLE } from '@shared/constants';

export interface Tile {
  id: string;
  webview: Electron.WebviewTag;
  url: string;
  title: string;
  isMuted: boolean;
  isAudioPlaying: boolean;
  audioIndicator: HTMLElement | null;
  errorOverlay: HTMLElement | null;
  hasError: boolean;
}

export interface SleepingTile {
  id: string;
  url: string;
  title: string;
  snapshot: string | null; // Base64 data URL
  element: HTMLElement; // Placeholder element showing snapshot
}

export class TileManager {
  private container: HTMLElement;
  private layout: LayoutNode;
  private tiles: Map<string, Tile> = new Map();
  private sleepingTiles: Map<string, SleepingTile> = new Map();
  private focusedTileId: string | null = null;
  private fullscreenTileId: string | null = null;
  private onFocusChange?: (tileId: string) => void;
  private onUrlChange?: (tileId: string, url: string) => void;
  private onTitleChange?: (tileId: string, title: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;

    // Create initial single tile
    const initialLeaf = createLeaf();
    this.layout = initialLeaf;

    // Create the webview for initial tile
    this.createTileWebview(initialLeaf.tileId, 'https://www.google.com');
    this.focusedTileId = initialLeaf.tileId;

    // Initial layout
    this.updateLayout();

    // Handle window resize
    window.addEventListener('resize', () => this.updateLayout());
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

  private createTileWebview(tileId: string, url: string, muted: boolean = false): Tile {
    const webview = document.createElement('webview') as Electron.WebviewTag;

    // Style for absolute positioning
    webview.style.position = 'absolute';
    webview.style.border = '1px solid #404040';
    webview.style.boxSizing = 'border-box';

    // Webview attributes
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('plugins', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=yes, autoplayPolicy=no-user-gesture-required');

    // Inject fullscreen override when DOM is ready
    webview.addEventListener('dom-ready', () => {
      this.injectFullscreenOverride(webview);

      // Apply mute state
      if (muted) {
        webview.setAudioMuted(true);
      }
    });

    // Handle fullscreen within tile (not monitor)
    webview.addEventListener('enter-html-full-screen', () => {
      this.handleTileFullscreen(tileId, true);
    });

    webview.addEventListener('leave-html-full-screen', () => {
      this.handleTileFullscreen(tileId, false);
    });

    // Add click handler to focus this tile
    webview.addEventListener('focus', () => this.focusTile(tileId));
    webview.addEventListener('click', () => this.focusTile(tileId));

    // Navigation events
    webview.addEventListener('did-navigate', ((e: CustomEvent) => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.url = webview.getURL();
        this.onUrlChange?.(tileId, tile.url);
      }
    }) as EventListener);

    webview.addEventListener('did-navigate-in-page', (() => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.url = webview.getURL();
        this.onUrlChange?.(tileId, tile.url);
      }
    }) as EventListener);

    webview.addEventListener('page-title-updated', ((e: CustomEvent) => {
      const title = e.detail?.title || webview.getTitle?.() || '';
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.title = title;
      }
      this.onTitleChange?.(tileId, title);
    }) as EventListener);

    // Audio state change detection
    webview.addEventListener('media-started-playing', () => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.isAudioPlaying = true;
        this.updateAudioIndicator(tile);
      }
    });

    webview.addEventListener('media-paused', () => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.isAudioPlaying = false;
        this.updateAudioIndicator(tile);
      }
    });

    // Error handling
    webview.addEventListener('did-fail-load', ((e: CustomEvent) => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        const errorCode = e.detail?.errorCode ?? (e as any).errorCode;
        const errorDescription = e.detail?.errorDescription ?? (e as any).errorDescription ?? 'Unknown error';
        // Ignore aborted loads (user navigation)
        if (errorCode !== -3) {
          this.showErrorOverlay(tile, errorDescription);
        }
      }
    }) as EventListener);

    webview.addEventListener('did-start-loading', () => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        this.hideErrorOverlay(tile);
      }
    });

    // Add to container
    this.container.appendChild(webview);

    // Load URL
    webview.src = url;

    const tile: Tile = {
      id: tileId,
      webview,
      url,
      title: 'New Tab',
      isMuted: muted,
      isAudioPlaying: false,
      audioIndicator: null,
      errorOverlay: null,
      hasError: false,
    };
    this.tiles.set(tileId, tile);

    return tile;
  }

  private removeTileWebview(tileId: string): void {
    const tile = this.tiles.get(tileId);
    if (tile) {
      // Remove audio indicator if present
      if (tile.audioIndicator) {
        tile.audioIndicator.remove();
      }
      // Remove error overlay if present
      if (tile.errorOverlay) {
        tile.errorOverlay.remove();
      }
      tile.webview.remove();
      this.tiles.delete(tileId);
    }
  }

  /**
   * Update or create the audio indicator for a tile
   */
  private updateAudioIndicator(tile: Tile): void {
    const shouldShow = tile.isAudioPlaying || tile.isMuted;

    if (!shouldShow) {
      // Remove indicator if not needed
      if (tile.audioIndicator) {
        tile.audioIndicator.remove();
        tile.audioIndicator = null;
      }
      return;
    }

    // Create indicator if it doesn't exist
    if (!tile.audioIndicator) {
      tile.audioIndicator = this.createAudioIndicator(tile.id);
      this.container.appendChild(tile.audioIndicator);
    }

    // Update icon based on state
    const icon = tile.audioIndicator.querySelector('.audio-icon') as HTMLElement;
    if (icon) {
      if (tile.isMuted) {
        icon.textContent = '🔇';
        icon.title = 'Muted (click to unmute)';
      } else {
        icon.textContent = '🔊';
        icon.title = 'Playing audio (click to mute)';
      }
    }

    // Position the indicator
    this.positionAudioIndicator(tile);
  }

  /**
   * Create the audio indicator element
   */
  private createAudioIndicator(tileId: string): HTMLElement {
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

    // Click to toggle mute
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute(tileId);
    });

    return indicator;
  }

  /**
   * Position the audio indicator relative to its tile
   */
  private positionAudioIndicator(tile: Tile): void {
    if (!tile.audioIndicator) return;

    // Get the webview's position from its style (already relative to container)
    const left = parseFloat(tile.webview.style.left) || 0;
    const top = parseFloat(tile.webview.style.top) || 0;
    const width = parseFloat(tile.webview.style.width) || 0;

    // Position indicator in top-right corner of tile
    tile.audioIndicator.style.left = `${left + width - 36}px`;
    tile.audioIndicator.style.top = `${top + 6}px`;
  }

  /**
   * Toggle mute state for a tile
   */
  toggleMute(tileId?: string): void {
    const targetId = tileId || this.focusedTileId;
    if (!targetId) return;

    const tile = this.tiles.get(targetId);
    if (!tile) return;

    tile.isMuted = !tile.isMuted;
    tile.webview.setAudioMuted(tile.isMuted);
    this.updateAudioIndicator(tile);
    this.notifyStateChange();
  }

  /**
   * Mute a specific tile
   */
  muteTile(tileId: string): void {
    const tile = this.tiles.get(tileId);
    if (!tile) return;

    tile.isMuted = true;
    tile.webview.setAudioMuted(true);
    this.updateAudioIndicator(tile);
    this.notifyStateChange();
  }

  /**
   * Unmute a specific tile
   */
  unmuteTile(tileId: string): void {
    const tile = this.tiles.get(tileId);
    if (!tile) return;

    tile.isMuted = false;
    tile.webview.setAudioMuted(false);
    this.updateAudioIndicator(tile);
    this.notifyStateChange();
  }

  /**
   * Mute all tiles except the focused one
   */
  muteAllExceptFocused(): void {
    for (const [tileId, tile] of this.tiles) {
      if (tileId === this.focusedTileId) {
        // Ensure focused tile is unmuted
        tile.isMuted = false;
        tile.webview.setAudioMuted(false);
        this.updateAudioIndicator(tile);
      } else {
        // Mute all other tiles
        tile.isMuted = true;
        tile.webview.setAudioMuted(true);
        this.updateAudioIndicator(tile);
      }
    }
    this.notifyStateChange();
  }

  /**
   * Unmute all tiles
   */
  unmuteAll(): void {
    for (const [, tile] of this.tiles) {
      tile.isMuted = false;
      tile.webview.setAudioMuted(false);
      this.updateAudioIndicator(tile);
    }
    this.notifyStateChange();
  }

  /**
   * Check if focused tile is muted
   */
  isFocusedTileMuted(): boolean {
    const tile = this.getFocusedTile();
    return tile?.isMuted ?? false;
  }

  /**
   * Show error overlay on a tile
   */
  private showErrorOverlay(tile: Tile, errorMessage: string): void {
    tile.hasError = true;

    // Create overlay if it doesn't exist
    if (!tile.errorOverlay) {
      tile.errorOverlay = this.createErrorOverlay(tile.id);
      this.container.appendChild(tile.errorOverlay);
    }

    // Update error message
    const messageEl = tile.errorOverlay.querySelector('.error-message') as HTMLElement;
    if (messageEl) {
      messageEl.textContent = errorMessage;
    }

    // Position the overlay
    this.positionErrorOverlay(tile);
    tile.errorOverlay.style.display = 'flex';
  }

  /**
   * Hide error overlay
   */
  private hideErrorOverlay(tile: Tile): void {
    tile.hasError = false;
    if (tile.errorOverlay) {
      tile.errorOverlay.style.display = 'none';
    }
  }

  /**
   * Create error overlay element
   */
  private createErrorOverlay(tileId: string): HTMLElement {
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
    title.style.cssText = `
      color: #fff;
      font-size: 18px;
      font-weight: bold;
    `;
    overlay.appendChild(title);

    const message = document.createElement('div');
    message.className = 'error-message';
    message.style.cssText = `
      color: #888;
      font-size: 14px;
      text-align: center;
      max-width: 300px;
    `;
    overlay.appendChild(message);

    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.style.cssText = `
      background: #0078d4;
      color: white;
      border: none;
      padding: 8px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-top: 8px;
    `;
    retryBtn.addEventListener('click', () => {
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.webview.reload();
      }
    });
    overlay.appendChild(retryBtn);

    return overlay;
  }

  /**
   * Position error overlay to match tile bounds
   */
  private positionErrorOverlay(tile: Tile): void {
    if (!tile.errorOverlay) return;

    // Get the webview's position from its style (already relative to container)
    const left = tile.webview.style.left;
    const top = tile.webview.style.top;
    const width = tile.webview.style.width;
    const height = tile.webview.style.height;

    tile.errorOverlay.style.left = left;
    tile.errorOverlay.style.top = top;
    tile.errorOverlay.style.width = width;
    tile.errorOverlay.style.height = height;
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

    for (const { tileId, bounds } of tileBounds) {
      const tile = this.tiles.get(tileId);
      const sleepingTile = this.sleepingTiles.get(tileId);

      if (tile) {
        // Active tile - check if it should sleep
        if (this.shouldSleep(bounds) && tileId !== this.focusedTileId) {
          // Put tile to sleep (async, but we don't wait)
          this.sleepTile(tileId).then(() => {
            // Update bounds for the new placeholder
            const st = this.sleepingTiles.get(tileId);
            if (st) {
              this.applyBoundsToElement(st.element, bounds);
            }
          });
        } else {
          this.applyBounds(tile.webview, bounds);
        }
      } else if (sleepingTile) {
        // Sleeping tile - check if it should wake
        if (!this.shouldSleep(bounds)) {
          // Wake the tile if it's now large enough
          this.wakeTile(tileId);
          const awakenedTile = this.tiles.get(tileId);
          if (awakenedTile) {
            this.applyBounds(awakenedTile.webview, bounds);
          }
        } else {
          // Update placeholder position
          this.applyBoundsToElement(sleepingTile.element, bounds);
        }
      }
    }

    // Update focus indicator
    this.updateFocusIndicator();

    // Update audio indicator positions
    this.updateAudioIndicatorPositions();

    // Update error overlay positions
    this.updateErrorOverlayPositions();
  }

  /**
   * Update all audio indicator positions
   */
  private updateAudioIndicatorPositions(): void {
    for (const [, tile] of this.tiles) {
      if (tile.audioIndicator) {
        this.positionAudioIndicator(tile);
      }
    }
  }

  /**
   * Update all error overlay positions
   */
  private updateErrorOverlayPositions(): void {
    for (const [, tile] of this.tiles) {
      if (tile.errorOverlay && tile.hasError) {
        this.positionErrorOverlay(tile);
      }
    }
  }

  private applyBoundsToElement(element: HTMLElement, bounds: Bounds): void {
    element.style.left = `${bounds.x}px`;
    element.style.top = `${bounds.y}px`;
    element.style.width = `${bounds.width}px`;
    element.style.height = `${bounds.height}px`;
  }

  private applyBounds(webview: Electron.WebviewTag, bounds: Bounds): void {
    webview.style.left = `${bounds.x}px`;
    webview.style.top = `${bounds.y}px`;
    webview.style.width = `${bounds.width}px`;
    webview.style.height = `${bounds.height}px`;
  }

  private updateFocusIndicator(): void {
    for (const [tileId, tile] of this.tiles) {
      if (tileId === this.focusedTileId) {
        tile.webview.style.border = '2px solid #0078d4';
      } else {
        tile.webview.style.border = '1px solid #404040';
      }
    }
  }

  /**
   * Split the focused tile
   */
  split(direction: SplitDirection): string | null {
    if (!this.focusedTileId) return null;

    const result = splitNode(this.layout, this.focusedTileId, direction);
    if (!result) return null;

    this.layout = result.newRoot;

    // Create webview for new tile
    this.createTileWebview(result.newTileId, 'https://www.google.com');

    // Update layout
    this.updateLayout();

    // Focus the new tile
    this.focusTile(result.newTileId);

    return result.newTileId;
  }

  /**
   * Close a tile
   */
  closeTile(tileId?: string): boolean {
    const targetId = tileId || this.focusedTileId;
    if (!targetId) return false;

    // Don't close if it's the only tile
    if (countTiles(this.layout) <= 1) return false;

    const newLayout = removeNode(this.layout, targetId);
    if (!newLayout) return false;

    // Remove the webview or sleeping tile placeholder
    if (this.tiles.has(targetId)) {
      this.removeTileWebview(targetId);
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
      this.wakeTile(tileId);
    }

    if (!this.tiles.has(tileId)) return;

    this.focusedTileId = tileId;
    this.updateFocusIndicator();
    this.onFocusChange?.(tileId);

    // Focus the webview
    const tile = this.tiles.get(tileId);
    tile?.webview.focus();

    // Update layout to position the newly awakened tile
    this.updateLayout();
  }

  /**
   * Get focused tile
   */
  getFocusedTile(): Tile | null {
    if (!this.focusedTileId) return null;
    return this.tiles.get(this.focusedTileId) || null;
  }

  /**
   * Navigate focused tile to URL
   */
  navigate(url: string): void {
    const tile = this.getFocusedTile();
    if (!tile) return;

    let finalUrl = url.trim();
    if (!finalUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:/)) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl);
      }
    }

    tile.webview.src = finalUrl;
  }

  /**
   * Navigation controls for focused tile
   */
  goBack(): void {
    const tile = this.getFocusedTile();
    if (tile?.webview.canGoBack()) {
      tile.webview.goBack();
    }
  }

  goForward(): void {
    const tile = this.getFocusedTile();
    if (tile?.webview.canGoForward()) {
      tile.webview.goForward();
    }
  }

  reload(): void {
    const tile = this.getFocusedTile();
    if (tile) {
      if (tile.webview.isLoading()) {
        tile.webview.stop();
      } else {
        tile.webview.reload();
      }
    }
  }

  canGoBack(): boolean {
    const tile = this.getFocusedTile();
    return tile?.webview.canGoBack() || false;
  }

  canGoForward(): boolean {
    const tile = this.getFocusedTile();
    return tile?.webview.canGoForward() || false;
  }

  isLoading(): boolean {
    const tile = this.getFocusedTile();
    return tile?.webview.isLoading() || false;
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
    const tile = this.getFocusedTile();
    return tile?.url || '';
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

    // Swap the tiles in the layout tree
    this.layout = swapTiles(this.layout, this.focusedTileId, adjacentId);

    // Swap the tile data in our map
    const tile1 = this.tiles.get(this.focusedTileId);
    const tile2 = this.tiles.get(adjacentId);

    if (tile1 && tile2) {
      // Swap the IDs in the tile objects
      tile1.id = adjacentId;
      tile2.id = this.focusedTileId;

      // Update the map
      this.tiles.set(adjacentId, tile1);
      this.tiles.set(this.focusedTileId, tile2);

      // Update focused tile ID to follow the original tile
      this.focusedTileId = adjacentId;
    }

    this.updateLayout();
    return true;
  }

  /**
   * Resize the focused tile in a specific direction
   * @param direction - Direction to resize (left/right/up/down)
   * @param delta - Amount to resize (positive = grow in that direction)
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
    for (const [id, tile] of this.tiles) {
      tiles.push({
        id,
        url: tile.url,
        title: tile.title,
        isMuted: tile.isMuted,
      });
    }

    // Include sleeping tiles
    for (const [id, sleepingTile] of this.sleepingTiles) {
      tiles.push({
        id,
        url: sleepingTile.url,
        title: sleepingTile.title,
        isMuted: false, // Sleeping tiles don't have audio
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
  restore(workspace: Workspace): void {
    // Clear existing tiles
    this.clearAllTiles();

    // Restore layout
    this.layout = workspace.layout as LayoutNode;

    // Create webviews for each tile with mute state
    for (const tileState of workspace.tiles) {
      this.createTileWebview(tileState.id, tileState.url, tileState.isMuted ?? false);
      const tile = this.tiles.get(tileState.id);
      if (tile) {
        tile.title = tileState.title;
      }
    }

    // Restore focus
    if (workspace.focusedTileId && this.tiles.has(workspace.focusedTileId)) {
      this.focusedTileId = workspace.focusedTileId;
    } else {
      const allIds = getAllTileIds(this.layout);
      this.focusedTileId = allIds[0] || null;
    }

    this.updateLayout();
  }

  /**
   * Clear all tiles from the container
   */
  private clearAllTiles(): void {
    for (const [tileId] of this.tiles) {
      this.removeTileWebview(tileId);
    }
    for (const [tileId] of this.sleepingTiles) {
      this.removeSleepingTile(tileId);
    }
    this.tiles.clear();
    this.sleepingTiles.clear();
    this.focusedTileId = null;
  }

  /**
   * Put a tile to sleep - capture snapshot and replace webview with placeholder
   */
  private async sleepTile(tileId: string): Promise<void> {
    const tile = this.tiles.get(tileId);
    if (!tile) return;

    // Don't sleep the focused tile
    if (tileId === this.focusedTileId) return;

    // Capture snapshot before sleeping
    let snapshot: string | null = null;
    try {
      const nativeImage = await tile.webview.capturePage();
      snapshot = nativeImage.toDataURL();
    } catch (e) {
      console.warn('Failed to capture snapshot for tile:', tileId, e);
    }

    // Create placeholder element
    const element = this.createSleepingPlaceholder(tileId, tile.title, snapshot);

    // Store sleeping tile data
    const sleepingTile: SleepingTile = {
      id: tileId,
      url: tile.url,
      title: tile.title,
      snapshot,
      element,
    };
    this.sleepingTiles.set(tileId, sleepingTile);

    // Remove the webview
    tile.webview.remove();
    this.tiles.delete(tileId);

    // Add placeholder to container
    this.container.appendChild(element);

    console.log('Tile put to sleep:', tileId);
  }

  /**
   * Wake a sleeping tile - restore the webview
   */
  private wakeTile(tileId: string): void {
    const sleepingTile = this.sleepingTiles.get(tileId);
    if (!sleepingTile) return;

    // Remove placeholder
    sleepingTile.element.remove();
    this.sleepingTiles.delete(tileId);

    // Recreate webview
    this.createTileWebview(tileId, sleepingTile.url);
    const tile = this.tiles.get(tileId);
    if (tile) {
      tile.title = sleepingTile.title;
    }

    console.log('Tile woken up:', tileId);
  }

  /**
   * Create a placeholder element for a sleeping tile
   */
  private createSleepingPlaceholder(tileId: string, title: string, snapshot: string | null): HTMLElement {
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

    // Add snapshot image if available
    if (snapshot) {
      const img = document.createElement('img');
      img.src = snapshot;
      img.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.5;
        filter: grayscale(50%);
      `;
      element.appendChild(img);
    }

    // Add sleeping indicator overlay
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
    hint.style.cssText = `
      color: #666;
      font-size: 10px;
    `;
    overlay.appendChild(hint);

    element.appendChild(overlay);

    // Click to wake
    element.addEventListener('click', () => {
      this.wakeTile(tileId);
      this.focusTile(tileId);
      this.updateLayout();
    });

    return element;
  }

  /**
   * Remove a sleeping tile placeholder
   */
  private removeSleepingTile(tileId: string): void {
    const sleepingTile = this.sleepingTiles.get(tileId);
    if (sleepingTile) {
      sleepingTile.element.remove();
      this.sleepingTiles.delete(tileId);
    }
  }

  /**
   * Check if a tile should be sleeping based on its size
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
   * Inject JavaScript to override the Fullscreen API
   * Makes "fullscreen" just fill the webview instead of the monitor
   * This approach: fake the API without modifying styles, let the site render naturally
   */
  private injectFullscreenOverride(webview: Electron.WebviewTag): void {
    const js = `
      (function() {
        if (window.__tiloraFullscreenOverride) return;
        window.__tiloraFullscreenOverride = true;

        let currentFullscreenElement = null;

        // Simply fake the fullscreen state - don't modify any styles
        // Let the website render its fullscreen UI naturally within the webview
        Element.prototype.requestFullscreen = function(options) {
          currentFullscreenElement = this;

          // Add the standard fullscreen class that sites might check for
          this.classList.add('fullscreen');
          document.body.classList.add('fullscreen');

          // Dispatch the event so the site knows fullscreen is "active"
          document.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
          this.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));

          return Promise.resolve();
        };

        // Webkit version
        Element.prototype.webkitRequestFullscreen = Element.prototype.requestFullscreen;

        Document.prototype.exitFullscreen = function() {
          if (currentFullscreenElement) {
            currentFullscreenElement.classList.remove('fullscreen');
            document.body.classList.remove('fullscreen');
            currentFullscreenElement = null;
          }
          document.dispatchEvent(new Event('fullscreenchange', { bubbles: true }));
          return Promise.resolve();
        };

        Document.prototype.webkitExitFullscreen = Document.prototype.exitFullscreen;

        // Fake the fullscreen element getters
        Object.defineProperty(Document.prototype, 'fullscreenElement', {
          get: function() { return currentFullscreenElement; },
          configurable: true
        });

        Object.defineProperty(Document.prototype, 'webkitFullscreenElement', {
          get: function() { return currentFullscreenElement; },
          configurable: true
        });

        Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
          get: function() { return true; },
          configurable: true
        });

        Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', {
          get: function() { return true; },
          configurable: true
        });

        // Handle Escape to exit
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && currentFullscreenElement) {
            document.exitFullscreen();
          }
        }, true);

        console.log('Tilora: Fullscreen API override installed (passthrough mode)');
      })();
    `;

    webview.executeJavaScript(js).catch(() => {});
  }

  /**
   * Handle tile fullscreen (contained within tile, not monitor)
   * The video fills just the tile's space, other tiles remain visible
   */
  private handleTileFullscreen(tileId: string, entering: boolean): void {
    if (entering) {
      this.fullscreenTileId = tileId;

      // Exit the window's fullscreen mode if it was triggered
      window.tilora.exitWindowFullscreen();

      // Just raise the z-index slightly so fullscreen content is on top
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.webview.style.zIndex = '10';
      }
    } else {
      this.fullscreenTileId = null;
      // Reset z-index
      const tile = this.tiles.get(tileId);
      if (tile) {
        tile.webview.style.zIndex = '';
      }
    }
  }

  /**
   * Check if a tile is in fullscreen mode
   */
  isFullscreen(): boolean {
    return this.fullscreenTileId !== null;
  }

  /**
   * Exit fullscreen mode
   */
  exitFullscreen(): void {
    if (this.fullscreenTileId) {
      const tile = this.tiles.get(this.fullscreenTileId);
      if (tile) {
        // Trigger exit fullscreen in the webview
        tile.webview.executeJavaScript('document.exitFullscreen && document.exitFullscreen()');
      }
    }
  }

  /**
   * Notify that state has changed (for auto-save)
   */
  private onStateChange?: () => void;

  setOnStateChange(callback: () => void): void {
    this.onStateChange = callback;
  }

  private notifyStateChange(): void {
    this.onStateChange?.();
  }
}
