import { useEffect, useState } from 'react';
import type { StorageCreds } from '../global';

function ProviderForm({ label, provider }: { label: string; provider: 'r2' | 'b2' }) {
  const [creds, setCreds] = useState<StorageCreds>({ accessKey: '', secretKey: '', endpoint: '', bucket: '' });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await window.drPanel.storage.setCreds(provider, creds);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{label}</h3>
      <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
        <div>
          <div className="stat-label">Access Key</div>
          <input value={creds.accessKey} onChange={e => setCreds({ ...creds, accessKey: e.target.value })} type="password" />
        </div>
        <div>
          <div className="stat-label">Secret Key</div>
          <input value={creds.secretKey} onChange={e => setCreds({ ...creds, secretKey: e.target.value })} type="password" />
        </div>
        <div>
          <div className="stat-label">Endpoint</div>
          <input value={creds.endpoint} onChange={e => setCreds({ ...creds, endpoint: e.target.value })} placeholder="https://..." />
        </div>
        <div>
          <div className="stat-label">Bucket</div>
          <input value={creds.bucket} onChange={e => setCreds({ ...creds, bucket: e.target.value })} />
        </div>
      </div>
      <button onClick={save} disabled={saving} style={{ marginTop: 14 }}>
        {saving ? 'Salvando...' : saved ? '✓ Salvo' : 'Salvar (só leitura, fica só nesta máquina)'}
      </button>
    </div>
  );
}

export default function StorageConfig() {
  const [status, setStatus] = useState<{ r2: boolean; b2: boolean } | null>(null);

  useEffect(() => {
    window.drPanel.storage.getCredsStatus().then(setStatus);
  }, []);

  return (
    <div>
      <h2>Armazenamento</h2>
      <p style={{ color: 'var(--muted)' }}>
        Cole aqui uma chave de <b>leitura</b> (não precisa poder apagar nada) do bucket de backup em cada provedor.
        Fica criptografado só nesta máquina, nunca sai daqui.
      </p>
      <ProviderForm label={`Cloudflare R2 ${status?.r2 ? '✓ configurado' : ''}`} provider="r2" />
      <ProviderForm label={`Backblaze B2 ${status?.b2 ? '✓ configurado' : ''}`} provider="b2" />
    </div>
  );
}
