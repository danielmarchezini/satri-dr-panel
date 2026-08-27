import { useEffect, useState } from 'react';
import type { Task } from '../global';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    window.drPanel.tasks.list().then(setTasks);
  }, []);

  const add = async () => {
    if (!newTitle.trim()) return;
    const next = await window.drPanel.tasks.add(newTitle.trim());
    setTasks(next);
    setNewTitle('');
  };

  const toggle = async (id: string) => setTasks(await window.drPanel.tasks.toggle(id));
  const remove = async (id: string) => setTasks(await window.drPanel.tasks.remove(id));

  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  return (
    <div>
      <h2>Tarefas / pendências de DR</h2>

      <div className="card">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Nova pendência..."
          />
          <button onClick={add}>Adicionar</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Pendentes ({pending.length})</h3>
        {pending.length === 0 && <p style={{ color: 'var(--muted)' }}>Nada pendente 🎉</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{ width: 18, height: 18 }} />
              <span style={{ flex: 1 }}>{t.title}</span>
              <button className="secondary" onClick={() => remove(t.id)}>Remover</button>
            </div>
          ))}
        </div>
      </div>

      {done.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Concluídas ({done.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {done.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{ width: 18, height: 18 }} />
                <span style={{ flex: 1, textDecoration: 'line-through', color: 'var(--muted)' }}>{t.title}</span>
                <button className="secondary" onClick={() => remove(t.id)}>Remover</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
