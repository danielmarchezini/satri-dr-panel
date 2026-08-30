// Monitoramento de saude dos projetos Supabase.
//
// Motivacao concreta: em 29/08/2026 o projeto de staging ficou fora do ar
// (Database, PostgREST, Auth e Storage todos "Unhealthy") e so' descobrimos
// ao tentar usar o sistema. Medindo o endpoint de metricas na epoca, o disco
// estava com 5% de uso mas a RAM da instancia Free era de 426 MB, com metade
// ja comprometida em repouso -- ou seja, o gargalo e' memoria, nao disco.
// Este modulo existe pra essa informacao aparecer ANTES da queda.

export interface SupabaseCreds {
  url: string;        // https://<ref>.supabase.co
  anonKey: string;
  serviceKey?: string; // opcional: sem ela nao ha metricas, so' ping
}

export type ServiceState = 'ok' | 'lento' | 'fora' | 'sem-credencial';

export interface ServicePing {
  state: ServiceState;
  httpStatus: number | null;
  latencyMs: number;
  detail?: string;
}

export interface HealthMetrics {
  memTotalBytes: number;
  memAvailableBytes: number;
  memUsedPct: number;
  diskTotalBytes: number;
  diskAvailBytes: number;
  diskUsedPct: number;
  connectionsMax: number | null;
  connectionsWaiting: number | null;
}

export interface EnvHealth {
  env: 'staging' | 'production';
  checkedAt: string;
  configured: boolean;
  rest: ServicePing;
  auth: ServicePing;
  metrics: HealthMetrics | null;
  metricsError?: string;
}

const TIMEOUT_MS = 12000;
// Acima disso o servico responde, mas ja' esta sofrendo -- foi a faixa em que
// o staging ficou antes de cair de vez (login-secure levou 90s).
const SLOW_MS = 3000;

async function ping(url: string, headers: Record<string, string>): Promise<ServicePing> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const latencyMs = Date.now() - started;
    // 401/404 significam "o servico respondeu" -- e' resposta de aplicacao,
    // nao queda. So' 5xx e timeout contam como fora do ar.
    const down = res.status >= 500;
    return {
      state: down ? 'fora' : latencyMs > SLOW_MS ? 'lento' : 'ok',
      httpStatus: res.status,
      latencyMs,
      detail: down ? `HTTP ${res.status}` : undefined,
    };
  } catch (e: any) {
    return {
      state: 'fora',
      httpStatus: null,
      latencyMs: Date.now() - started,
      detail: e?.name === 'AbortError' ? `sem resposta em ${TIMEOUT_MS / 1000}s` : String(e?.message || e),
    };
  } finally {
    clearTimeout(timer);
  }
}

// O endpoint devolve texto no formato Prometheus. Pegamos so' as poucas
// series que interessam, sem depender de biblioteca de parsing.
function readMetric(text: string, name: string, filter?: (labels: string) => boolean): number | null {
  const re = new RegExp(`^${name}\\{([^}]*)\\}\\s+([0-9.eE+-]+)$`, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!filter || filter(m[1])) {
      const v = Number(m[2]);
      if (!Number.isNaN(v)) return v;
    }
  }
  return null;
}

function sumMetric(text: string, name: string): number | null {
  const re = new RegExp(`^${name}\\{[^}]*\\}\\s+([0-9.eE+-]+)$`, 'gm');
  let m: RegExpExecArray | null;
  let total = 0;
  let found = false;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (!Number.isNaN(v)) { total += v; found = true; }
  }
  return found ? total : null;
}

async function fetchMetrics(creds: SupabaseCreds): Promise<{ metrics: HealthMetrics | null; error?: string }> {
  if (!creds.serviceKey) return { metrics: null, error: 'sem service key' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const auth = Buffer.from(`service_role:${creds.serviceKey}`).toString('base64');
    const res = await fetch(`${creds.url}/customer/v1/privileged/metrics`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
    if (!res.ok) return { metrics: null, error: `HTTP ${res.status}` };
    const text = await res.text();

    const memTotal = readMetric(text, 'node_memory_MemTotal_bytes') ?? 0;
    const memAvail = readMetric(text, 'node_memory_MemAvailable_bytes') ?? 0;
    // O volume de dados fica em /data; a raiz e' o sistema e nao interessa.
    const isData = (labels: string) => labels.includes('mountpoint="/data"');
    const diskTotal = readMetric(text, 'node_filesystem_size_bytes', isData) ?? 0;
    const diskAvail = readMetric(text, 'node_filesystem_avail_bytes', isData) ?? 0;

    return {
      metrics: {
        memTotalBytes: memTotal,
        memAvailableBytes: memAvail,
        memUsedPct: memTotal > 0 ? ((memTotal - memAvail) / memTotal) * 100 : 0,
        diskTotalBytes: diskTotal,
        diskAvailBytes: diskAvail,
        diskUsedPct: diskTotal > 0 ? ((diskTotal - diskAvail) / diskTotal) * 100 : 0,
        connectionsMax: readMetric(text, 'max_connections_connection_count'),
        connectionsWaiting: sumMetric(text, 'pgbouncer_pools_client_waiting_connections'),
      },
    };
  } catch (e: any) {
    return { metrics: null, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkEnv(env: 'staging' | 'production', creds?: SupabaseCreds): Promise<EnvHealth> {
  const checkedAt = new Date().toISOString();
  if (!creds?.url || !creds?.anonKey) {
    const none: ServicePing = { state: 'sem-credencial', httpStatus: null, latencyMs: 0 };
    return { env, checkedAt, configured: false, rest: none, auth: none, metrics: null };
  }

  const headers = { apikey: creds.anonKey, Authorization: `Bearer ${creds.anonKey}` };
  const [rest, authPing, met] = await Promise.all([
    ping(`${creds.url}/rest/v1/`, headers),
    ping(`${creds.url}/auth/v1/health`, headers),
    fetchMetrics(creds),
  ]);

  return {
    env,
    checkedAt,
    configured: true,
    rest,
    auth: authPing,
    metrics: met.metrics,
    metricsError: met.error,
  };
}
