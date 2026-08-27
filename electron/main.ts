import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { loadSecrets, updateSecrets, clearSecrets } from './secureStore';
import { startDeviceFlow, pollDeviceFlow, dispatchWorkflow, listRuns } from './github';
import { listBackups, type StorageCreds } from './storage';

const isDev = !app.isPackaged;
const DEFAULT_REPO = 'danielmarchezini/intranetsatri';

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'SATRI DR Panel',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Auth (GitHub Device Flow) ---

ipcMain.handle('auth:startLogin', async () => {
  return startDeviceFlow();
});

ipcMain.handle('auth:pollLogin', async (_e, deviceCode: string) => {
  const result = await pollDeviceFlow(deviceCode);
  if (result.status === 'ok' && result.token) {
    updateSecrets({ githubToken: result.token, githubRepo: loadSecrets().githubRepo || DEFAULT_REPO });
  }
  return result;
});

ipcMain.handle('auth:isLoggedIn', async () => {
  return !!loadSecrets().githubToken;
});

ipcMain.handle('auth:logout', async () => {
  clearSecrets();
});

// --- GitHub Actions ---

ipcMain.handle('github:setRepo', async (_e, repo: string) => {
  updateSecrets({ githubRepo: repo });
});

ipcMain.handle('github:getRepo', async () => {
  return loadSecrets().githubRepo || DEFAULT_REPO;
});

function requireGithub() {
  const s = loadSecrets();
  if (!s.githubToken) throw new Error('Não autenticado no GitHub');
  return { token: s.githubToken, repo: s.githubRepo || DEFAULT_REPO };
}

ipcMain.handle('github:dispatch', async (_e, workflowFile: string) => {
  const opts = requireGithub();
  await dispatchWorkflow(opts, workflowFile);
});

ipcMain.handle('github:listRuns', async (_e, workflowFile: string) => {
  const opts = requireGithub();
  return listRuns(opts, workflowFile);
});

// --- Storage (R2 / B2) ---

ipcMain.handle('storage:setCreds', async (_e, provider: 'r2' | 'b2', creds: StorageCreds) => {
  updateSecrets({ [provider]: creds } as any);
});

ipcMain.handle('storage:getCredsStatus', async () => {
  const s = loadSecrets();
  return { r2: !!s.r2, b2: !!s.b2 };
});

ipcMain.handle('storage:list', async (_e, provider: 'r2' | 'b2') => {
  const s = loadSecrets();
  const creds = s[provider];
  if (!creds) throw new Error(`Credenciais de ${provider.toUpperCase()} não configuradas`);
  return listBackups(creds);
});

// --- Runbook ---

ipcMain.handle('runbook:read', async () => {
  const candidates = [
    join(__dirname, '../resources/DISASTER_RECOVERY.md'),
    join(process.resourcesPath || '', 'DISASTER_RECOVERY.md'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf-8');
  }
  return '# Runbook não encontrado\n\nCopie `docs/DISASTER_RECOVERY.md` do repositório `intranetsatri` para `resources/DISASTER_RECOVERY.md` neste projeto.';
});
