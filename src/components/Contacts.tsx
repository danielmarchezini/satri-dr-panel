import { useEffect, useState } from 'react';
import type { Contact } from '../global';

const EMPTY: Contact = { id: '', name: '', role: '', phone: '', email: '' };

export default function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<Contact>(EMPTY);

  useEffect(() => {
    window.drPanel.contacts.list().then(setContacts);
  }, []);

  const save = async () => {
    if (!form.name.trim()) return;
    const next = await window.drPanel.contacts.save(form);
    setContacts(next);
    setForm(EMPTY);
  };

  const remove = async (id: string) => setContacts(await window.drPanel.contacts.remove(id));

  return (
    <div>
      <h2>Contatos críticos</h2>
      <p style={{ color: 'var(--muted)' }}>Quem acionar num incidente — mesma lista da seção 7 do runbook, só que editável aqui.</p>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 600 }}>
          <div>
            <div className="stat-label">Nome</div>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <div className="stat-label">Papel</div>
            <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Ex: Responsável técnico" />
          </div>
          <div>
            <div className="stat-label">Telefone</div>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <div className="stat-label">E-mail</div>
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <button onClick={save} style={{ marginTop: 14 }}>Salvar contato</button>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Nome</th><th>Papel</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.role}</td>
                <td>{c.phone && <a href={`tel:${c.phone}`} style={{ color: 'var(--accent)' }}>{c.phone}</a>}</td>
                <td>{c.email && <a href={`mailto:${c.email}`} style={{ color: 'var(--accent)' }}>{c.email}</a>}</td>
                <td><button className="secondary" onClick={() => remove(c.id)}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
