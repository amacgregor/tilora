/**
 * Preload script for overlay window
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { OverlayUpdatePayload } from '@shared/overlay-types';

const api = {
  // Receive tile updates
  onUpdateTiles: (callback: (payload: OverlayUpdatePayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: OverlayUpdatePayload): void => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_UPDATE_TILES, handler);
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_UPDATE_TILES, handler);
    };
  },

  // Toggle mute for a tile
  toggleMute: (tileId: string): void => {
    ipcRenderer.send(IPC_CHANNELS.OVERLAY_TOGGLE_MUTE, tileId);
  },
};

contextBridge.exposeInMainWorld('overlay', api);
