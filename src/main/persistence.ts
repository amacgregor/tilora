/**
 * Persistence service for saving/loading app state
 * Supports multiple windows with per-window state files
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AppState, WindowsState, createDefaultAppState, generateWindowId } from '@shared/workspace';

const WINDOWS_FILE = 'tilora-windows.json';
const STATE_FILE_PREFIX = 'tilora-state-';

/**
 * Get the user data path
 */
function getUserDataPath(): string {
  return app.getPath('userData');
}

/**
 * Get the path to the windows tracking file
 */
function getWindowsStatePath(): string {
  return path.join(getUserDataPath(), WINDOWS_FILE);
}

/**
 * Get the path to a specific window's state file
 */
function getWindowStatePath(windowId: string): string {
  return path.join(getUserDataPath(), `${STATE_FILE_PREFIX}${windowId}.json`);
}

/**
 * Load the master windows state (list of all window IDs)
 */
export function loadWindowsState(): WindowsState {
  const statePath = getWindowsStatePath();

  try {
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(data) as WindowsState;
      if (state.version && Array.isArray(state.windowIds)) {
        return state;
      }
    }
  } catch (error) {
    console.error('Failed to load windows state:', error);
  }

  return { version: 1, windowIds: [] };
}

/**
 * Save the master windows state
 */
export function saveWindowsState(state: WindowsState): boolean {
  const statePath = getWindowsStatePath();

  try {
    const data = JSON.stringify(state, null, 2);
    fs.writeFileSync(statePath, data, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save windows state:', error);
    return false;
  }
}

/**
 * Register a new window ID in the master state
 */
export function registerWindow(windowId: string): void {
  const state = loadWindowsState();
  if (!state.windowIds.includes(windowId)) {
    state.windowIds.push(windowId);
    saveWindowsState(state);
  }
}

/**
 * Unregister a window ID from the master state
 */
export function unregisterWindow(windowId: string): void {
  const state = loadWindowsState();
  const index = state.windowIds.indexOf(windowId);
  if (index !== -1) {
    state.windowIds.splice(index, 1);
    saveWindowsState(state);
  }
}

/**
 * Load app state for a specific window
 */
export function loadAppState(windowId?: string): AppState {
  // If no windowId provided, try to load from legacy single-file format
  // or create a new window state
  if (!windowId) {
    // Check for legacy state file and migrate if needed
    const legacyPath = path.join(getUserDataPath(), 'tilora-state.json');
    if (fs.existsSync(legacyPath)) {
      try {
        const data = fs.readFileSync(legacyPath, 'utf-8');
        const state = JSON.parse(data) as AppState;

        // Migrate: add windowId if missing
        if (!state.windowId) {
          state.windowId = generateWindowId();
        }

        // Save to new format and delete legacy
        saveAppState(state);
        registerWindow(state.windowId);
        fs.unlinkSync(legacyPath);

        return state;
      } catch (error) {
        console.error('Failed to migrate legacy state:', error);
      }
    }

    // Create new window state
    const newWindowId = generateWindowId();
    const newState = createDefaultAppState(newWindowId);
    registerWindow(newWindowId);
    saveAppState(newState);
    return newState;
  }

  const statePath = getWindowStatePath(windowId);

  try {
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(data) as AppState;

      // Validate basic structure
      if (state.version && state.workspaces && state.activeWorkspaceId) {
        // Ensure windowId is set
        if (!state.windowId) {
          state.windowId = windowId;
        }
        return state;
      }
    }
  } catch (error) {
    console.error('Failed to load app state for window:', windowId, error);
  }

  // Return default state if loading fails
  const defaultState = createDefaultAppState(windowId);
  registerWindow(windowId);
  return defaultState;
}

/**
 * Save app state for a specific window
 */
export function saveAppState(state: AppState): boolean {
  if (!state.windowId) {
    console.error('Cannot save state without windowId');
    return false;
  }

  const statePath = getWindowStatePath(state.windowId);

  try {
    const data = JSON.stringify(state, null, 2);
    fs.writeFileSync(statePath, data, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save app state:', error);
    return false;
  }
}

/**
 * Delete a window's state file
 */
export function deleteWindowState(windowId: string): boolean {
  const statePath = getWindowStatePath(windowId);

  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    unregisterWindow(windowId);
    return true;
  } catch (error) {
    console.error('Failed to delete window state:', error);
    return false;
  }
}

/**
 * Get all registered window IDs
 */
export function getAllWindowIds(): string[] {
  return loadWindowsState().windowIds;
}

/**
 * Clear all state (for testing/reset)
 */
export function clearAllState(): boolean {
  try {
    const windowsState = loadWindowsState();

    // Delete all window state files
    for (const windowId of windowsState.windowIds) {
      const statePath = getWindowStatePath(windowId);
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
    }

    // Delete windows state file
    const windowsStatePath = getWindowsStatePath();
    if (fs.existsSync(windowsStatePath)) {
      fs.unlinkSync(windowsStatePath);
    }

    // Delete legacy state file if exists
    const legacyPath = path.join(getUserDataPath(), 'tilora-state.json');
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }

    return true;
  } catch (error) {
    console.error('Failed to clear all state:', error);
    return false;
  }
}
