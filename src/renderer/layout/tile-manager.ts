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

export interface Tile {
  id: string;
  webview: Electron.WebviewTag;
  url: string;
  title: string;
}

export class TileManager {
  private container: HTMLElement;
  private layout: LayoutNode;
  private tiles: Map<string, Tile> = new Map();
  private focusedTileId: string | null = null;
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

  private createTileWebview(tileId: string, url: string): Tile {
    const webview = document.createElement('webview') as Electron.WebviewTag;

    // Style for absolute positioning
    webview.style.position = 'absolute';
    webview.style.border = '1px solid #404040';
    webview.style.boxSizing = 'border-box';

    // Webview attributes
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=yes');

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

    // Add to container
    this.container.appendChild(webview);

    // Load URL
    webview.src = url;

    const tile: Tile = { id: tileId, webview, url, title: 'New Tab' };
    this.tiles.set(tileId, tile);

    return tile;
  }

  private removeTileWebview(tileId: string): void {
    const tile = this.tiles.get(tileId);
    if (tile) {
      tile.webview.remove();
      this.tiles.delete(tileId);
    }
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
      if (tile) {
        this.applyBounds(tile.webview, bounds);
      }
    }

    // Update focus indicator
    this.updateFocusIndicator();
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

    // Remove the webview
    this.removeTileWebview(targetId);

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
    if (!this.tiles.has(tileId)) return;

    this.focusedTileId = tileId;
    this.updateFocusIndicator();
    this.onFocusChange?.(tileId);

    // Focus the webview
    const tile = this.tiles.get(tileId);
    tile?.webview.focus();
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
    for (const [id, tile] of this.tiles) {
      tiles.push({
        id,
        url: tile.url,
        title: tile.title,
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

    // Create webviews for each tile
    for (const tileState of workspace.tiles) {
      this.createTileWebview(tileState.id, tileState.url);
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
    this.tiles.clear();
    this.focusedTileId = null;
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
