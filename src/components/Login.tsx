import { useRef, useState } from 'react';
import type { DeviceCodeResponse } from '../global';

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  // Timeout agendado e horário de expiração do código -- o timer sempre é
  // recriado a partir da resposta anterior (respeitando "slow_down" do
  // GitHub), nunca em ritmo fixo. Isso evita a espiral de slow_down que
  // nunca termina.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiresAtRef = useRef(0);

  const clearScheduled = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  // Faz uma checagem e, se ainda estiver pendente, agenda a próxima --
  // nunca duas em voo ao mesmo tempo, porque só agenda depois que a
  // anterior terminou.
  const checkAndReschedule = async (deviceCode: string, fallbackDelaySec: number) => {
    if (Date.now() > expiresAtRef.current) {
      setError('Código expirou. Clique em "Entrar com GitHub" de novo.');
      setDevice(null);
      return;
    }
    const result = await window.drPanel.auth
      .pollLogin(deviceCode)
      .catch((e) => ({ status: 'error' as const, message: String(e?.message || e) }));

    if (result.status === 'ok') {
      onLoggedIn();
      return;
    }
    if (result.status === 'error') {
      setError(result.message || 'Login falhou ou expirou');
      setDevice(null);
      return;
    }
    const nextDelay = result.nextIntervalSec || fallbackDelaySec;
    timeoutRef.current = setTimeout(() => checkAndReschedule(deviceCode, nextDelay), nextDelay * 1000);
  };

  const startLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const d = await window.drPanel.auth.startLogin();
      setDevice(d);
      expiresAtRef.current = Date.now() + d.expires_in * 1000;
      const delay = d.interval || 5;
      timeoutRef.current = setTimeout(() => checkAndReschedule(d.device_code, delay), delay * 1000);
    } catch (e: any) {
      setError(e.message || 'Erro ao iniciar login');
    } finally {
      setLoading(false);
    }
  };

  const checkNow = async () => {
    if (!device) return;
    clearScheduled(); // cancela a próxima checagem automática pra não duplicar
    setChecking(true);
    await checkAndReschedule(device.device_code, 5);
    setChecking(false);
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
          <button className="secondary" onClick={checkNow} disabled={checking}>
            {checking ? 'Verificando...' : 'Já autorizei, verificar agora'}
          </button>
        </>
      )}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
