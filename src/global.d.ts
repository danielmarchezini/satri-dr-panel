export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  run_started_at: string;
}

export interface StorageCreds {
  accessKey: string;
  secretKey: string;
  endpoint: string;
  bucket: string;
}

export interface BackupFile {
  key: string;
  label: string;
  sizeBytes: number;
  lastModified: string;
}

export interface StorageSummary {
  files: BackupFile[];
  totalBytes: number;
  latestByLabel: Record<string, BackupFile | undefined>;
}

export interface Scenario {
  id: string;
  title: string;
  steps: string[];
}

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

export interface MergeResult {
  status: 'merged' | 'already_up_to_date' | 'conflict';
  sha?: string;
  message?: string;
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

declare global {
  interface Window {
    drPanel: {
      auth: {
        startLogin: () => Promise<DeviceCodeResponse>;
        pollLogin: (deviceCode: string) => Promise<{ status: 'pending' | 'ok' | 'error'; token?: string; message?: string; nextIntervalSec?: number }>;
        isLoggedIn: () => Promise<boolean>;
        logout: () => Promise<void>;
      };
      github: {
        setRepo: (repo: string) => Promise<void>;
        getRepo: () => Promise<string>;
        dispatch: (workflowFile: string) => Promise<void>;
        listRuns: (workflowFile: string, perPage?: number) => Promise<WorkflowRun[]>;
        promote: () => Promise<MergeResult>;
      };
      storage: {
        setCreds: (provider: 'r2' | 'b2', creds: StorageCreds) => Promise<void>;
        getCredsStatus: () => Promise<{ r2: boolean; b2: boolean }>;
        list: (provider: 'r2' | 'b2') => Promise<StorageSummary>;
      };
      runbook: {
        read: () => Promise<string>;
      };
      docs: {
        read: (filename: string) => Promise<string>;
      };
      scenarios: {
        list: () => Promise<Scenario[]>;
      };
      tasks: {
        list: () => Promise<Task[]>;
        add: (title: string) => Promise<Task[]>;
        toggle: (id: string) => Promise<Task[]>;
        remove: (id: string) => Promise<Task[]>;
      };
      contacts: {
        list: () => Promise<Contact[]>;
        save: (contact: Contact) => Promise<Contact[]>;
        remove: (id: string) => Promise<Contact[]>;
      };
      checklist: {
        get: (scenarioId: string) => Promise<Record<number, boolean>>;
        toggleStep: (scenarioId: string, stepIndex: number) => Promise<Record<number, boolean>>;
        reset: (scenarioId: string) => Promise<void>;
      };
      incidents: {
        list: () => Promise<IncidentRecord[]>;
        start: (scenarioId: string, scenarioTitle: string, totalSteps: number) => Promise<IncidentRecord>;
        finish: (id: string, completedSteps: number, notes: string) => Promise<IncidentRecord[]>;
      };
    };
  }
}
