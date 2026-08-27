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

function PipelineCard({ title, subtitle, file, badgeColor }: { title: string; subtitle: string; file: string; badgeColor: string }) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setRuns(await window.drPanel.github.listRuns(file, 5)); }
    catch (e: any) { setError(e.message); }
  };

  useEffect(() => { load(); }, []);

  const latest = runs[0];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{subtitle}</p>
        </div>
        <span className="badge" style={{ background: `${badgeColor}22`, color: badgeColor }}>{file}</span>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {latest && (
        <p style={{ fontSize: 13, marginTop: 10 }}>
          Última execução: {latest.status !== 'completed'
            ? <span className="badge warn">em andamento</span>
            : latest.conclusion === 'success' ? <span className="badge ok">✓ sucesso</span> : <span className="badge danger">✕ falhou</span>}
          {' '}— {new Date(latest.run_started_at).toLocaleString('pt-BR')}
        </p>
      )}

      <button className="secondary" onClick={load} style={{ marginTop: 4 }}>↻ Atualizar</button>

      {runs.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Quando</th><th>Status</th><th></th></tr></thead>
          <tbody>{runs.map(r => <RunRow key={r.id} run={r} />)}</tbody>
        </table>
      )}
    </div>
  );
}

export default function Deploys() {
  return (
    <div>
      <h2>Deploys</h2>

      <div className="card">
        <p>
          Você não precisa "fazer" deploy — <b>todo <code>git push</code> já dispara tudo sozinho</b>.
          Duas coisas rodam em paralelo a cada push: a <b>Vercel</b> publica o site, e o <b>GitHub Actions</b> atualiza
          o banco (migrations) e as funções de backend.
        </p>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Branch</th><th>Vai pra</th></tr></thead>
          <tbody>
            <tr><td><code>develop</code></td><td>🧪 Staging (globo.stage.colabfy.com.br) — pra testar primeiro</td></tr>
            <tr><td><code>main</code></td><td>🚀 Produção — só depois de validado em staging</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
          Promover de <code>develop</code> pra <code>main</code> é sempre uma decisão manual — nunca acontece sozinho.
        </p>
      </div>

      <PipelineCard
        title="🧪 Checagem (CI)"
        subtitle="Typecheck + build, roda em todo push/PR — só confere se não quebrou nada, não é deploy."
        file="ci.yml"
        badgeColor="var(--muted)"
      />
      <PipelineCard
        title="🧪 Deploy Staging"
        subtitle="Dispara sozinho a cada push em develop. Aplica migrations e publica as funções no projeto de staging."
        file="supabase-staging.yml"
        badgeColor="var(--accent)"
      />
      <PipelineCard
        title="🚀 Deploy Produção"
        subtitle="Dispara sozinho a cada push em main. Mesma coisa, só que no projeto de produção de verdade."
        file="supabase-prod.yml"
        badgeColor="var(--danger)"
      />
    </div>
  );
}
