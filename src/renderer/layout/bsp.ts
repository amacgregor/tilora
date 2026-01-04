/**
 * Binary Space Partition (BSP) Layout Engine
 *
 * Manages tile layouts using a binary tree structure where:
 * - Split nodes divide space horizontally or vertically
 * - Leaf nodes contain actual tile content
 */

import { v4 as uuidv4 } from 'uuid';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  ratio: number; // 0.0 to 1.0, position of divider
  first: LayoutNode;
  second: LayoutNode;
}

export interface LeafNode {
  type: 'leaf';
  id: string;
  tileId: string;
}

export type LayoutNode = SplitNode | LeafNode;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileBounds {
  tileId: string;
  bounds: Bounds;
}

/**
 * Create a new leaf node
 */
export function createLeaf(tileId?: string): LeafNode {
  return {
    type: 'leaf',
    id: uuidv4(),
    tileId: tileId || uuidv4(),
  };
}

/**
 * Split a leaf node into two
 */
export function splitNode(
  root: LayoutNode,
  targetId: string,
  direction: SplitDirection,
  ratio = 0.5
): { newRoot: LayoutNode; newTileId: string } | null {
  const newTileId = uuidv4();

  const result = splitNodeRecursive(root, targetId, direction, ratio, newTileId);
  if (result) {
    return { newRoot: result, newTileId };
  }
  return null;
}

function splitNodeRecursive(
  node: LayoutNode,
  targetId: string,
  direction: SplitDirection,
  ratio: number,
  newTileId: string
): LayoutNode | null {
  if (node.type === 'leaf') {
    if (node.id === targetId || node.tileId === targetId) {
      // Found the target - split it
      const newLeaf = createLeaf(newTileId);
      const splitNode: SplitNode = {
        type: 'split',
        id: uuidv4(),
        direction,
        ratio,
        first: node,
        second: newLeaf,
      };
      return splitNode;
    }
    return null;
  }

  // It's a split node - search children
  const firstResult = splitNodeRecursive(node.first, targetId, direction, ratio, newTileId);
  if (firstResult) {
    return { ...node, first: firstResult };
  }

  const secondResult = splitNodeRecursive(node.second, targetId, direction, ratio, newTileId);
  if (secondResult) {
    return { ...node, second: secondResult };
  }

  return null;
}

/**
 * Remove a tile from the tree
 * Returns the sibling node (promoted) or null if this was the only tile
 */
export function removeNode(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.type === 'leaf') {
    // If root is the target, tree becomes empty
    if (root.id === targetId || root.tileId === targetId) {
      return null;
    }
    return root;
  }

  // Check if either child is the target
  if (root.first.type === 'leaf' && (root.first.id === targetId || root.first.tileId === targetId)) {
    // Remove first, promote second
    return root.second;
  }

  if (root.second.type === 'leaf' && (root.second.id === targetId || root.second.tileId === targetId)) {
    // Remove second, promote first
    return root.first;
  }

  // Recurse into children
  const newFirst = removeNode(root.first, targetId);
  if (newFirst !== root.first) {
    if (newFirst === null) {
      return root.second;
    }
    return { ...root, first: newFirst };
  }

  const newSecond = removeNode(root.second, targetId);
  if (newSecond !== root.second) {
    if (newSecond === null) {
      return root.first;
    }
    return { ...root, second: newSecond };
  }

  return root;
}

/**
 * Resize a split by adjusting its ratio
 */
export function resizeSplit(
  root: LayoutNode,
  splitId: string,
  newRatio: number
): LayoutNode {
  const clampedRatio = Math.max(0.1, Math.min(0.9, newRatio));

  if (root.type === 'leaf') {
    return root;
  }

  if (root.id === splitId) {
    return { ...root, ratio: clampedRatio };
  }

  return {
    ...root,
    first: resizeSplit(root.first, splitId, newRatio),
    second: resizeSplit(root.second, splitId, newRatio),
  };
}

/**
 * Calculate pixel bounds for all tiles in the tree
 */
