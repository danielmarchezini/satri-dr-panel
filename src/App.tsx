import { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Actions from './components/Actions';
import Deploys from './components/Deploys';
import StorageConfig from './components/StorageConfig';
import MarkdownDoc from './components/MarkdownDoc';
import Checklist from './components/Checklist';
import Tasks from './components/Tasks';
import Contacts from './components/Contacts';
import Health from './components/Health';

type Tab = 'dashboard' | 'health' | 'deploys' | 'actions' | 'storage' | 'runbook' | 'architecture' | 'protocol' | 'checklist' | 'tasks' | 'contacts';

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    window.drPanel.auth.isLoggedIn().then(setLoggedIn);
  }, []);

  if (loggedIn === null) return null;
  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;

  const items: { id: Tab; icon: string; label: string }[] = [
    { id: 'dashboard', icon: '📊', label: 'Saúde dos backups' },
    { id: 'health', icon: '💚', label: 'Saúde do Supabase' },
    { id: 'deploys', icon: '🚀', label: 'Deploys' },
    { id: 'actions', icon: '⚡', label: 'Ações' },
    { id: 'checklist', icon: '✅', label: 'Checklist / Incidente' },
    { id: 'tasks', icon: '📋', label: 'Tarefas' },
    { id: 'contacts', icon: '📞', label: 'Contatos' },
    { id: 'storage', icon: '🗄️', label: 'Armazenamento' },
    { id: 'architecture', icon: '🗺️', label: 'Arquitetura' },
    { id: 'protocol', icon: '🧭', label: 'Protocolo (CLAUDE.md)' },
    { id: 'runbook', icon: '📖', label: 'Runbook' },
  ];

  return (
    <div className="app">
      <div className="sidebar">
        <h1>SATRI DR Panel</h1>
        {items.map(item => (
          <div key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
            {item.icon} {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div
          className="nav-item"
          onClick={async () => {
            await window.drPanel.auth.logout();
            setLoggedIn(false);
          }}
        >
          🚪 Sair
        </div>
      </div>
      <div className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'health' && <Health />}
        {tab === 'deploys' && <Deploys />}
        {tab === 'actions' && <Actions />}
        {tab === 'checklist' && <Checklist />}
        {tab === 'tasks' && <Tasks />}
        {tab === 'contacts' && <Contacts />}
        {tab === 'storage' && <StorageConfig />}
        {tab === 'architecture' && <MarkdownDoc title="Mapa de Arquitetura" file="ARCHITECTURE.md" />}
        {tab === 'protocol' && <MarkdownDoc title="Protocolo de Desenvolvimento (CLAUDE.md)" file="CLAUDE.md" />}
        {tab === 'runbook' && <MarkdownDoc title="Runbook de Disaster Recovery" file="DISASTER_RECOVERY.md" />}
      </div>
    </div>
  );
}
