import { useEffect, useState } from 'react';
import type { StorageSummary, WorkflowRun } from '../global';

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function AgeBadge({ iso, okDays, warnDays }: { iso?: string; okDays: number; warnDays: number }) {
  if (!iso) return <span className="badge muted">sem dados</span>;
  const d = daysSince(iso);
  const label = d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`;
  if (d <= okDays) return <span className="badge ok">✓ {label}</span>;
  if (d <= warnDays) return <span className="badge warn">⚠ {label}</span>;
  return <span className="badge danger">✕ {label}</span>;
}

function RunBadge({ run }: { run?: WorkflowRun }) {
  if (!run) return <span className="badge muted">sem execuções</span>;
  if (run.status !== 'completed') return <span className="badge warn">em andamento</span>;
  if (run.conclusion === 'success') return <span className="badge ok">✓ passou ({daysSince(run.run_started_at)}d atrás)</span>;
  return <span className="badge danger">✕ falhou ({daysSince(run.run_started_at)}d atrás)</span>;
}

const LABELS = ['staging', 'production'] as const;

export default function Dashboard() {
  const [r2, setR2] = useState<StorageSummary | null>(null);
  const [b2, setB2] = useState<StorageSummary | null>(null);
  const [credsStatus, setCredsStatus] = useState<{ r2: boolean; b2: boolean } | null>(null);
  const [backupRuns, setBackupRuns] = useState<WorkflowRun[]>([]);
  const [restoreRuns, setRestoreRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const errs: string[] = [];
    const status = await window.drPanel.storage.getCredsStatus();
    setCredsStatus(status);

    if (status.r2) {
      try { setR2(await window.drPanel.storage.list('r2')); }
      catch (e: any) { errs.push(`R2: ${e.message}`); }
    }
    if (status.b2) {
      try { setB2(await window.drPanel.storage.list('b2')); }
      catch (e: any) { errs.push(`Backblaze B2: ${e.message}`); }
    }
    try { setBackupRuns(await window.drPanel.github.listRuns('backup-postgres.yml')); }
    catch (e: any) { errs.push(`Runs de backup: ${e.message}`); }
    try { setRestoreRuns(await window.drPanel.github.listRuns('test-restore.yml')); }
    catch (e: any) { errs.push(`Runs de restore: ${e.message}`); }

    setErrors(errs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const latestBackupRun = backupRuns[0];
  const latestRestoreRun = restoreRuns[0];

  return (
    <div>
      <h2>Saúde dos backups</h2>

      {errors.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          {errors.map((e, i) => <div key={i} style={{ color: 'var(--danger)' }}>{e}</div>)}
        </div>
      )}

      <div className="card">
        <div className="grid">
          <div>
            <div className="stat-label">Última execução — Backup semanal</div>
            <div className="stat-value"><RunBadge run={latestBackupRun} /></div>
          </div>
          <div>
            <div className="stat-label">Última execução — Teste de restore</div>
            <div className="stat-value"><RunBadge run={latestRestoreRun} /></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Última cópia por ambiente</h3>
        <table>
          <thead>
            <tr>
              <th>Ambiente</th>
              <th>Cloudflare R2</th>
              <th>Backblaze B2 (redundante)</th>
            </tr>
          </thead>
          <tbody>
            {LABELS.map(label => (
              <tr key={label}>
                <td style={{ textTransform: 'capitalize' }}>{label}</td>
                <td>
                  {credsStatus?.r2
                    ? <AgeBadge iso={r2?.latestByLabel[label]?.lastModified} okDays={8} warnDays={14} />
                    : <span className="badge muted">não configurado</span>}
                </td>
                <td>
                  {credsStatus?.b2
                    ? <AgeBadge iso={b2?.latestByLabel[label]?.lastModified} okDays={8} warnDays={14} />
                    : <span className="badge muted">não configurado</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(credsStatus?.r2 || credsStatus?.b2) && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Espaço ocupado</h3>
          <div className="grid">
            {credsStatus?.r2 && (
              <div>
                <div className="stat-label">Cloudflare R2</div>
                <div className="stat-value">{r2 ? formatBytes(r2.totalBytes) : '—'}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r2?.files.length ?? 0} arquivos</div>
              </div>
            )}
            {credsStatus?.b2 && (
              <div>
                <div className="stat-label">Backblaze B2</div>
                <div className="stat-value">{b2 ? formatBytes(b2.totalBytes) : '—'}</div>
                {b2 && b2.totalBytes > 9 * 1024 ** 3 && (
                  <div style={{ color: 'var(--warn)', fontSize: 12 }}>⚠ perto do limite gratuito de 10GB</div>
                )}
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{b2?.files.length ?? 0} arquivos</div>
              </div>
            )}
          </div>
        </div>
      )}

      <button className="secondary" onClick={load} disabled={loading}>
        {loading ? 'Atualizando...' : '↻ Atualizar'}
      </button>
    </div>
  );
}
