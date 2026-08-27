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
    listRuns: (workflowFile: string) => ipcRenderer.invoke('github:listRuns', workflowFile),
  },
  storage: {
    setCreds: (provider: 'r2' | 'b2', creds: unknown) => ipcRenderer.invoke('storage:setCreds', provider, creds),
    getCredsStatus: () => ipcRenderer.invoke('storage:getCredsStatus'),
    list: (provider: 'r2' | 'b2') => ipcRenderer.invoke('storage:list', provider),
  },
  runbook: {
    read: () => ipcRenderer.invoke('runbook:read'),
  },
});
