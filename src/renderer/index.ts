import './styles/main.css';
import { TileManager } from './layout/tile-manager';

/**
 * Tilora - Tiled Workspace Browser
 */

class TiloraApp {
  private urlBar: HTMLInputElement;
  private btnBack: HTMLButtonElement;
  private btnForward: HTMLButtonElement;
  private btnReload: HTMLButtonElement;
  private btnSplitV: HTMLButtonElement;
  private btnSplitH: HTMLButtonElement;
  private tileContainer: HTMLElement;
  private tileManager: TileManager;

  constructor() {
    this.urlBar = document.getElementById('url-bar') as HTMLInputElement;
    this.btnBack = document.getElementById('btn-back') as HTMLButtonElement;
    this.btnForward = document.getElementById('btn-forward') as HTMLButtonElement;
    this.btnReload = document.getElementById('btn-reload') as HTMLButtonElement;
    this.btnSplitV = document.getElementById('btn-split-v') as HTMLButtonElement;
    this.btnSplitH = document.getElementById('btn-split-h') as HTMLButtonElement;
    this.tileContainer = document.getElementById('tile-container') as HTMLElement;

    // Create tile manager
    this.tileManager = new TileManager(this.tileContainer);

    // Setup callbacks
    this.tileManager.setCallbacks({
      onFocusChange: (tileId) => this.onTileFocused(tileId),
      onUrlChange: (tileId, url) => this.onUrlChanged(tileId, url),
      onTitleChange: (tileId, title) => this.onTitleChanged(tileId, title),
    });

    this.setupEventListeners();
    this.setupIPCListeners();
    this.updateNavButtons();
  }

  private onTileFocused(tileId: string): void {
    // Update URL bar with focused tile's URL
    this.urlBar.value = this.tileManager.getCurrentUrl();
    this.updateNavButtons();
  }

  private onUrlChanged(tileId: string, url: string): void {
    // Update URL bar if this is the focused tile
    const focused = this.tileManager.getFocusedTile();
    if (focused?.id === tileId) {
      this.urlBar.value = url;
      this.updateNavButtons();
    }
  }

  private onTitleChanged(tileId: string, title: string): void {
    const focused = this.tileManager.getFocusedTile();
    if (focused?.id === tileId) {
      document.title = `${title} - Tilora`;
    }
  }

  private setupEventListeners(): void {
    // URL bar - navigate on Enter
    this.urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.tileManager.navigate(this.urlBar.value);
      }
    });

    // Select all on focus
    this.urlBar.addEventListener('focus', () => {
      this.urlBar.select();
    });

    // Navigation buttons
    this.btnBack.addEventListener('click', () => {
      this.tileManager.goBack();
    });

    this.btnForward.addEventListener('click', () => {
      this.tileManager.goForward();
    });

    this.btnReload.addEventListener('click', () => {
      this.tileManager.reload();
    });

    // Split buttons
    this.btnSplitV.addEventListener('click', () => {
      this.tileManager.split('vertical');
    });

    this.btnSplitH.addEventListener('click', () => {
      this.tileManager.split('horizontal');
    });
  }

  private setupIPCListeners(): void {
    // Listen for menu commands from main process
    window.tilora.onSplitVertical(() => {
      this.tileManager.split('vertical');
    });

    window.tilora.onSplitHorizontal(() => {
      this.tileManager.split('horizontal');
    });

    window.tilora.onCloseTile(() => {
      this.tileManager.closeTile();
    });

    window.tilora.onFocusUrlBar(() => {
      this.urlBar.focus();
      this.urlBar.select();
    });

    window.tilora.onReloadTile(() => {
      this.tileManager.reload();
      this.updateNavButtons();
    });

    window.tilora.onGoBack(() => {
      this.tileManager.goBack();
      this.updateNavButtons();
    });

    window.tilora.onGoForward(() => {
      this.tileManager.goForward();
      this.updateNavButtons();
    });

    // Directional focus navigation
    window.tilora.onFocusLeft(() => {
      this.tileManager.focusDirection('left');
      this.urlBar.value = this.tileManager.getCurrentUrl();
      this.updateNavButtons();
    });

    window.tilora.onFocusRight(() => {
      this.tileManager.focusDirection('right');
      this.urlBar.value = this.tileManager.getCurrentUrl();
      this.updateNavButtons();
    });

    window.tilora.onFocusUp(() => {
      this.tileManager.focusDirection('up');
      this.urlBar.value = this.tileManager.getCurrentUrl();
      this.updateNavButtons();
    });

    window.tilora.onFocusDown(() => {
      this.tileManager.focusDirection('down');
      this.urlBar.value = this.tileManager.getCurrentUrl();
      this.updateNavButtons();
    });

    // Tile swapping
    window.tilora.onSwapLeft(() => {
      this.tileManager.swapDirection('left');
    });

    window.tilora.onSwapRight(() => {
      this.tileManager.swapDirection('right');
    });

    window.tilora.onSwapUp(() => {
      this.tileManager.swapDirection('up');
    });

    window.tilora.onSwapDown(() => {
      this.tileManager.swapDirection('down');
    });

    // Resize
    window.tilora.onResizeGrow(() => {
      this.tileManager.resizeFocusedSplit(0.05);
    });

    window.tilora.onResizeShrink(() => {
      this.tileManager.resizeFocusedSplit(-0.05);
    });
  }

  private updateNavButtons(): void {
    this.btnBack.disabled = !this.tileManager.canGoBack();
    this.btnForward.disabled = !this.tileManager.canGoForward();

    if (this.tileManager.isLoading()) {
      this.btnReload.textContent = '✕';
      this.btnReload.title = 'Stop';
    } else {
      this.btnReload.textContent = '↻';
      this.btnReload.title = 'Reload';
    }
  }
}

// Start app
document.addEventListener('DOMContentLoaded', () => {
  new TiloraApp();
});
