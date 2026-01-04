import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import { windowManager } from './window-manager';
import { tileViewManager } from './tile-view-manager';
import { extensionManager } from './extension-manager';
import { installExtensionFromWebStore } from './crx-downloader';
import { registerTileIpcHandlers } from './ipc-tile-bridge';
import { saveAppState, getAllWindowIds, clearAllState } from './persistence';
import type { AppState } from '@shared/workspace';
import { IPC_CHANNELS } from '@shared/ipc-channels';
import type { OverlayUpdatePayload } from '@shared/overlay-types';

// Enable autoplay for audio/video (required for YouTube, etc.)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function setupMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => windowManager.createWindow(),
        },
        { type: 'separator' },
        {
          label: 'New Tile (Split Vertical)',
          accelerator: 'CmdOrCtrl+D',
          click: () => sendToRenderer('split-vertical'),
        },
        {
          label: 'New Tile (Split Horizontal)',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToRenderer('split-horizontal'),
        },
        { type: 'separator' },
        {
          label: 'Close Tile',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => sendToRenderer('close-tile'),
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          click: (): void => {
            const focused = BrowserWindow.getFocusedWindow();
            focused?.close();
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Focus URL Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendToRenderer('focus-url-bar'),
        },
        { type: 'separator' },
        {
          label: 'Reload Tile',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendToRenderer('reload-tile'),
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: (): void => {
            const focused = BrowserWindow.getFocusedWindow();
            focused?.webContents.toggleDevTools();
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Tiles',
      submenu: [
        {
          label: 'Focus Left',
          accelerator: 'Alt+H',
          click: () => sendToRenderer('focus-left'),
        },
        {
          label: 'Focus Down',
          accelerator: 'Alt+J',
          click: () => sendToRenderer('focus-down'),
        },
        {
          label: 'Focus Up',
          accelerator: 'Alt+K',
          click: () => sendToRenderer('focus-up'),
        },
        {
          label: 'Focus Right',
          accelerator: 'Alt+L',
          click: () => sendToRenderer('focus-right'),
        },
        { type: 'separator' },
        {
          label: 'Swap Left',
          accelerator: 'Ctrl+Alt+H',
          click: () => sendToRenderer('swap-left'),
        },
        {
          label: 'Swap Down',
          accelerator: 'Ctrl+Alt+J',
          click: () => sendToRenderer('swap-down'),
        },
        {
          label: 'Swap Up',
          accelerator: 'Ctrl+Alt+K',
          click: () => sendToRenderer('swap-up'),
        },
        {
          label: 'Swap Right',
          accelerator: 'Ctrl+Alt+L',
          click: () => sendToRenderer('swap-right'),
        },
        { type: 'separator' },
        {
          label: 'Resize Left',
          accelerator: 'Ctrl+Shift+H',
          click: () => sendToRenderer('resize-left'),
        },
        {
          label: 'Resize Down',
          accelerator: 'Ctrl+Shift+J',
          click: () => sendToRenderer('resize-down'),
        },
        {
          label: 'Resize Up',
          accelerator: 'Ctrl+Shift+K',
          click: () => sendToRenderer('resize-up'),
        },
        {
          label: 'Resize Right',
          accelerator: 'Ctrl+Shift+L',
          click: () => sendToRenderer('resize-right'),
        },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => sendToRenderer('go-back'),
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => sendToRenderer('go-forward'),
        },
      ],
    },
    {
      label: 'Workspaces',
      submenu: [
        {
          label: 'New Workspace',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendToRenderer('new-workspace'),
        },
        { type: 'separator' },
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Workspace ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => sendToRenderer('switch-workspace', i),
        })),
      ],
    },
    {
      label: 'Audio',
      submenu: [
        {
          label: 'Toggle Mute',
          accelerator: 'Alt+M',
          click: () => sendToRenderer('toggle-mute'),
        },
        {
          label: 'Mute All Except Focused',
          accelerator: 'Alt+Shift+M',
          click: () => sendToRenderer('mute-all-except-focused'),
        },
        {
          label: 'Unmute All',
          accelerator: 'Alt+U',
          click: () => sendToRenderer('unmute-all'),
        },
      ],
    },
    {
      label: 'Extensions',
      submenu: [
        {
          label: 'Install from Chrome Web Store...',
          click: async () => {
            // Show input dialog for extension URL/ID
            const focused = BrowserWindow.getFocusedWindow();
            if (!focused) return;

            // Use a prompt-like approach with showMessageBox isn't ideal
            // Instead, we'll use the clipboard or a simple approach
            const { response } = await dialog.showMessageBox(focused, {
              type: 'question',
              buttons: ['Cancel', 'Install from Clipboard'],
              defaultId: 1,
              title: 'Install Extension',
              message: 'Copy a Chrome Web Store extension URL to your clipboard, then click "Install from Clipboard".',
              detail: 'Example: https://chromewebstore.google.com/detail/keeper-password-manager/bfogiafebfohielmmehodmfbbebbbpei',
            });

            if (response === 1) {
              const { clipboard } = await import('electron');
              const clipboardText = clipboard.readText().trim();

              if (!clipboardText) {
                await dialog.showMessageBox(focused, {
                  type: 'error',
                  title: 'No URL',
                  message: 'Clipboard is empty. Please copy a Chrome Web Store URL first.',
                });
                return;
              }

              // Show progress
              const progressWindow = new BrowserWindow({
                width: 350,
                height: 120,
                parent: focused,
                modal: true,
                show: false,
                frame: false,
                resizable: false,
                webPreferences: { nodeIntegration: false, contextIsolation: true },
              });
              progressWindow.loadURL(`data:text/html,
                <html>
                <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #2d2d2d; color: white;">
                  <div style="text-align: center;">
                    <div style="font-size: 14px; margin-bottom: 10px;">Installing extension...</div>
                    <div style="font-size: 12px; color: #888;">Please wait</div>
                  </div>
                </body>
                </html>
              `);
              progressWindow.show();

              try {
                const result = await installExtensionFromWebStore(clipboardText);
                progressWindow.close();

                if (result.success && result.path) {
                  // Load the extension
                  const ext = await extensionManager.loadExtension(result.path);
                  await dialog.showMessageBox(focused, {
                    type: 'info',
                    title: 'Extension Installed',
                    message: `Successfully installed: ${ext?.name || result.name}`,
                    detail: 'The extension is now active. You may need to reload tiles for content scripts to take effect.',
                  });
                } else {
                  await dialog.showMessageBox(focused, {
                    type: 'error',
                    title: 'Installation Failed',
                    message: result.error || 'Unknown error occurred',
                  });
                }
              } catch (err) {
                progressWindow.close();
                await dialog.showMessageBox(focused, {
                  type: 'error',
                  title: 'Installation Failed',
                  message: err instanceof Error ? err.message : 'Unknown error',
                });
              }
            }
          },
        },
        {
          label: 'Load from Folder...',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory'],
              title: 'Select Extension Folder',
              message: 'Choose a folder containing a Chrome extension (with manifest.json)',
            });
            const selectedPath = result.filePaths[0];
            if (!result.canceled && selectedPath) {
              const ext = await extensionManager.loadExtension(selectedPath);
              if (ext) {
                await dialog.showMessageBox({
                  type: 'info',
                  title: 'Extension Loaded',
                  message: `Successfully loaded: ${ext.name}`,
                });
              } else {
                await dialog.showMessageBox({
                  type: 'error',
                  title: 'Failed to Load',
                  message: 'Could not load extension. Make sure the folder contains a valid manifest.json',
                });
              }
            }
          },
        },
        { type: 'separator' },
        {
          label: 'View Loaded Extensions',
          click: async () => {
            const extensions = extensionManager.getLoadedExtensions();
            if (extensions.length === 0) {
              await dialog.showMessageBox({
                type: 'info',
                title: 'No Extensions',
                message: 'No extensions are currently loaded.\n\nUse "Install from Chrome Web Store" or "Load from Folder" to add extensions.',
              });
            } else {
              const extList = extensions.map(e => `• ${e.name} (${e.version || 'unknown version'})`).join('\n');
              await dialog.showMessageBox({
                type: 'info',
                title: 'Loaded Extensions',
                message: `${extensions.length} extension(s) loaded:\n\n${extList}`,
              });
            }
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  windowManager.sendToFocusedRenderer(channel, ...args);
}

// IPC handlers
ipcMain.handle('get-window-bounds', (event) => {
  const webContents = event.sender;
  const browserWindow = BrowserWindow.fromWebContents(webContents);
  if (!browserWindow) return { width: 800, height: 600 };
  const size = browserWindow.getContentSize();
  return { width: size[0] ?? 800, height: size[1] ?? 600 };
});

ipcMain.handle('get-window-id', (event) => {
  const webContents = event.sender;
  const browserWindow = BrowserWindow.fromWebContents(webContents);
  if (!browserWindow) return null;
  const context = windowManager.getWindowByBrowserWindow(browserWindow);
  return context?.id || null;
});

ipcMain.handle('load-app-state', (event) => {
  const webContents = event.sender;
  const browserWindow = BrowserWindow.fromWebContents(webContents);
  if (!browserWindow) return null;
  const context = windowManager.getWindowByBrowserWindow(browserWindow);
  return context?.appState || null;
});

ipcMain.handle('save-app-state', (event, state: AppState) => {
  const webContents = event.sender;
  const browserWindow = BrowserWindow.fromWebContents(webContents);
  if (!browserWindow) return false;
  const context = windowManager.getWindowByBrowserWindow(browserWindow);
  if (context) {
    return windowManager.saveWindowState(context.id, state);
  }
  return saveAppState(state);
});

ipcMain.handle('exit-window-fullscreen', (event) => {
  const webContents = event.sender;
  const browserWindow = BrowserWindow.fromWebContents(webContents);
  if (browserWindow && !browserWindow.isDestroyed() && browserWindow.isFullScreen()) {
    browserWindow.setFullScreen(false);
  }
});

// Overlay update handler - receives tile states from main renderer, forwards to overlay
ipcMain.handle(IPC_CHANNELS.OVERLAY_UPDATE_TILES, (event, payload: OverlayUpdatePayload) => {
  const webContents = event.sender;
  const browserWindow = BrowserWindow.fromWebContents(webContents);
  if (!browserWindow) return;

  const context = windowManager.getWindowByBrowserWindow(browserWindow);
  if (context) {
    windowManager.updateOverlayTiles(context.id, payload);
  }
});

/**
 * Show dialog to ask user whether to restore previous session
 */
async function showRestoreSessionDialog(): Promise<boolean> {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Start Fresh', 'Restore Session'],
    defaultId: 1,
    cancelId: 0,
    title: 'Restore Session',
    message: 'Would you like to restore your previous session?',
    detail: 'Your previous windows and workspaces can be restored.',
  });

  // Button index 1 = "Restore Session"
  return result.response === 1;
}

