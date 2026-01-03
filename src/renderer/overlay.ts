/**
 * Overlay window renderer
 * Displays focus borders and audio indicators on top of tiles
 */

import type { OverlayUpdatePayload, OverlayTileState } from '@shared/overlay-types';

// Extend window for overlay API
declare global {
  interface Window {
    overlay: {
      onUpdateTiles: (callback: (payload: OverlayUpdatePayload) => void) => () => void;
      toggleMute: (tileId: string) => void;
    };
  }
}

class OverlayRenderer {
  private container: HTMLElement;
  private borderElements: Map<string, HTMLElement> = new Map();
  private audioElements: Map<string, HTMLElement> = new Map();

  constructor() {
    this.container = document.getElementById('overlay-container')!;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    window.overlay.onUpdateTiles((payload) => {
      this.render(payload);
    });
  }

  private render(payload: OverlayUpdatePayload): void {
    const { tiles, focusedTileId } = payload;
    const currentTileIds = new Set(tiles.map(t => t.id));

    // Remove elements for tiles that no longer exist
    for (const [id, element] of this.borderElements) {
      if (!currentTileIds.has(id)) {
        element.remove();
        this.borderElements.delete(id);
      }
    }
    for (const [id, element] of this.audioElements) {
      if (!currentTileIds.has(id)) {
        element.remove();
        this.audioElements.delete(id);
      }
    }

    // Update or create elements for each tile
    for (const tile of tiles) {
      this.renderTileBorder(tile, focusedTileId);
      this.renderAudioIndicator(tile);
    }
  }

  private renderTileBorder(tile: OverlayTileState, focusedTileId: string | null): void {
    let element = this.borderElements.get(tile.id);

    if (!element) {
      element = document.createElement('div');
      element.className = 'tile-border';
      element.dataset.tileId = tile.id;
      this.container.appendChild(element);
      this.borderElements.set(tile.id, element);
    }

    // Update position and size
    element.style.left = `${tile.bounds.x}px`;
    element.style.top = `${tile.bounds.y}px`;
    element.style.width = `${tile.bounds.width}px`;
    element.style.height = `${tile.bounds.height}px`;

    // Update focus state
    if (tile.id === focusedTileId) {
      element.classList.add('focused');
    } else {
      element.classList.remove('focused');
    }
  }

  private renderAudioIndicator(tile: OverlayTileState): void {
    const shouldShow = tile.isAudioPlaying || tile.isMuted;

    if (!shouldShow) {
      const existing = this.audioElements.get(tile.id);
      if (existing) {
        existing.remove();
        this.audioElements.delete(tile.id);
      }
      return;
    }

    let element = this.audioElements.get(tile.id);

    if (!element) {
      element = document.createElement('div');
      element.className = 'audio-indicator';
      element.dataset.tileId = tile.id;

      const icon = document.createElement('span');
      icon.className = 'icon';
      element.appendChild(icon);

      element.addEventListener('click', (e) => {
        e.stopPropagation();
        window.overlay.toggleMute(tile.id);
      });

      this.container.appendChild(element);
      this.audioElements.set(tile.id, element);
    }

    // Update icon
    const icon = element.querySelector('.icon') as HTMLElement;
    if (tile.isMuted) {
      icon.textContent = '🔇';
      element.title = 'Click to unmute';
    } else {
      icon.textContent = '🔊';
      element.title = 'Click to mute';
    }

    // Position in top-right of tile
    element.style.left = `${tile.bounds.x + tile.bounds.width - 50}px`;
    element.style.top = `${tile.bounds.y + 8}px`;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new OverlayRenderer();
});
