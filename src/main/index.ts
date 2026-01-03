import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron';
import { windowManager } from './window-manager';
import { saveAppState, getAllWindowIds, clearAllState } from './persistence';
import type { AppState } from '@shared/workspace';

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
void app.whenReady().then(() => {
  // Setup menu first (shared across all windows)
  setupMenu();

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
