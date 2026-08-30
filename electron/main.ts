import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { loadSecrets, updateSecrets, clearSecrets } from './secureStore';
import { startDeviceFlow, pollDeviceFlow, dispatchWorkflow, listRuns, mergeBranch } from './github';
import { listBackups, type StorageCreds } from './storage';
import { loadData, saveData, type Task, type Contact, type IncidentRecord } from './localData';
import { SCENARIOS } from './scenarios';
import { checkEnv, type SupabaseCreds } from './health';

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
    win.webContents.openDevTools({ mode: 'detach' });
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

ipcMain.handle('github:listRuns', async (_e, workflowFile: string, perPage?: number) => {
  const opts = requireGithub();
  return listRuns(opts, workflowFile, perPage);
});

ipcMain.handle('github:promote', async () => {
  const opts = requireGithub();
  return mergeBranch(opts, 'main', 'develop');
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

// --- Saude do Supabase (staging / producao) ---

const HEALTH_KEY = { staging: 'supabaseStaging', production: 'supabaseProduction' } as const;

ipcMain.handle('health:setCreds', async (_e, env: 'staging' | 'production', creds: SupabaseCreds) => {
  updateSecrets({ [HEALTH_KEY[env]]: creds } as any);
});

ipcMain.handle('health:getCredsStatus', async () => {
  const s = loadSecrets();
  return {
    staging: { configured: !!s.supabaseStaging?.url, hasServiceKey: !!s.supabaseStaging?.serviceKey },
    production: { configured: !!s.supabaseProduction?.url, hasServiceKey: !!s.supabaseProduction?.serviceKey },
  };
});

ipcMain.handle('health:check', async () => {
  const s = loadSecrets();
  // Os dois ambientes em paralelo: um fora do ar nao pode atrasar o outro.
  return Promise.all([
    checkEnv('staging', s.supabaseStaging),
    checkEnv('production', s.supabaseProduction),
  ]);
});

// --- Runbook ---

ipcMain.handle('runbook:read', async () => readDoc('DISASTER_RECOVERY.md'));

// --- Documentos (Arquitetura, Protocolo, Runbook) ---

const ALLOWED_DOCS = new Set(['DISASTER_RECOVERY.md', 'ARCHITECTURE.md', 'CLAUDE.md']);

function readDoc(filename: string): string {
  if (!ALLOWED_DOCS.has(filename)) return `# Documento inválido: ${filename}`;
  const candidates = [
    join(__dirname, '../resources', filename),
    join(process.resourcesPath || '', filename),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf-8');
  }
  return `# ${filename} não encontrado\n\nCopie \`${filename}\` do repositório \`intranetsatri\` para \`resources/${filename}\` neste projeto.`;
}

ipcMain.handle('docs:read', async (_e, filename: string) => readDoc(filename));

// --- Cenários / checklist ---

ipcMain.handle('scenarios:list', async () => SCENARIOS);

// --- Tarefas ---

ipcMain.handle('tasks:list', async () => loadData().tasks);

ipcMain.handle('tasks:add', async (_e, title: string) => {
  const data = loadData();
  const task: Task = { id: `t_${Date.now()}`, title, done: false, createdAt: new Date().toISOString() };
  data.tasks.push(task);
  saveData(data);
  return data.tasks;
});

ipcMain.handle('tasks:toggle', async (_e, id: string) => {
  const data = loadData();
  const t = data.tasks.find(x => x.id === id);
  if (t) t.done = !t.done;
  saveData(data);
  return data.tasks;
});

ipcMain.handle('tasks:remove', async (_e, id: string) => {
  const data = loadData();
  data.tasks = data.tasks.filter(x => x.id !== id);
  saveData(data);
  return data.tasks;
});

// --- Contatos ---

ipcMain.handle('contacts:list', async () => loadData().contacts);

ipcMain.handle('contacts:save', async (_e, contact: Contact) => {
  const data = loadData();
  const idx = data.contacts.findIndex(c => c.id === contact.id);
  if (idx >= 0) data.contacts[idx] = contact;
  else data.contacts.push({ ...contact, id: contact.id || `c_${Date.now()}` });
  saveData(data);
  return data.contacts;
});

ipcMain.handle('contacts:remove', async (_e, id: string) => {
  const data = loadData();
  data.contacts = data.contacts.filter(c => c.id !== id);
  saveData(data);
  return data.contacts;
});

// --- Checklist (progresso por cenário) ---

ipcMain.handle('checklist:get', async (_e, scenarioId: string) => {
  return loadData().checklistProgress[scenarioId] || {};
});

ipcMain.handle('checklist:toggleStep', async (_e, scenarioId: string, stepIndex: number) => {
  const data = loadData();
  if (!data.checklistProgress[scenarioId]) data.checklistProgress[scenarioId] = {};
  data.checklistProgress[scenarioId][stepIndex] = !data.checklistProgress[scenarioId][stepIndex];
  saveData(data);
  return data.checklistProgress[scenarioId];
});

ipcMain.handle('checklist:reset', async (_e, scenarioId: string) => {
  const data = loadData();
  data.checklistProgress[scenarioId] = {};
  saveData(data);
});

// --- Incidentes ---

ipcMain.handle('incidents:list', async () => loadData().incidents);

ipcMain.handle('incidents:start', async (_e, scenarioId: string, scenarioTitle: string, totalSteps: number) => {
  const data = loadData();
  const incident: IncidentRecord = {
    id: `i_${Date.now()}`,
    scenarioId,
    scenarioTitle,
    startedAt: new Date().toISOString(),
    completedSteps: 0,
    totalSteps,
  };
  data.incidents.unshift(incident);
  saveData(data);
  return incident;
});

ipcMain.handle('incidents:finish', async (_e, id: string, completedSteps: number, notes: string) => {
  const data = loadData();
  const inc = data.incidents.find(i => i.id === id);
  if (inc) {
    inc.endedAt = new Date().toISOString();
    inc.completedSteps = completedSteps;
    inc.notes = notes;
  }
  saveData(data);
  return data.incidents;
});