export function calculateBounds(
  node: LayoutNode,
  containerBounds: Bounds
): TileBounds[] {
  if (node.type === 'leaf') {
    return [{
      tileId: node.tileId,
      bounds: containerBounds,
    }];
  }

  const { x, y, width, height } = containerBounds;
  const { direction, ratio, first, second } = node;

  let firstBounds: Bounds;
  let secondBounds: Bounds;

  if (direction === 'vertical') {
    // Split left/right
    const splitX = Math.round(x + width * ratio);
    firstBounds = { x, y, width: splitX - x, height };
    secondBounds = { x: splitX, y, width: x + width - splitX, height };
  } else {
    // Split top/bottom
    const splitY = Math.round(y + height * ratio);
    firstBounds = { x, y, width, height: splitY - y };
    secondBounds = { x, y: splitY, width, height: y + height - splitY };
  }

  return [
    ...calculateBounds(first, firstBounds),
    ...calculateBounds(second, secondBounds),
  ];
}

/**
 * Find a node by tileId
 */
export function findNodeByTileId(root: LayoutNode, tileId: string): LeafNode | null {
  if (root.type === 'leaf') {
    return root.tileId === tileId ? root : null;
  }

  return findNodeByTileId(root.first, tileId) || findNodeByTileId(root.second, tileId);
}

/**
 * Get all tile IDs in the tree
 */
export function getAllTileIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') {
    return [node.tileId];
  }

  return [...getAllTileIds(node.first), ...getAllTileIds(node.second)];
}

/**
 * Count total tiles
 */
export function countTiles(node: LayoutNode): number {
  if (node.type === 'leaf') {
    return 1;
  }
  return countTiles(node.first) + countTiles(node.second);
}

/**
 * Find the parent split of a tile
 */
