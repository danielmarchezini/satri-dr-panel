import { useEffect, useState } from 'react';
import type { WorkflowRun } from '../global';

function RunRow({ run }: { run: WorkflowRun }) {
  const badge = run.status !== 'completed'
    ? <span className="badge warn">em andamento</span>
    : run.conclusion === 'success'
      ? <span className="badge ok">sucesso</span>
      : <span className="badge danger">falhou</span>;
  return (
    <tr>
      <td>{new Date(run.run_started_at).toLocaleString('pt-BR')}</td>
      <td>{badge}</td>
      <td><a href={run.html_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>ver no GitHub ↗</a></td>
    </tr>
  );
}

function WorkflowCard({ title, description, file }: { title: string; description: string; file: string }) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try { setRuns(await window.drPanel.github.listRuns(file)); } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const trigger = async () => {
    setDispatching(true);
    setMessage(null);
    try {
      await window.drPanel.github.dispatch(file);
      setMessage('Disparado! Pode levar alguns segundos pra aparecer na lista abaixo.');
      setTimeout(load, 5000);
    } catch (e: any) {
      setMessage(`Erro: ${e.message}`);
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>{description}</p>
      <button onClick={trigger} disabled={dispatching}>
        {dispatching ? 'Disparando...' : '▶ Rodar agora'}
      </button>
      <button className="secondary" onClick={load} style={{ marginLeft: 8 }}>↻ Atualizar lista</button>
      {message && <p style={{ fontSize: 13, marginTop: 10 }}>{message}</p>}

      {runs.length > 0 && (
        <table style={{ marginTop: 14 }}>
          <thead><tr><th>Quando</th><th>Status</th><th></th></tr></thead>
          <tbody>{runs.map(r => <RunRow key={r.id} run={r} />)}</tbody>
        </table>
      )}
    </div>
  );
}

export default function Actions() {
  return (
    <div>
      <h2>Ações</h2>
      <WorkflowCard
        title="Backup semanal (staging + produção)"
        description="Gera dump do banco, criptografa e sobe pro Cloudflare R2 e Backblaze B2. Roda sozinho todo domingo — aqui dá pra forçar uma execução extra."
        file="backup-postgres.yml"
      />
      <WorkflowCard
        title="Teste de restore (staging + produção)"
        description="Baixa o backup mais recente, restaura num Postgres descartável e confere se os dados estão íntegros. Não mexe em nada real."
        file="test-restore.yml"
      />
    </div>
  );
}
