import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Guarda credenciais (token GitHub, chaves R2/B2) criptografadas com a API
// nativa do SO (DPAPI no Windows) via safeStorage do Electron -- nunca em
// texto puro no disco, e nunca commitadas em lugar nenhum.
export interface StoredSecrets {
  githubToken?: string;
  r2?: { accessKey: string; secretKey: string; endpoint: string; bucket: string };
  b2?: { accessKey: string; secretKey: string; endpoint: string; bucket: string };
  githubRepo?: string; // ex: danielmarchezini/intranetsatri
}

function filePath() {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'secrets.enc');
}

export function loadSecrets(): StoredSecrets {
  const path = filePath();
  if (!existsSync(path)) return {};
  try {
    const encrypted = readFileSync(path);
    const json = safeStorage.decryptString(encrypted);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function saveSecrets(secrets: StoredSecrets) {
  const json = JSON.stringify(secrets);
  const encrypted = safeStorage.encryptString(json);
  writeFileSync(filePath(), encrypted);
}

export function updateSecrets(patch: Partial<StoredSecrets>) {
  const current = loadSecrets();
  const next = { ...current, ...patch };
  saveSecrets(next);
  return next;
}

export function clearSecrets() {
  saveSecrets({});
}
