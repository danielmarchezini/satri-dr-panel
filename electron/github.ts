// Cliente GitHub: Device Flow (login sem servidor de callback) + REST API
// pra disparar/ler workflows do Actions. Roda no processo principal do
// Electron pra nao expor o token nem sofrer CORS no renderer.

const CLIENT_ID_PLACEHOLDER = 'COLOQUE_O_CLIENT_ID_AQUI';

export function getClientId(): string {
  return process.env.SATRI_DR_PANEL_GITHUB_CLIENT_ID || CLIENT_ID_PLACEHOLDER;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: getClientId(), scope: 'repo workflow' }),
  });
  if (!res.ok) throw new Error(`Falha ao iniciar login (${res.status})`);
  return res.json();
}

// Poll conforme o `interval` retornado pelo passo anterior, até o usuário
// autorizar no navegador ou o código expirar.
export async function pollDeviceFlow(deviceCode: string): Promise<{ status: 'pending' | 'ok' | 'error'; token?: string; message?: string; nextIntervalSec?: number }> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: getClientId(),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = await res.json();
  console.log('[auth:pollLogin] resposta do GitHub:', JSON.stringify(data));
  if (data.access_token) return { status: 'ok', token: data.access_token };
  if (data.error === 'authorization_pending') return { status: 'pending' };
  // GitHub manda um novo `interval` (em segundos) quando pede pra
  // desacelerar -- se a gente ignora e continua no ritmo antigo, ele so
  // aumenta a punicao a cada tentativa e o login nunca completa.
  if (data.error === 'slow_down') return { status: 'pending', nextIntervalSec: data.interval };
  return { status: 'error', message: data.error_description || data.error || 'Erro desconhecido' };
}

interface GhOpts {
  token: string;
  repo: string; // owner/repo
}

async function ghFetch(path: string, opts: GhOpts, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${opts.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  return res;
}

export async function dispatchWorkflow(opts: GhOpts, workflowFile: string, ref = 'develop') {
  const res = await ghFetch(`/actions/workflows/${workflowFile}/dispatches`, opts, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref }),
  });
  if (!res.ok) throw new Error(`Falha ao disparar workflow (${res.status}): ${await res.text()}`);
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | ...
  created_at: string;
  updated_at: string;
  html_url: string;
  run_started_at: string;
}

export async function listRuns(opts: GhOpts, workflowFile: string, perPage = 5): Promise<WorkflowRun[]> {
  const res = await ghFetch(`/actions/workflows/${workflowFile}/runs?per_page=${perPage}`, opts);
  if (!res.ok) throw new Error(`Falha ao listar execuções (${res.status})`);
  const data = await res.json();
  return data.workflow_runs || [];
}
