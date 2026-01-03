import './styles/main.css';
import { TileManager } from './layout/tile-manager';
import type { AppState, Workspace } from '@shared/workspace';
import { createDefaultWorkspace } from '@shared/workspace';

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
  private btnWorkspace: HTMLButtonElement;
  private tileContainer: HTMLElement;
  private tileManager: TileManager;

  // Workspace state
  private appState: AppState | null = null;
  private activeWorkspaceIndex: number = 0;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1000;

  constructor() {
    this.urlBar = document.getElementById('url-bar') as HTMLInputElement;
    this.btnBack = document.getElementById('btn-back') as HTMLButtonElement;
    this.btnForward = document.getElementById('btn-forward') as HTMLButtonElement;
    this.btnReload = document.getElementById('btn-reload') as HTMLButtonElement;
    this.btnSplitV = document.getElementById('btn-split-v') as HTMLButtonElement;
    this.btnSplitH = document.getElementById('btn-split-h') as HTMLButtonElement;
    this.btnWorkspace = document.getElementById('btn-workspace') as HTMLButtonElement;
    this.tileContainer = document.getElementById('tile-container') as HTMLElement;

    // Create tile manager (will be restored from saved state)
    this.tileManager = new TileManager(this.tileContainer);

    // Setup callbacks
    this.tileManager.setCallbacks({
      onFocusChange: (tileId) => this.onTileFocused(tileId),
      onUrlChange: (tileId, url) => this.onUrlChanged(tileId, url),
      onTitleChange: (tileId, title) => this.onTitleChanged(tileId, title),
    });

    // Auto-save on state changes
    this.tileManager.setOnStateChange(() => this.scheduleSave());

    this.setupEventListeners();
    this.setupIPCListeners();

    // Load saved state
    this.loadState();
  }

  /**
   * Load app state from persistence
   */
  private async loadState(): Promise<void> {
    try {
      this.appState = await window.tilora.loadAppState();

      // Find active workspace index
      this.activeWorkspaceIndex = this.appState.workspaces.findIndex(
        w => w.id === this.appState!.activeWorkspaceId
      );
      if (this.activeWorkspaceIndex < 0) this.activeWorkspaceIndex = 0;

      // Restore active workspace
      const activeWorkspace = this.appState.workspaces[this.activeWorkspaceIndex];
      if (activeWorkspace) {
        this.tileManager.restore(activeWorkspace);
        this.updateWorkspaceButton();
        this.urlBar.value = this.tileManager.getCurrentUrl();
      }
    } catch (error) {
      console.error('Failed to load app state:', error);
    }
    this.updateNavButtons();
  }

  /**
   * Schedule a debounced save
   */
  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => this.saveState(), this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Save current state to persistence
   */
  private async saveState(): Promise<void> {
    if (!this.appState) return;

    // Update current workspace in state
    const currentWorkspace = this.appState.workspaces[this.activeWorkspaceIndex];
    if (currentWorkspace) {
      const serialized = this.tileManager.serialize(currentWorkspace.id, currentWorkspace.name);
      serialized.createdAt = currentWorkspace.createdAt;
      this.appState.workspaces[this.activeWorkspaceIndex] = serialized;
    }

    try {
      await window.tilora.saveAppState(this.appState);
    } catch (error) {
      console.error('Failed to save app state:', error);
    }
  }

  /**
   * Switch to a workspace by index
   */
  private switchWorkspace(index: number): void {
    if (!this.appState) return;
    if (index < 0 || index >= this.appState.workspaces.length) return;
    if (index === this.activeWorkspaceIndex) return;

    // Save current workspace state first
    const currentWorkspace = this.appState.workspaces[this.activeWorkspaceIndex];
    if (currentWorkspace) {
      const serialized = this.tileManager.serialize(currentWorkspace.id, currentWorkspace.name);
      serialized.createdAt = currentWorkspace.createdAt;
      this.appState.workspaces[this.activeWorkspaceIndex] = serialized;
    }

    // Switch to new workspace
    this.activeWorkspaceIndex = index;
    this.appState.activeWorkspaceId = this.appState.workspaces[index]!.id;

    const newWorkspace = this.appState.workspaces[index]!;
    this.tileManager.restore(newWorkspace);
    this.updateWorkspaceButton();
    this.urlBar.value = this.tileManager.getCurrentUrl();
    this.updateNavButtons();

    // Save immediately
    this.saveState();
  }

  /**
   * Create a new workspace
   */
  private createNewWorkspace(): void {
    if (!this.appState) return;

    // Save current workspace
    const currentWorkspace = this.appState.workspaces[this.activeWorkspaceIndex];
    if (currentWorkspace) {
      const serialized = this.tileManager.serialize(currentWorkspace.id, currentWorkspace.name);
      serialized.createdAt = currentWorkspace.createdAt;
      this.appState.workspaces[this.activeWorkspaceIndex] = serialized;
    }

    // Create new workspace
    const newWorkspace = createDefaultWorkspace(`Workspace ${this.appState.workspaces.length + 1}`);
    this.appState.workspaces.push(newWorkspace);

    // Switch to new workspace
    this.activeWorkspaceIndex = this.appState.workspaces.length - 1;
    this.appState.activeWorkspaceId = newWorkspace.id;

    this.tileManager.restore(newWorkspace);
    this.updateWorkspaceButton();
    this.urlBar.value = this.tileManager.getCurrentUrl();
    this.updateNavButtons();

    // Save immediately
    this.saveState();
  }

  /**
   * Update workspace button text
   */
  private updateWorkspaceButton(): void {
    if (!this.appState) return;
    const workspace = this.appState.workspaces[this.activeWorkspaceIndex];
    if (workspace) {
      this.btnWorkspace.textContent = `${workspace.name} (${this.activeWorkspaceIndex + 1}/${this.appState.workspaces.length})`;
    }
  }

  private onTileFocused(tileId: string): void {
    // Update URL bar with focused tile's URL
    this.urlBar.value = this.tileManager.getCurrentUrl();
    this.updateNavButtons();
    this.scheduleSave();
  }

  private onUrlChanged(tileId: string, url: string): void {
    // Update URL bar if this is the focused tile
    const focused = this.tileManager.getFocusedTile();
    if (focused?.id === tileId) {
      this.urlBar.value = url;
      this.updateNavButtons();
    }
    this.scheduleSave();
  }

  private onTitleChanged(tileId: string, title: string): void {
    const focused = this.tileManager.getFocusedTile();
    if (focused?.id === tileId) {
      document.title = `${title} - Tilora`;
    }
    this.scheduleSave();
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
    // Workspace switching
    window.tilora.onSwitchWorkspace((index: number) => {
      this.switchWorkspace(index);
    });

    window.tilora.onNewWorkspace(() => {
      this.createNewWorkspace();
    });

    // Listen for menu commands from main process
    window.tilora.onSplitVertical(() => {
      this.tileManager.split('vertical');
      this.scheduleSave();
    });

    window.tilora.onSplitHorizontal(() => {
      this.tileManager.split('horizontal');
      this.scheduleSave();
    });

    window.tilora.onCloseTile(() => {
      this.tileManager.closeTile();
      this.scheduleSave();
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

    // Directional resize
    window.tilora.onResizeLeft(() => {
      this.tileManager.resizeInDirection('left');
    });

    window.tilora.onResizeRight(() => {
      this.tileManager.resizeInDirection('right');
    });

    window.tilora.onResizeUp(() => {
      this.tileManager.resizeInDirection('up');
    });

    window.tilora.onResizeDown(() => {
      this.tileManager.resizeInDirection('down');
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
