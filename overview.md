Below is a **single, self-contained design document** you can treat as a living spec. It’s written to be implementation-ready without drifting into marketing fluff.

---

# Tiled Workspace Browser

**Design & Feature Specification**

---

## 1. What We Are Building

We are building a **desktop web browser centered around tiling workspaces instead of tabs**.

Instead of a linear tab bar, the primary unit of organization is a **workspace**.
Each workspace contains a **tiling layout** where every web page occupies a **tile** within a binary space partition (BSP) layout, similar to bspwm or other tiling window managers.

Key characteristics:

* One window, many workspaces
* Each workspace is a **BSP layout tree**
* Each leaf node renders a **full web page**
* Tiles are resized, split, swapped, and focused using keyboard and mouse
* All tiles share a **single browser profile** (cookies, sessions, logins)
* The system supports **arbitrarily complex layouts**, not fixed grids
* Only visible tiles are actively rendered; others are suspended

Primary use cases:

* Monitoring multiple live web pages (e.g. YouTube, dashboards)
* Power users who prefer spatial organization over tab lists
* Vertical and ultra-wide monitor workflows
* Users familiar with tiling window managers

Non-goals (at least initially):

* Competing with Chrome/Firefox feature parity
* Extensions ecosystem
* Mobile support

---

## 2. Technology Stack

### Target Platforms

* **Windows**
* **Linux**

### Core Stack (Recommended)

* **Electron**

  * Provides Chromium engine
  * Supports multiple embedded browser views in one window
  * Mature APIs for window, session, input, and lifecycle management

### Browser Engine

* **Chromium (via Electron)**

  * Full web compatibility
  * Media playback, including YouTube
  * Shared browser profile across all tiles

### UI Layer

* **Renderer process**

  * Renders layout overlays, borders, focus indicators
  * Handles user interaction (split, resize, move)
  * Sends layout and navigation commands to main process

### Window & View Management

* **Main process**

  * Owns BrowserWindow
  * Creates and destroys BrowserViews
  * Positions BrowserViews based on layout tree
  * Manages tile lifecycle (live vs sleeping)

### State & Persistence

* **Local JSON store**

  * Workspaces
  * Layout trees
  * Tile metadata
  * User preferences

### Optional (Later)

* Rust or native helpers for performance-sensitive tasks
* GPU snapshotting for sleeping tiles
* Import/export workspace layouts

---

## 3. Core Concepts and Terminology

### Workspace

A named container holding:

* A layout tree
* A set of tiles
* Independent spatial organization

Users can switch workspaces instantly.
Workspaces persist across restarts.

---

### Tile

A single web page rendered within a rectangular region.

A tile has:

* URL
* Navigation history (basic at first)
* Focus state
* Audio state (muted / active)
* Lifecycle state (live or sleeping)

A tile is conceptually equivalent to a tab in a traditional browser.

---

### BSP Layout Tree

A recursive structure that divides space using binary splits.

Node types:

* **Split Node**

  * Direction: horizontal or vertical
  * Ratio (e.g. 0.33 / 0.67)
  * Two child nodes
* **Leaf Node**

  * Contains a single tile

This allows:

* Arbitrary nesting
* Uneven layouts
* Vertical stacks, sidebars, and complex compositions

---

### Live Tile

A tile that currently has:

* An active BrowserView
* Full rendering and JavaScript execution

Only tiles that are visible and above a minimum size are live.

---

### Sleeping Tile

A tile that is not actively rendered.

Characteristics:

* BrowserView destroyed
* Snapshot shown in UI
* URL and metadata retained
* Reloaded when brought back into view

Sleeping tiles make “infinite” layouts feasible.

---

### Focus

The tile that currently:

* Receives keyboard input
* Has active navigation controls
* Is visually highlighted

Only one tile can be focused at a time.

---

## 4. Feature List with User Stories

### 4.1 Workspaces

**Description**
Users can create, name, switch, and persist multiple workspaces.

**User Stories**

1. As a user, I can create a new workspace so I can separate different tasks.
2. As a user, I can switch between workspaces using keyboard shortcuts.
3. As a user, I can close and reopen the browser and have my workspaces restored.

---

### 4.2 BSP Tiling Layout

**Description**
Workspaces use a binary space partition layout instead of tabs or fixed grids.

**User Stories**

1. As a user, I can split a tile horizontally to place one page above another.
2. As a user, I can split a tile vertically to create a sidebar layout.
3. As a user, I can resize splits to give more space to important tiles.

---

### 4.3 Tile Creation and Navigation

**Description**
Each tile renders a full web page with standard navigation.

**User Stories**

1. As a user, I can open a URL in a new tile within the current workspace.
2. As a user, I can navigate back and forward within a focused tile.
3. As a user, I can reload a tile without affecting others.

---

### 4.4 Tile Focus and Keyboard Control

**Description**
Keyboard navigation is first-class and modeled after tiling window managers.

**User Stories**

1. As a user, I can move focus between tiles using the keyboard.
2. As a user, I can perform splits and closes without touching the mouse.
3. As a user, I can clearly see which tile is focused at all times.

---

### 4.5 Tile Rearrangement

**Description**
Tiles can be moved, swapped, and reorganized without reloading pages.

**User Stories**

1. As a user, I can swap two tiles to reorganize my layout.
2. As a user, I can move a tile into a different split region.
3. As a user, I can collapse a tile and promote its sibling automatically.

---

### 4.6 Infinite Layouts via Tile Sleeping

**Description**
The system supports arbitrarily large layouts by suspending inactive tiles.

**User Stories**

1. As a user, I can create complex layouts without crashing the browser.
2. As a user, I can scroll or resize to bring a sleeping tile back to life.
3. As a user, I see a visual snapshot of tiles that are not currently live.

---

### 4.7 Shared Browser Profile

**Description**
All tiles share cookies, logins, and storage like a normal browser.

**User Stories**

1. As a user, I can log into a site once and access it from any tile.
2. As a user, I can open multiple views of the same site without re-authenticating.
3. As a user, I expect consistent session behavior across the entire browser.

---

### 4.8 Audio Management (YouTube-friendly)

**Description**
Audio defaults to sane behavior in multi-tile environments.

**User Stories**

1. As a user, I can mute all tiles except the focused one.
2. As a user, I can quickly identify which tile is producing sound.
3. As a user, I can monitor video content without audio chaos.

---

### 4.9 Session Persistence

**Description**
The browser restores state after restart or crash.

**User Stories**

1. As a user, I can restart the app and return to the same layout.
2. As a user, my open URLs are restored automatically.
3. As a user, I don’t lose my workspace structure after a crash.

---

## 5. Summary

This project is a **tiling, workspace-centric desktop browser** built for users who think spatially and dislike tab sprawl.

By combining:

* BSP layouts
* Shared browser sessions
* Aggressive tile lifecycle management

…it enables workflows that traditional browsers simply do not support, while remaining technically realistic to build and maintain as a solo or small-team project.

