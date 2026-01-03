/**
 * Core type definitions for Tilora
 */

// Layout types
export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  ratio: number; // 0.0 to 1.0, position of the split
  first: LayoutNode;
  second: LayoutNode;
}

export interface LeafNode {
  type: 'leaf';
  id: string;
  tileId: string;
}

export type LayoutNode = SplitNode | LeafNode;

// Tile types
export type TileState = 'live' | 'sleeping';

export interface Tile {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  state: TileState;
  isMuted: boolean;
  isAudioPlaying: boolean;
  history: string[];
  historyIndex: number;
}

// Workspace types
export interface Workspace {
  id: string;
  name: string;
  layout: LayoutNode;
  tiles: Record<string, Tile>;
  focusedTileId: string | null;
  createdAt: number;
  updatedAt: number;
}

// App state
export interface AppState {
  workspaces: Record<string, Workspace>;
  activeWorkspaceId: string | null;
  preferences: UserPreferences;
}

export interface UserPreferences {
  modifierKey: 'ctrl' | 'alt' | 'meta';
  theme: 'light' | 'dark' | 'system';
  defaultUrl: string;
  minTileWidth: number;
  minTileHeight: number;
}

// Bounds for positioning
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Navigation
export interface NavigationState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}
