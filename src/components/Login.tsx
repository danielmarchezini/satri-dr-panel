import { useState } from 'react';
import type { DeviceCodeResponse } from '../global';

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const d = await window.drPanel.auth.startLogin();
      setDevice(d);
      poll(d);
    } catch (e: any) {
      setError(e.message || 'Erro ao iniciar login');
    } finally {
      setLoading(false);
    }
  };

  const poll = (d: DeviceCodeResponse) => {
    const intervalMs = (d.interval || 5) * 1000;
    const timer = setInterval(async () => {
      const result = await window.drPanel.auth.pollLogin(d.device_code);
      if (result.status === 'ok') {
        clearInterval(timer);
        onLoggedIn();
      } else if (result.status === 'error') {
        clearInterval(timer);
        setError(result.message || 'Login falhou ou expirou');
        setDevice(null);
      }
    }, intervalMs);
  };

  return (
    <div className="center-screen">
      <h1>SATRI DR Panel</h1>
      {!device && (
        <>
          <p style={{ color: 'var(--muted)' }}>Entre com sua conta do GitHub pra continuar</p>
          <button onClick={startLogin} disabled={loading}>
            {loading ? 'Iniciando...' : 'Entrar com GitHub'}
          </button>
        </>
      )}
      {device && (
        <>
          <p>Acesse <b>{device.verification_uri}</b> e digite o código:</p>
          <div className="code-box">{device.user_code}</div>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aguardando você autorizar no navegador...</p>
        </>
      )}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
