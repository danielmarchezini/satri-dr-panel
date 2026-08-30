import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('drPanel', {
  auth: {
    startLogin: () => ipcRenderer.invoke('auth:startLogin'),
    pollLogin: (deviceCode: string) => ipcRenderer.invoke('auth:pollLogin', deviceCode),
    isLoggedIn: () => ipcRenderer.invoke('auth:isLoggedIn'),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  github: {
    setRepo: (repo: string) => ipcRenderer.invoke('github:setRepo', repo),
    getRepo: () => ipcRenderer.invoke('github:getRepo'),
    dispatch: (workflowFile: string) => ipcRenderer.invoke('github:dispatch', workflowFile),
    listRuns: (workflowFile: string, perPage?: number) => ipcRenderer.invoke('github:listRuns', workflowFile, perPage),
    promote: () => ipcRenderer.invoke('github:promote'),
  },
  storage: {
    setCreds: (provider: 'r2' | 'b2', creds: unknown) => ipcRenderer.invoke('storage:setCreds', provider, creds),
    getCredsStatus: () => ipcRenderer.invoke('storage:getCredsStatus'),
    list: (provider: 'r2' | 'b2') => ipcRenderer.invoke('storage:list', provider),
  },
  health: {
    check: () => ipcRenderer.invoke('health:check'),
    setCreds: (env: 'staging' | 'production', creds: unknown) => ipcRenderer.invoke('health:setCreds', env, creds),
    getCredsStatus: () => ipcRenderer.invoke('health:getCredsStatus'),
  },
  runbook: {
    read: () => ipcRenderer.invoke('runbook:read'),
  },
  docs: {
    read: (filename: string) => ipcRenderer.invoke('docs:read', filename),
  },
  scenarios: {
    list: () => ipcRenderer.invoke('scenarios:list'),
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    add: (title: string) => ipcRenderer.invoke('tasks:add', title),
    toggle: (id: string) => ipcRenderer.invoke('tasks:toggle', id),
    remove: (id: string) => ipcRenderer.invoke('tasks:remove', id),
  },
  contacts: {
    list: () => ipcRenderer.invoke('contacts:list'),
    save: (contact: unknown) => ipcRenderer.invoke('contacts:save', contact),
    remove: (id: string) => ipcRenderer.invoke('contacts:remove', id),
  },
  checklist: {
    get: (scenarioId: string) => ipcRenderer.invoke('checklist:get', scenarioId),
    toggleStep: (scenarioId: string, stepIndex: number) => ipcRenderer.invoke('checklist:toggleStep', scenarioId, stepIndex),
    reset: (scenarioId: string) => ipcRenderer.invoke('checklist:reset', scenarioId),
  },
  incidents: {
    list: () => ipcRenderer.invoke('incidents:list'),
    start: (scenarioId: string, scenarioTitle: string, totalSteps: number) => ipcRenderer.invoke('incidents:start', scenarioId, scenarioTitle, totalSteps),
    finish: (id: string, completedSteps: number, notes: string) => ipcRenderer.invoke('incidents:finish', id, completedSteps, notes),
  },
});
