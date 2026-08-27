import { useEffect, useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Actions from './components/Actions';
import StorageConfig from './components/StorageConfig';
import Runbook from './components/Runbook';

type Tab = 'dashboard' | 'actions' | 'storage' | 'runbook';

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    window.drPanel.auth.isLoggedIn().then(setLoggedIn);
  }, []);

  if (loggedIn === null) return null;
  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div className="app">
      <div className="sidebar">
        <h1>SATRI DR Panel</h1>
        <div className={`nav-item ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          📊 Saúde dos backups
        </div>
        <div className={`nav-item ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>
          ⚡ Ações
        </div>
        <div className={`nav-item ${tab === 'storage' ? 'active' : ''}`} onClick={() => setTab('storage')}>
          🗄️ Armazenamento
        </div>
        <div className={`nav-item ${tab === 'runbook' ? 'active' : ''}`} onClick={() => setTab('runbook')}>
          📖 Runbook
        </div>
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
        {tab === 'actions' && <Actions />}
        {tab === 'storage' && <StorageConfig />}
        {tab === 'runbook' && <Runbook />}
      </div>
    </div>
  );
}