/**
 * Initialize windows on app startup
 */
async function initializeWindows(): Promise<void> {
  const savedWindowIds = getAllWindowIds();

  if (savedWindowIds.length > 0) {
    // There are saved windows, ask user what to do
    const shouldRestore = await showRestoreSessionDialog();

    if (shouldRestore) {
      // Restore all saved windows
      windowManager.restoreAllWindows();
    } else {
      // Clear saved state and start fresh
      clearAllState();
      windowManager.createWindow();
    }
  } else {
    // No saved windows, create a new one
    windowManager.createWindow();
  }
}

// App lifecycle
void app.whenReady().then(async () => {
  // Setup menu first (shared across all windows)
  setupMenu();

  // Register tile IPC handlers
  registerTileIpcHandlers();

  // Connect TileViewManager to WindowManager
  const windowGetter = (windowId: string): BrowserWindow | null => {
    const context = windowManager.getWindowById(windowId);
    return context?.window || null;
  };
  tileViewManager.setWindowGetter(windowGetter);
  extensionManager.setWindowGetter(windowGetter);

  // Initialize extension support
  await extensionManager.initialize();

  // Connect TileViewManager to ExtensionManager
  tileViewManager.setExtensionCallbacks({
    onTileCreated: (tileId, windowId) => {
      extensionManager.registerTile(tileId, windowId);
    },
    onTileDestroyed: (tileId) => {
      extensionManager.unregisterTile(tileId);
    },
    onTileFocused: (tileId) => {
      extensionManager.selectTile(tileId);
    },
  });

  // Initialize windows (may show restore dialog)
  void initializeWindows();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows are open
    if (windowManager.getWindowCount() === 0) {
      windowManager.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
