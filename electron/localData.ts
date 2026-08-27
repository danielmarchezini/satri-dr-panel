import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Dados locais NÃO sensíveis (tarefas, contatos, histórico de incidentes,
// progresso de checklist) -- em texto puro, diferente de secureStore.ts
// (que guarda token/chaves criptografados). Um único arquivo JSON simples.

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
}

export interface IncidentRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  startedAt: string;
  endedAt?: string;
  notes?: string;
  completedSteps: number;
  totalSteps: number;
}

export interface LocalData {
  tasks: Task[];
  contacts: Contact[];
  incidents: IncidentRecord[];
  checklistProgress: Record<string, Record<number, boolean>>; // scenarioId -> stepIndex -> done
}

const DEFAULT_DATA: LocalData = {
  tasks: [
    { id: 't1', title: 'Revogar a chave antiga do Backblaze B2 que foi colada no chat', done: false, createdAt: new Date().toISOString() },
    { id: 't2', title: 'Confirmar 2FA ativo nas contas admin (Supabase, Vercel, GitHub, Cloudflare, Backblaze)', done: false, createdAt: new Date().toISOString() },
    { id: 't3', title: 'Rodar um teste de restore real de produção pelo menos uma vez', done: false, createdAt: new Date().toISOString() },
  ],
  contacts: [],
  incidents: [],
  checklistProgress: {},
};

function filePath() {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'data.json');
}

export function loadData(): LocalData {
  const path = filePath();
  if (!existsSync(path)) return DEFAULT_DATA;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return { ...DEFAULT_DATA, ...raw };
  } catch {
    return DEFAULT_DATA;
  }
}

export function saveData(data: LocalData) {
  writeFileSync(filePath(), JSON.stringify(data, null, 2));
}
