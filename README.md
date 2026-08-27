# SATRI DR Panel

App local (Electron) pra acompanhar e disparar o backup/restore do banco da Intranet SATRI, sem precisar entrar no GitHub Actions manualmente.

## O que faz

- **Saúde dos backups**: última cópia de staging e produção, em cada provedor (Cloudflare R2 e Backblaze B2), com alerta se estiver atrasada.
- **Ações**: botões pra rodar o backup semanal ou o teste de restore agora, fora do cron normal.
- **Armazenamento**: configura as chaves de leitura do R2/B2 e mostra quanto espaço está sendo usado.
- **Runbook**: o passo a passo de disaster recovery, direto no app.

Todas as credenciais (token do GitHub, chaves de storage) ficam criptografadas só nesta máquina (via `safeStorage` do Electron, que usa o DPAPI do Windows) — nunca são commitadas nem saem daqui.

## Primeira configuração

1. Copie `.env.example` para `.env` e preencha `SATRI_DR_PANEL_GITHUB_CLIENT_ID` (Client ID de um GitHub OAuth App com "Enable Device Flow" ativado).
2. `npm install`
3. `npm run electron:dev`
4. Na primeira tela, clique em "Entrar com GitHub" e siga o código mostrado.
5. Na aba "Armazenamento", cole as chaves de leitura do R2 e do Backblaze B2.

## Build (gerar instalador .exe)

```bash
npm run build
```

Gera o instalador em `release/`.
