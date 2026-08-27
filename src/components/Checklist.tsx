import { useEffect, useState } from 'react';
import type { Scenario, IncidentRecord } from '../global';

export default function Checklist() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedId, setSelectedId] = useState<string>('B');
  const [progress, setProgress] = useState<Record<number, boolean>>({});
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    window.drPanel.scenarios.list().then(setScenarios);
    window.drPanel.incidents.list().then(setIncidents);
  }, []);

  useEffect(() => {
    window.drPanel.checklist.get(selectedId).then(setProgress);
  }, [selectedId]);

  const scenario = scenarios.find(s => s.id === selectedId);
  const doneCount = Object.values(progress).filter(Boolean).length;

  const toggleStep = async (index: number) => {
    const next = await window.drPanel.checklist.toggleStep(selectedId, index);
    setProgress(next);
  };

  const resetChecklist = async () => {
    await window.drPanel.checklist.reset(selectedId);
    setProgress({});
  };

  const declareIncident = async () => {
    if (!scenario) return;
    await resetChecklist();
    const inc = await window.drPanel.incidents.start(scenario.id, scenario.title, scenario.steps.length);
    setIncident(inc);
    setNotes('');
  };

  const finishIncident = async () => {
    if (!incident) return;
    const list = await window.drPanel.incidents.finish(incident.id, doneCount, notes);
    setIncidents(list);
    setIncident(null);
  };

  return (
    <div>
      <h2>Checklist de restore</h2>

      <div className="card">
        <div className="stat-label">Cenário</div>
        <select
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setIncident(null); }}
          style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: 8, borderRadius: 6, width: '100%', marginTop: 6 }}
        >
          {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </div>

      {incident && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <span className="badge danger">🚨 INCIDENTE EM ANDAMENTO</span>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            Iniciado em {new Date(incident.startedAt).toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      {scenario && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="stat-label">{doneCount} de {scenario.steps.length} passos concluídos</span>
            {!incident && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="secondary" onClick={resetChecklist}>Limpar</button>
                <button className="danger" onClick={declareIncident}>🚨 Declarar incidente</button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenario.steps.map((step, i) => (
              <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!progress[i]} onChange={() => toggleStep(i)} style={{ width: 18, height: 18, marginTop: 2 }} />
                <span style={{ textDecoration: progress[i] ? 'line-through' : 'none', color: progress[i] ? 'var(--muted)' : 'var(--text)' }}>
                  {step}
                </span>
              </label>
            ))}
          </div>

          {incident && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div className="stat-label">Notas do incidente</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginTop: 6 }}
              />
              <button onClick={finishIncident} style={{ marginTop: 10 }}>Encerrar incidente</button>
            </div>
          )}
        </div>
      )}

      {incidents.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Histórico de incidentes</h3>
          <table>
            <thead><tr><th>Cenário</th><th>Início</th><th>Duração</th><th>Progresso</th></tr></thead>
            <tbody>
              {incidents.map(i => {
                const durationMin = i.endedAt ? Math.round((new Date(i.endedAt).getTime() - new Date(i.startedAt).getTime()) / 60000) : null;
                return (
                  <tr key={i.id}>
                    <td>{i.scenarioTitle}</td>
                    <td>{new Date(i.startedAt).toLocaleString('pt-BR')}</td>
                    <td>{durationMin !== null ? `${durationMin} min` : <span className="badge warn">em andamento</span>}</td>
                    <td>{i.completedSteps}/{i.totalSteps}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
