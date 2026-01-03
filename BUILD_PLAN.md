# Tilora Build Plan

## Overview

This document outlines the phased implementation plan for Tilora, a tiled workspace browser built with Electron.

---

## Identified Gaps in Design Document

| Gap | Description |
|-----|-------------|
| **Architecture** | No IPC structure, main/renderer communication patterns |
| **Data Models** | No JSON schemas for Workspace, Tile, BSP nodes, preferences |
| **Keyboard Shortcuts** | Mentioned as "first-class" but no bindings defined |
| **UI/UX Design** | No workspace switcher, URL bar, or visual indicator specs |
| **Project Structure** | No directory layout or module organization |
| **Implementation Phases** | No milestone breakdown for incremental building |
| **Error Handling** | No strategy for crashes, failed loads, network issues |
| **Performance Targets** | No tile limits, memory constraints defined |
| **Technical Details** | Snapshot mechanism, resize behavior, BrowserView positioning unclear |

---

## Project Structure

```
tilora/
├── src/
│   ├── main/                 # Main process
│   │   ├── index.ts          # Entry point
│   │   ├── window.ts         # BrowserWindow management
│   │   ├── views.ts          # BrowserView lifecycle
│   │   ├── ipc.ts            # IPC handlers
│   │   └── store.ts          # Persistence layer
│   ├── renderer/             # Renderer process (UI)
│   │   ├── index.html
│   │   ├── index.ts
│   │   ├── components/       # UI components
│   │   └── styles/           # CSS
│   └── shared/               # Shared between processes
│       ├── types.ts          # TypeScript interfaces
│       ├── constants.ts      # Shared constants
│       └── ipc-channels.ts   # IPC channel definitions
├── package.json
├── tsconfig.json
├── electron-builder.json     # Packaging config
└── webpack.config.js         # Build config
```

---

## Phase 1: Project Scaffolding

**Goal:** Set up Electron project with TypeScript, directory structure, and build tooling.

**Tasks:**
- [ ] Initialize npm project with package.json
- [ ] Install Electron, TypeScript, and build dependencies
- [ ] Configure TypeScript (tsconfig.json)
- [ ] Set up webpack for main and renderer processes
- [ ] Create directory structure
- [ ] Add basic main process entry point
- [ ] Add basic renderer with HTML
- [ ] Configure dev scripts (start, build)
- [ ] Add ESLint and Prettier

**Deliverable:** App launches showing empty window.

---

## Phase 2: Single Tile Browser

**Goal:** Basic BrowserView with URL bar and navigation controls.

**Tasks:**
- [ ] Create BrowserView attached to main window
- [ ] Build URL bar component in renderer
- [ ] Implement navigation controls (back, forward, reload)
- [ ] Handle navigation events (loading, error, title change)
- [ ] IPC bridge for renderer to control navigation

**Deliverable:** Functional single-page browser with address bar.

---

## Phase 3: BSP Layout Engine

**Goal:** Implement binary space partition tree with split/resize operations.

**Tasks:**
- [ ] Define TypeScript types for BSP tree
  ```typescript
  type SplitDirection = 'horizontal' | 'vertical';

  interface SplitNode {
    type: 'split';
    direction: SplitDirection;
    ratio: number; // 0.0 to 1.0
    first: LayoutNode;
    second: LayoutNode;
  }

  interface LeafNode {
    type: 'leaf';
    tileId: string;
  }

  type LayoutNode = SplitNode | LeafNode;
  ```
- [ ] Implement tree operations: split, remove, resize ratio
- [ ] Calculate pixel bounds from tree + container dimensions
- [ ] Unit tests for layout calculations

**Deliverable:** Tested layout engine module.

---

## Phase 4: Multi-Tile Rendering

**Goal:** Position multiple BrowserViews based on BSP layout.

**Tasks:**
- [ ] Create/destroy BrowserViews based on layout tree
- [ ] Position views using calculated pixel bounds
- [ ] Handle window resize (recalculate all bounds)
- [ ] Render tile borders in renderer overlay
- [ ] Visual focus indicator on active tile

**Deliverable:** Multiple web pages tiled in single window.

---

## Phase 5: Keyboard Navigation

**Goal:** Focus management and vim-style directional movement.

**Tasks:**
- [ ] Define keyboard shortcut map:
  | Shortcut | Action |
  |----------|--------|
  | `Mod+H` | Focus left |
  | `Mod+J` | Focus down |
  | `Mod+K` | Focus up |
  | `Mod+L` | Focus right |
  | `Mod+Enter` | Split vertical |
  | `Mod+Shift+Enter` | Split horizontal |
  | `Mod+W` | Close tile |
  | `Mod+Shift+H/J/K/L` | Swap tile |
  | `Mod+[/]` | Resize split |
- [ ] Implement directional focus movement algorithm
- [ ] Add split/close/swap commands
- [ ] Register global shortcuts in main process
- [ ] Visual feedback for keyboard actions

**Deliverable:** Full keyboard control of layout.

---

## Phase 6: Workspace Management

**Goal:** Multiple workspaces with switching and persistence.

**Tasks:**
- [ ] Define Workspace data model:
  ```typescript
  interface Tile {
    id: string;
    url: string;
    title: string;
    history: string[];
    historyIndex: number;
  }

  interface Workspace {
    id: string;
    name: string;
    layout: LayoutNode;
    tiles: Map<string, Tile>;
    focusedTileId: string | null;
  }
  ```
- [ ] Implement JSON persistence (save/load)
- [ ] Auto-save on changes (debounced)
- [ ] Workspace switcher UI
- [ ] Keyboard shortcuts for workspace switching (`Mod+1-9`)
- [ ] Session restore on app startup

**Deliverable:** Persistent multi-workspace browser.

---

## Phase 7: Tile Lifecycle

**Goal:** Sleeping tiles with snapshots for memory optimization.

**Tasks:**
- [ ] Define minimum tile size threshold (e.g., 200x150 px)
- [ ] Capture screenshot before destroying BrowserView
- [ ] Store snapshots (in-memory or temp files)
- [ ] Render snapshot image for sleeping tiles
- [ ] Wake tile on focus or resize above threshold
- [ ] Visual indicator for sleeping state

**Deliverable:** Efficient handling of many tiles.

---

## Phase 8: Audio Management

**Goal:** Mute controls and audio indicators per tile.

**Tasks:**
- [ ] Detect audio-playing tiles via webContents API
- [ ] Per-tile mute toggle (context menu + shortcut)
- [ ] Visual audio indicator (speaker icon)
- [ ] "Mute all except focused" command
- [ ] Persist mute state per tile

**Deliverable:** YouTube-friendly multi-tile audio.

---

## Phase 9: Polish

**Goal:** Error handling, crash recovery, and preferences.

**Tasks:**
- [ ] Error states UI (failed load, certificate errors)
- [ ] Crash recovery (restore from last save)
- [ ] User preferences:
  - Keyboard modifier (Ctrl vs Alt vs Super)
  - Theme (dark/light)
  - Default search engine
- [ ] Preferences UI
- [ ] Electron-builder packaging for Windows/Linux
- [ ] Application icons and metadata

**Deliverable:** Production-ready application.

---

## Future Enhancements (Post-MVP)

- Tile dragging with mouse
- Import/export workspace layouts
- GPU-accelerated snapshots
- Tab-to-tile migration from Chrome/Firefox
- Picture-in-picture mode
- Custom CSS injection per tile
