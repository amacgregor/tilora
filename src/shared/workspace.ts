/**
 * Workspace data models for persistence
 */

export type SplitDirection = 'horizontal' | 'vertical';

/**
 * Serializable layout node (matches BSP structure but without runtime data)
 */
export interface SerializedSplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  ratio: number;
  first: SerializedLayoutNode;
  second: SerializedLayoutNode;
}

export interface SerializedLeafNode {
  type: 'leaf';
  id: string;
  tileId: string;
}

export type SerializedLayoutNode = SerializedSplitNode | SerializedLeafNode;

/**
 * Tile state for persistence
 */
export interface TileState {
  id: string;
  url: string;
  title: string;
  isMuted?: boolean;
}

/**
 * Complete workspace state
 */
export interface Workspace {
  id: string;
  name: string;
  layout: SerializedLayoutNode;
  tiles: TileState[];
  focusedTileId: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Window geometry for persistence
 */
export interface WindowGeometry {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

/**
 * App state containing all workspaces for a window
 */
export interface AppState {
  version: number;
  windowId: string;
  geometry?: WindowGeometry;
  activeWorkspaceId: string;
  workspaces: Workspace[];
}

/**
 * Master state tracking all windows
 */
export interface WindowsState {
  version: number;
  windowIds: string[];
}

/**
 * Default app state for a window
 */
export function createDefaultAppState(windowId?: string): AppState {
  const defaultWorkspace = createDefaultWorkspace('Workspace 1');
  return {
    version: 1,
    windowId: windowId || generateId(),
    activeWorkspaceId: defaultWorkspace.id,
    workspaces: [defaultWorkspace],
  };
}

/**
 * Generate a unique window ID
 */
export function generateWindowId(): string {
  return generateId();
}

/**
 * Create a new empty workspace
 */
export function createDefaultWorkspace(name: string): Workspace {
  const tileId = generateId();
  const now = Date.now();

  return {
    id: generateId(),
    name,
    layout: {
      type: 'leaf',
      id: generateId(),
      tileId,
    },
    tiles: [{
      id: tileId,
      url: 'https://www.google.com',
      title: 'New Tab',
    }],
    focusedTileId: tileId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Simple ID generator (for persistence, we use simple random IDs)
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
