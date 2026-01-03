/**
 * Persistence service for saving/loading app state
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AppState, createDefaultAppState } from '@shared/workspace';

const STATE_FILE = 'tilora-state.json';

/**
 * Get the path to the state file
 */
function getStatePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, STATE_FILE);
}

/**
 * Load app state from disk
 */
export function loadAppState(): AppState {
  const statePath = getStatePath();

  try {
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, 'utf-8');
      const state = JSON.parse(data) as AppState;

      // Validate basic structure
      if (state.version && state.workspaces && state.activeWorkspaceId) {
        return state;
      }
    }
  } catch (error) {
    console.error('Failed to load app state:', error);
  }

  // Return default state if loading fails
  return createDefaultAppState();
}

/**
 * Save app state to disk
 */
export function saveAppState(state: AppState): boolean {
  const statePath = getStatePath();

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
 * Delete saved state (for testing/reset)
 */
export function clearAppState(): boolean {
  const statePath = getStatePath();

  try {
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    return true;
  } catch (error) {
    console.error('Failed to clear app state:', error);
    return false;
  }
}
