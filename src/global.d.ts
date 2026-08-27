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

declare global {
  interface Window {
    drPanel: {
      auth: {
        startLogin: () => Promise<DeviceCodeResponse>;
        pollLogin: (deviceCode: string) => Promise<{ status: 'pending' | 'ok' | 'error'; token?: string; message?: string }>;
        isLoggedIn: () => Promise<boolean>;
        logout: () => Promise<void>;
      };
      github: {
        setRepo: (repo: string) => Promise<void>;
        getRepo: () => Promise<string>;
        dispatch: (workflowFile: string) => Promise<void>;
        listRuns: (workflowFile: string) => Promise<WorkflowRun[]>;
      };
      storage: {
        setCreds: (provider: 'r2' | 'b2', creds: StorageCreds) => Promise<void>;
        getCredsStatus: () => Promise<{ r2: boolean; b2: boolean }>;
        list: (provider: 'r2' | 'b2') => Promise<StorageSummary>;
      };
      runbook: {
        read: () => Promise<string>;
      };
    };
  }
}
