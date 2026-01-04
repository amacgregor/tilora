/**
 * TileProxy - Lightweight representation of a WebContentsView-based tile
 *
 * Unlike the webview-based Tile which holds a DOM element, TileProxy is a
 * pure data object that represents the state of a tile managed by the main process.
 * All actual view operations are performed via IPC.
 */

import type { Bounds } from '@shared/tile-ipc';

/**
 * Represents the state of a tile in the renderer process
 */
export interface TileProxy {
  /** Unique tile identifier */
  id: string;

  /** Current URL */
  url: string;

  /** Page title */
  title: string;

  /** Current bounds (for overlay positioning) */
  bounds: Bounds;

  /** Whether the tile is muted */
  isMuted: boolean;

  /** Whether audio is currently playing */
  isAudioPlaying: boolean;

  /** Whether the tile has a load error */
  hasError: boolean;

  /** Error message if hasError is true */
  errorMessage?: string;

  /** Error code if hasError is true */
  errorCode?: number;

  /** Whether navigation can go back */
  canGoBack: boolean;

  /** Whether navigation can go forward */
  canGoForward: boolean;

  /** Whether the page is loading */
  isLoading: boolean;

  /** Favicon URL */
  faviconUrl?: string;
}

/**
 * Create a new TileProxy with default values
 */
export function createTileProxy(id: string, url: string): TileProxy {
  return {
    id,
    url,
    title: 'New Tab',
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    isMuted: false,
    isAudioPlaying: false,
    hasError: false,
    canGoBack: false,
    canGoForward: false,
    isLoading: true,
  };
}

/**
 * Sleeping tile state (for tiles that have been put to sleep to save resources)
 */
export interface SleepingTile {
  id: string;
  url: string;
  title: string;
  snapshot: string; // Data URL of captured image
  isMuted: boolean;
  element: HTMLElement; // Placeholder DOM element
}
