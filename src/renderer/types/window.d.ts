/**
 * Type declarations for the tilora API exposed via preload
 */

interface TiloraAPI {
  getWindowBounds: () => Promise<{ width: number; height: number }>;
  onSplitVertical: (callback: () => void) => () => void;
  onSplitHorizontal: (callback: () => void) => () => void;
  onCloseTile: (callback: () => void) => () => void;
  onFocusUrlBar: (callback: () => void) => () => void;
  onReloadTile: (callback: () => void) => () => void;
  onGoBack: (callback: () => void) => () => void;
  onGoForward: (callback: () => void) => () => void;

  // Directional focus navigation
  onFocusLeft: (callback: () => void) => () => void;
  onFocusRight: (callback: () => void) => () => void;
  onFocusUp: (callback: () => void) => () => void;
  onFocusDown: (callback: () => void) => () => void;

  // Tile swapping
  onSwapLeft: (callback: () => void) => () => void;
  onSwapRight: (callback: () => void) => () => void;
  onSwapUp: (callback: () => void) => () => void;
  onSwapDown: (callback: () => void) => () => void;

  // Directional resize
  onResizeLeft: (callback: () => void) => () => void;
  onResizeRight: (callback: () => void) => () => void;
  onResizeUp: (callback: () => void) => () => void;
  onResizeDown: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    tilora: TiloraAPI;
  }
}

export {};