export function findParentSplit(
  root: LayoutNode,
  tileId: string,
  parent: SplitNode | null = null
): SplitNode | null {
  if (root.type === 'leaf') {
    return root.tileId === tileId ? parent : null;
  }

  const inFirst = findParentSplit(root.first, tileId, root);
  if (inFirst) return inFirst;

  return findParentSplit(root.second, tileId, root);
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/**
 * Find the adjacent tile in a given direction
 * Uses geometric center-point comparison to find the best match
 */
export function findAdjacentTile(
  tileBounds: TileBounds[],
  currentTileId: string,
  direction: Direction
): string | null {
  const current = tileBounds.find(t => t.tileId === currentTileId);
  if (!current) return null;

  const currentCenter = {
    x: current.bounds.x + current.bounds.width / 2,
    y: current.bounds.y + current.bounds.height / 2,
  };

  const candidates: Array<{ tileId: string; distance: number; alignment: number }> = [];

  for (const tile of tileBounds) {
    if (tile.tileId === currentTileId) continue;

    const tileCenter = {
      x: tile.bounds.x + tile.bounds.width / 2,
      y: tile.bounds.y + tile.bounds.height / 2,
    };

    // Check if tile is in the correct direction
    let isInDirection = false;
    let primaryDistance = 0;
    let alignment = 0;

    switch (direction) {
      case 'left':
        isInDirection = tile.bounds.x + tile.bounds.width <= current.bounds.x + 5;
        primaryDistance = currentCenter.x - tileCenter.x;
        alignment = Math.abs(currentCenter.y - tileCenter.y);
        break;
      case 'right':
        isInDirection = tile.bounds.x >= current.bounds.x + current.bounds.width - 5;
        primaryDistance = tileCenter.x - currentCenter.x;
        alignment = Math.abs(currentCenter.y - tileCenter.y);
        break;
      case 'up':
        isInDirection = tile.bounds.y + tile.bounds.height <= current.bounds.y + 5;
        primaryDistance = currentCenter.y - tileCenter.y;
        alignment = Math.abs(currentCenter.x - tileCenter.x);
        break;
      case 'down':
        isInDirection = tile.bounds.y >= current.bounds.y + current.bounds.height - 5;
        primaryDistance = tileCenter.y - currentCenter.y;
        alignment = Math.abs(currentCenter.x - tileCenter.x);
        break;
    }

    if (isInDirection && primaryDistance > 0) {
      candidates.push({
        tileId: tile.tileId,
        distance: primaryDistance,
        alignment,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by alignment first (prefer tiles more aligned), then by distance
  candidates.sort((a, b) => {
    // Weight alignment heavily to prefer tiles in the same row/column
    const aScore = a.alignment * 2 + a.distance;
    const bScore = b.alignment * 2 + b.distance;
    return aScore - bScore;
  });

  return candidates[0]!.tileId;
}

/**
 * Swap two tiles in the tree
 */
export function swapTiles(
  root: LayoutNode,
  tileId1: string,
  tileId2: string
): LayoutNode {
  return swapTilesRecursive(root, tileId1, tileId2);
}

function swapTilesRecursive(
  node: LayoutNode,
  tileId1: string,
  tileId2: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.tileId === tileId1) {
      return { ...node, tileId: tileId2 };
    }
    if (node.tileId === tileId2) {
      return { ...node, tileId: tileId1 };
    }
    return node;
  }

  return {
    ...node,
    first: swapTilesRecursive(node.first, tileId1, tileId2),
    second: swapTilesRecursive(node.second, tileId1, tileId2),
  };
}

/**
 * Adjust the ratio of the split containing a tile
 * @param delta - Amount to adjust ratio (positive = grow first child, negative = grow second)
 */
export function adjustSplitRatio(
  root: LayoutNode,
  tileId: string,
  delta: number
): LayoutNode {
  const parent = findParentSplit(root, tileId);
  if (!parent) return root;

  const newRatio = Math.max(0.1, Math.min(0.9, parent.ratio + delta));
  return resizeSplit(root, parent.id, newRatio);
}

/**
 * Find all ancestor splits of a tile
 */
export function findAncestorSplits(
  root: LayoutNode,
  tileId: string,
  ancestors: SplitNode[] = []
): SplitNode[] {
  if (root.type === 'leaf') {
    return root.tileId === tileId ? ancestors : [];
  }

  // Check first child
  const inFirst = findAncestorSplits(root.first, tileId, [...ancestors, root]);
  if (inFirst.length > 0) return inFirst;

  // Check second child
  return findAncestorSplits(root.second, tileId, [...ancestors, root]);
}

/**
 * Adjust split ratio in a specific direction
 * @param direction - Which direction to resize (left/right for horizontal, up/down for vertical)
 * @param delta - Amount to adjust (positive = grow in that direction)
 */
export function adjustSplitInDirection(
  root: LayoutNode,
  tileId: string,
  direction: Direction,
  delta: number
): LayoutNode {
  const ancestors = findAncestorSplits(root, tileId);
  if (ancestors.length === 0) return root;

  // Find the appropriate split to adjust based on direction
  const isHorizontal = direction === 'left' || direction === 'right';
  const splitDirection: SplitDirection = isHorizontal ? 'vertical' : 'horizontal';

  // Find the nearest ancestor with the matching split direction
  // Start from the innermost (closest to tile) and work outward
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const split = ancestors[i]!;
    if (split.direction === splitDirection) {
      // Determine if tile is in first or second child
      const position = whichChild(split, tileId);

      // Calculate the delta based on position and direction
      let adjustedDelta = delta;

      if (splitDirection === 'vertical') {
        // Left/right resize
        if (position === 'first') {
          // Tile is on left, grow right edge = increase ratio
          adjustedDelta = direction === 'right' ? delta : -delta;
        } else {
          // Tile is on right, grow left edge = decrease ratio
          adjustedDelta = direction === 'left' ? -delta : delta;
        }
      } else {
        // Up/down resize
        if (position === 'first') {
          // Tile is on top, grow bottom edge = increase ratio
          adjustedDelta = direction === 'down' ? delta : -delta;
        } else {
          // Tile is on bottom, grow top edge = decrease ratio
          adjustedDelta = direction === 'up' ? -delta : delta;
        }
      }

      const newRatio = Math.max(0.1, Math.min(0.9, split.ratio + adjustedDelta));
      return resizeSplit(root, split.id, newRatio);
    }
  }

  return root;
}

/**
 * Check which child of a split contains a tile
 * Returns 'first', 'second', or null
 */
export function whichChild(
  split: SplitNode,
  tileId: string
): 'first' | 'second' | null {
  if (containsTile(split.first, tileId)) return 'first';
  if (containsTile(split.second, tileId)) return 'second';
  return null;
}

function containsTile(node: LayoutNode, tileId: string): boolean {
  if (node.type === 'leaf') {
    return node.tileId === tileId;
  }
  return containsTile(node.first, tileId) || containsTile(node.second, tileId);
}
