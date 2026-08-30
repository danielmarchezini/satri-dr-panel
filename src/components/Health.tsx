import { useEffect, useRef, useState } from 'react';
import type { EnvHealth, ServicePing, HealthMetrics, SupabaseCreds } from '../global';

const REFRESH_MS = 60000;

function formatBytes(bytes: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function PingBadge({ ping }: { ping: ServicePing }) {
  if (ping.state === 'sem-credencial') return <span className="badge muted">não configurado</span>;
  if (ping.state === 'fora') return <span className="badge danger">✕ fora {ping.detail ? `(${ping.detail})` : ''}</span>;
  if (ping.state === 'lento') return <span className="badge warn">⚠ lento ({ping.latencyMs} ms)</span>;
  return <span className="badge ok">✓ ok ({ping.latencyMs} ms)</span>;
}

// Faixas escolhidas a partir do incidente de 29/08/2026: a instancia Free tem
// ~426 MB de RAM e ja' opera perto de 50% em repouso, entao 50% nao e' alarme.
// O que precede a queda por OOM e' a faixa alta.
function UsageBar({ label, pct, detail, warnAt, dangerAt }: {
  label: string; pct: number; detail: string; warnAt: number; dangerAt: number;
}) {
  const color = pct >= dangerAt ? 'var(--danger)' : pct >= warnAt ? 'var(--warn)' : 'var(--ok)';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="stat-label">{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color }}>{pct.toFixed(0)}% · {detail}</span>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function Metrics({ m }: { m: HealthMetrics }) {
  return (
    <div style={{ marginTop: 14 }}>
      <UsageBar
        label="Memória da instância"
        pct={m.memUsedPct}
        detail={`${formatBytes(m.memTotalBytes - m.memAvailableBytes)} de ${formatBytes(m.memTotalBytes)}`}
        warnAt={75}
        dangerAt={88}
      />
      <UsageBar
        label="Disco (/data)"
        pct={m.diskUsedPct}
        detail={`${formatBytes(m.diskTotalBytes - m.diskAvailBytes)} de ${formatBytes(m.diskTotalBytes)}`}
        warnAt={75}
        dangerAt={90}
      />
      <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--muted)' }}>
        <span>Conexões máx.: <b>{m.connectionsMax ?? '—'}</b></span>
        <span>
          Na fila:{' '}
          <b style={{ color: (m.connectionsWaiting ?? 0) > 0 ? 'var(--warn)' : undefined }}>
            {m.connectionsWaiting ?? '—'}
          </b>
        </span>
      </div>
    </div>
  );
}

function EnvCard({ h }: { h: EnvHealth }) {
  const title = h.env === 'staging' ? 'Staging' : 'Produção';
  const down = h.rest.state === 'fora' || h.auth.state === 'fora';

  return (
    <div className="card" style={down ? { borderColor: 'var(--danger)' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {down && <span className="badge danger">fora do ar</span>}
      </div>

      {!h.configured ? (
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          Configure a URL e a anon key deste ambiente na aba Armazenamento para monitorá-lo.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="stat-label">Banco / REST</span> <PingBadge ping={h.rest} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="stat-label">Autenticação</span> <PingBadge ping={h.auth} />
            </div>
          </div>

          {h.metrics ? (
            <Metrics m={h.metrics} />
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0, marginTop: 12 }}>
              Métricas indisponíveis{h.metricsError ? ` (${h.metricsError})` : ''} — informe a service key
              para ver memória, disco e conexões.
            </p>
          )}

          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
            Verificado às {new Date(h.checkedAt).toLocaleTimeString('pt-BR')}
          </div>
        </>
      )}
    </div>
  );
}

function CredsForm({ env, onSaved }: { env: 'staging' | 'production'; onSaved: () => void }) {
  const [creds, setCreds] = useState<SupabaseCreds>({ url: '', anonKey: '', serviceKey: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await window.drPanel.health.setCreds(env, creds);
    setSaving(false);
    onSaved();
  };

  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
      <div>
        <div className="stat-label">URL do projeto</div>
        <input value={creds.url} onChange={e => setCreds({ ...creds, url: e.target.value.trim().replace(/\/$/, '') })} placeholder="https://xxxx.supabase.co" />
      </div>
      <div>
        <div className="stat-label">Anon key</div>
        <input type="password" value={creds.anonKey} onChange={e => setCreds({ ...creds, anonKey: e.target.value.trim() })} />
      </div>
      <div>
        <div className="stat-label">Service key (opcional — libera memória/disco)</div>
        <input type="password" value={creds.serviceKey} onChange={e => setCreds({ ...creds, serviceKey: e.target.value.trim() })} />
      </div>
      <button onClick={save} disabled={saving || !creds.url || !creds.anonKey}>
        {saving ? 'Salvando...' : 'Salvar (fica criptografado só nesta máquina)'}
      </button>
    </div>
  );
}

export default function Health() {
  const [envs, setEnvs] = useState<EnvHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<'staging' | 'production' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setEnvs(await window.drPanel.health.check());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Recheca sozinho: o valor do painel e' justamente perceber a queda sem
    // precisar lembrar de apertar um botao.
    timer.current = setInterval(load, REFRESH_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Saúde do Supabase</h2>
        <button onClick={load} disabled={loading}>{loading ? 'Verificando...' : '↻ Verificar agora'}</button>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        {envs.map(h => <EnvCard key={h.env} h={h} />)}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Credenciais de monitoramento</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setConfiguring(configuring === 'staging' ? null : 'staging')}>Staging</button>
          <button onClick={() => setConfiguring(configuring === 'production' ? null : 'production')}>Produção</button>
        </div>
        {configuring && (
          <CredsForm
            env={configuring}
            onSaved={() => { setConfiguring(null); load(); }}
          />
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0, marginTop: 14 }}>
          Só leitura: as chaves são usadas para dar ping nos serviços e ler o endpoint de métricas.
          Ficam criptografadas nesta máquina (DPAPI), como as credenciais de backup.
        </p>
      </div>
    </div>
  );
}
