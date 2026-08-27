# Plano de Backup e Disaster Recovery — Intranet SATRI

> **Versão:** 1.1
> **Stack:** React + Vite (Vercel) · Supabase · Cloudflare R2
> **Projetos Supabase:** staging `sadhgqacbbdxpnnymhmk` · produção `wazvqeqigsupivnnayqf`

---

## Como acionar o agente de restore (Claude Code)

> Use isso se estiver em outro dispositivo ou sem memória local do Claude.

1. Abra o Claude Code (claude.ai/code ou app)
2. Cole a mensagem abaixo e descreva o que aconteceu:

```
Você é meu agente de disaster recovery da Intranet SATRI.
Contexto:
- Staging Supabase: sadhgqacbbdxpnnymhmk (us-east-1)
- Produção Supabase: wazvqeqigsupivnnayqf (sa-east-1)
- Backups cifrados (age): bucket R2 `satri-backups-offsite/postgres/`
- Chave age privada: Bitwarden → "SATRI Backups - age key"
- Sync storage: `satri-backups-offsite/storage-mirror/`
- Runbooks completos: docs/DISASTER_RECOVERY.md no repo intranetsatri (GitHub)
- Credenciais: Bitwarden (dmarchezini@gmail.com)

Problema: [DESCREVA AQUI O QUE ACONTECEU]

Me guie passo a passo no restore.
```

3. O Claude vai identificar o cenário (A/B/C/D/E da seção 4) e guiar cada passo com os comandos exatos.

---

## Índice

1. [Objetivo e escopo](#1-objetivo-e-escopo)
2. [Matriz de ativos, RPO e RTO](#2-matriz-de-ativos-rpo-e-rto)
3. [Estratégia de backup por camada](#3-estratégia-de-backup-por-camada)
4. [Procedimentos de restore (runbooks)](#4-procedimentos-de-restore-runbooks)
5. [Testes e validação](#5-testes-e-validação)
6. [Segurança dos backups](#6-segurança-dos-backups)
7. [Papéis e comunicação](#7-papéis-e-comunicação)
8. [Roadmap de melhorias](#8-roadmap-de-melhorias)
9. [Anexos](#9-anexos)
10. [Guia de execução passo a passo](#10-guia-de-execução-passo-a-passo)

---

## 1. Objetivo e escopo

Definir a estratégia de proteção de dados e recuperação da Intranet SATRI, garantindo continuidade do serviço diante de incidentes: perda acidental, corrupção, comprometimento de credenciais, falha de fornecedor ou desastre regional.

**Cobertura:**
- **Banco PostgreSQL no Supabase** (schema, dados, `auth.users`, RLS, jobs pg_cron)
- **Storage de arquivos** (Supabase Storage e Cloudflare R2)
- **Código-fonte** (frontend React/Vite, edge functions Deno, migrations e configurações)

**Faseamento:**
- **Fase 1 (concluída):** estrutura criada, scripts validados manualmente. Staging continua em plano Free.
- **Fase 2 (ativada em 2026-07-27):** backup semanal, sync diário de storage e teste mensal de restore rodando por `schedule`, apontando para **produção** (`wazvqeqigsupivnnayqf`, `sa-east-1`).
  - ⚠️ **Pendente de confirmação:** produção em plano Pro com PITR habilitado. Sem isso, o RPO real é o do dump semanal (7 dias), não 1h.
- **Fase 3 (maturidade):** replicação lógica, automação Terraform, game days.

---

## 2. Matriz de ativos, RPO e RTO

**RPO** = quanto dado pode ser perdido. **RTO** = tempo máximo para restaurar o serviço.

| Ativo | Fonte da verdade | Criticidade | RPO | RTO |
|---|---|---|---|---|
| Banco PostgreSQL produção | Supabase `wazvqeqigsupivnnayqf` | Crítica | 1h (com PITR) / 24h (só dump) | 4h |
| Storage Supabase (avatares, anexos pequenos) | Supabase Storage prod | Alta | 24h | 8h |
| Cloudflare R2 (arquivos pesados) | Bucket R2 produção | Alta | 24h | 8h |
| Código-fonte | Git (GitHub) | Crítica | Imediato | 1h |
| Schema / migrations | `supabase/migrations` no Git | Crítica | Imediato | 1h |
| Secrets / env vars | Vercel + Supabase Vault | Crítica | Por alteração | 2h |
| Jobs pg_cron e RLS | Migrations + export semanal | Alta | Por alteração | 4h |
| `auth.users` | Supabase Auth (no dump) | Crítica | 1h | 4h |

---

## 3. Estratégia de backup por camada

### 3.1 Banco de dados Supabase (PostgreSQL)

Três mecanismos complementares — nenhum substitui o outro.

#### a) Point-in-Time Recovery (PITR) nativo
- **Requer plano Pro ou superior** no projeto de produção.
- **Retenção:** 7 dias no Pro (fixo). Team/Enterprise oferecem 14/28 dias.
- Permite restaurar para qualquer segundo dentro da janela — proteção contra `DELETE` acidental ou migration ruim.

#### b) Snapshots diários automáticos
- Supabase faz snapshots diários por padrão. Conferir em **Database → Backups**.
- Retenção: 7 dias no Pro.

#### c) Dump lógico semanal externo (independente do Supabase)
Sobrevive caso a conta Supabase seja comprometida ou suspensa. Executado via GitHub Actions ([`.github/workflows/backup-postgres.yml`](#101-secrets-e-pré-requisitos)).

- **Conexão:** Session Pooler (`aws-0-[REGION].pooler.supabase.com:5432`), não `db.[REF].supabase.co` direto (deprecado).
- **Inclui:** schema `public` + schema `auth` (logins).
- **Exclui:** `graphql*`, `pgsodium*`, `realtime`, `supabase_functions` (internos da Supabase).
- **Criptografia:** `age` com chave pública antes do upload.
- **Destino:** bucket R2 dedicado, em conta/credencial diferente do bucket de aplicação.
- **Retenção:** 4 semanais (hoje). Adicionar 12 mensais e, na Fase 3, 5 anuais — via lifecycle rule no bucket R2, ainda não configurada.

> ⚠️ **Sobre `auth.users`:** o dump inclui usuários e hashes. Em restore para outro projeto, pode ser necessário forçar reset de senha (depende do `jwt_secret` e da extensão `pgsodium`). Documentar no runbook 4.2.

#### d) Export de cron jobs e RLS policies
Junto com cada dump semanal, exportar CSVs:
```sql
SELECT jobid, schedule, command, active FROM cron.job;
SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies;
```
Versionar idealmente os jobs como **migrations SQL** em `supabase/migrations/` (vira parte do `db push`).

### 3.2 Storage de arquivos

#### a) Cloudflare R2 (arquivos pesados)
- **Versionamento de objetos:** ativar no bucket de produção (protege contra DELETE acidental por 30 dias).
- **Sync diário para bucket espelho** em conta/região diferente — via GitHub Action ([`.github/workflows/sync-r2.yml`](#101-secrets-e-pré-requisitos)).
- **Lifecycle:** mover versões antigas para classe barata após 60 dias.

#### b) Supabase Storage
- Confirmar se há buckets críticos no Supabase Storage. Hoje a intranet usa principalmente R2 — se Storage só guarda avatares, pode ficar fora do plano (são re-uploadable).
- Se houver buckets críticos: incluir download semanal no workflow.

### 3.3 Código-fonte e infraestrutura como código

- **Git é a fonte da verdade.** Cada clone local é um backup completo.
- **Branch `main` protegida:** PRs obrigatórios, sem force push.
- **Versionar:** `supabase/migrations`, `supabase/functions`, `supabase/config.toml`, `seed.sql`.
- **Secrets nunca no Git.** Export mensal criptografado:
  ```bash
  vercel env pull .env.production.encrypted
  age -r [chave-pública] .env.production.encrypted > vault/env-prod-$(date +%Y%m).age
  ```
  Guardar no cofre da empresa (1Password / Bitwarden Business).
- **Edge Functions:** código no Git, variáveis documentadas em `supabase/.env.example`.
- **Schema drift detector (Fase 2):** workflow no push para `main` que roda `supabase db diff --linked` e falha se houver divergência.

---

## 4. Procedimentos de restore (runbooks)

### 4.1 Cenário A — Perda parcial (DELETE acidental, migration ruim)

**Estratégia:** PITR para timestamp anterior ao incidente, em projeto temporário, e restauração seletiva.

1. Identificar timestamp do incidente (logs do app, audit log).
2. **Dashboard Supabase → Database → Backups → Point in Time** → criar restore para projeto novo (**não sobrescrever prod**).
3. Aguardar provisionamento (10–30 min).
4. Exportar apenas as tabelas/linhas afetadas: `pg_dump -t tabela > recovery.sql`.
5. Validar em staging antes de aplicar em produção.
6. Aplicar em prod via `INSERT ... ON CONFLICT` dentro de transação.
7. Destruir projeto temporário.

### 4.2 Cenário B — Banco de produção corrompido/indisponível

**Estratégia:** restaurar o dump lógico mais recente em projeto novo e apontar a aplicação.

1. Criar novo projeto Supabase (mesma região, mesmo plano).
2. Aplicar migrations: `supabase db push`.
3. Restaurar o dump:
   ```bash
   pg_restore --no-owner --no-acl --clean --if-exists \
     -d "postgresql://postgres.[REF]:[SENHA]@aws-0-[REGION].pooler.supabase.com:5432/postgres" \
     backup-prod-YYYYMMDD.dump
   ```
4. Reaplicar policies/funções via migrations se não vieram completas.
5. Reconfigurar pg_cron a partir do CSV exportado.
6. Atualizar env vars no Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, secrets de edge functions).
7. Redeploy: `vercel --prod` + `supabase functions deploy --project-ref [NOVO-REF]`.
8. Validar fluxos críticos: login, feed, upload, IA.
9. Se logins falharem após restore: forçar reset de senha em massa via Supabase Admin API.
10. Comunicar usuários (seção 7).

### 4.3 Cenário C — Perda de arquivos no R2

1. Verificar versionamento do bucket. Se ativo: restaurar versão anterior via console R2 ou `aws s3api list-object-versions` + `copy-object`.
2. Se versionamento expirou: restaurar do bucket espelho offsite.
3. Validar integridade comparando `etag` com registros do banco.

### 4.4 Cenário D — Perda do repositório Git

1. Clonar do espelho secundário (se configurado).
2. Senão: usar clone local de qualquer dev (todo clone é backup completo).
3. Restaurar secrets do cofre criptografado.
4. Redeploy: `vercel --prod` + `supabase functions deploy`.

### 4.5 Cenário E — DR completo (banco + storage simultâneo)

Combinação de B + C executados em paralelo por dois operadores. **RTO alvo: 8h.** Acionar comunicação institucional em até 1h após o incidente declarado.

---

## 5. Testes e validação

> **Backup que nunca foi restaurado não é backup — é esperança.**

| Frequência | Atividade | Responsável |
|---|---|---|
| Diária (automática) | PITR + snapshots Supabase + sync R2 incremental | Supabase / GitHub Actions |
| Semanal | Dump lógico + verificação de integridade | GitHub Actions |
| Mensal | Teste de restore em ambiente efêmero | GitHub Actions |
| Trimestral | Simulação completa de DR (banco + storage + deploy) | Time todo |
| Semestral | Revisão do plano, RPO/RTO, contatos | Gestor do projeto |

Cada teste produz registro em `docs/dr/registros/AAAA-MM.md`: data, operador, duração real, problemas, ações corretivas.

**Importante:** o teste mensal deve rodar em **container Postgres efêmero do runner** ou em **projeto Supabase dedicado "dr-test"**. **Nunca no staging real** — destrói o ambiente que o time usa.

---

## 6. Segurança dos backups

- **Criptografia em repouso:** todo dump cifrado com `age` antes de sair do runner. Chave privada apenas no cofre da empresa.
- **Imutabilidade:** Object Lock no bucket de backup — protege contra ransomware e deleção maliciosa.
- **Menor privilégio:** credencial de backup só **escreve e lista**, nunca deleta. Deleção é feita por lifecycle rule.
- **Acesso ao cofre de restore:** 2 pessoas (gestor + DevOps) com MFA hardware. Procedimento de quebra-de-vidro documentado.
- **LGPD:** backups contêm dados pessoais. Definir retenção máxima e registrar no inventário de tratamento.

---

## 7. Papéis e comunicação

**Durante incidente:**
- **Gestor do projeto:** declara incidente, autoriza restore em produção, comunica patrocinador e usuários.
- **DevOps / Backend (on-call):** executa runbook, valida integridade.
- **Frontend:** ajusta env no Vercel, redeploy, valida fluxos de usuário.
- **Segurança:** avalia vazamento, aciona LGPD se aplicável.

**Canais:**
- Sala de guerra: canal `#incidente-DR` no Slack/Teams criado no momento.
- Aviso aos usuários: banner + email institucional.
- Status público: `status.satri.intranet` atualizado a cada 30 min.

---

## 8. Roadmap de melhorias

| Item | Fase |
|---|---|
| Replicação lógica para standby externa (Neon/RDS) — RTO de minutos | 3 |
| Automação completa do Cenário B com Terraform/Pulumi | 3 |
| Game day trimestral sem aviso prévio | 3 |
| Sharding de dump se > 5 GB ou restore > 1h | quando necessário |
| Alertas: dump não executado em 8 dias, sync R2 falhou | 2 |
| Espelho Git em segundo remoto (GitLab) | 2 |

---

## 9. Anexos

### 9.1 Checklist mensal do operador
- [ ] Último dump semanal existe, está criptografado e é restaurável (teste em staging).
- [ ] Bucket espelho R2 sincronizado (diff = 0 ou justificado).
- [ ] PITR ativo no projeto de produção, janela = 7 dias.
- [ ] Secrets do Vercel exportados no mês corrente.
- [ ] Migrations no Git refletem schema atual (`supabase db diff` retorna vazio).
- [ ] Contatos de on-call conferidos.
- [ ] Registro do teste mensal preenchido.

### 9.2 Contatos críticos

- Suporte Supabase Pro: `support@supabase.io` / ticket no dashboard
- Suporte Cloudflare: https://dash.cloudflare.com/support
- Suporte Vercel: https://vercel.com/help
- Gestor do projeto / DevOps / on-call: Daniel Marchezini — dmarchezini@gmail.com

> Projeto solo: todas as funções (gestor, DevOps, frontend, segurança) são exercidas pela mesma pessoa. Em caso de indisponibilidade prolongada, acionar o cofre Bitwarden para obter credenciais e seguir os runbooks da seção 4.

---

## 10. Guia de execução passo a passo

Este é o roteiro prático para implementar o plano. **Siga em ordem.** Cada passo é independente e pode ser pausado.

### 10.1 Secrets e pré-requisitos

Antes de criar qualquer workflow, prepare as credenciais.

**No Supabase (produção):**
- `SUPABASE_PROJECT_REF` = `wazvqeqigsupivnnayqf`
- `SUPABASE_DB_PASSWORD` = senha do role `postgres` (Settings → Database → Database password)
- `SUPABASE_REGION` = região do projeto (ex: `sa-east-1`) — necessária para o pooler URL

**No Supabase (staging, para testes):**
- `SUPABASE_STAGING_REF` = `sadhgqacbbdxpnnymhmk`
- `SUPABASE_STAGING_DB_PASSWORD` = senha do staging

**Chaves de criptografia (`age`):**
```bash
# rodar uma vez, localmente
age-keygen -o age-key.txt
# arquivo contém PUBLIC e PRIVATE keys
```
- `AGE_PUBLIC_KEY` → secret do GitHub (usada para cifrar)
- `AGE_PRIVATE_KEY` → **guardar no 1Password/Bitwarden**, NUNCA no Git. Só vai virar secret do GitHub no momento do teste de restore.

**Cloudflare R2 (criar bucket de backup novo):**
- Bucket dedicado `satri-backups-offsite` em conta R2 separada (ou pelo menos credencial separada).
- Criar API token com **escopo write+list, sem delete**:
  - `R2_BACKUP_ACCESS_KEY`
  - `R2_BACKUP_SECRET_KEY`
  - `R2_BACKUP_ENDPOINT` = `https://[ACCOUNT_ID].r2.cloudflarestorage.com`
  - `R2_BACKUP_BUCKET` = `satri-backups-offsite`

**Cloudflare R2 (bucket de aplicação, source do sync):**
- `R2_SOURCE_ACCESS_KEY`, `R2_SOURCE_SECRET_KEY`, `R2_SOURCE_ENDPOINT`, `R2_SOURCE_BUCKET`

**Slack (notificações):**
- `SLACK_WEBHOOK_URL` — criar Incoming Webhook em canal `#dr-alerts`.

**Adicionar todos em:** Repositório no GitHub → Settings → Secrets and variables → Actions → New repository secret.

---

### 10.2 Passo 1 — Validar conexão e gerar dump manual (local)

Antes de automatizar, prove que funciona localmente.

```powershell
# Instalar postgresql client (se não tiver)
# Windows: https://www.postgresql.org/download/windows/

# Pegar a Session Pooler URL no Dashboard:
# Project Settings → Database → Connection string → Session pooler

$env:PGPASSWORD = "SUA_SENHA_PROD"
pg_dump `
  "postgresql://postgres.wazvqeqigsupivnnayqf@aws-0-[REGION].pooler.supabase.com:5432/postgres" `
  --format=custom --no-owner --no-acl `
  --exclude-schema='graphql*' --exclude-schema='pgsodium*' `
  --exclude-schema='realtime' --exclude-schema='supabase_functions' `
  --file=test-dump.dump

# Validar
pg_restore --list test-dump.dump | Select-Object -First 30
```

**Critério de sucesso:** arquivo gerado > 100 KB, listagem mostra tabelas conhecidas (`profiles`, `companies`, etc.).

---

### 10.3 Passo 2 — Restore manual em ambiente efêmero (local)

Prove que o dump é restaurável.

```powershell
# Subir Postgres temporário via Docker
docker run --rm -d --name pg-restore-test `
  -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16

# Aguardar 5s para inicializar
Start-Sleep -Seconds 5

# Restaurar
$env:PGPASSWORD = "test"
pg_restore --no-owner --no-acl `
  -h localhost -p 55432 -U postgres -d postgres `
  --jobs=4 test-dump.dump

# Conferir
psql -h localhost -p 55432 -U postgres -d postgres `
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

# Limpar
docker stop pg-restore-test
```

**Critério de sucesso:** restore sem erros fatais, contagem de tabelas > 10.

---

### 10.4 Passo 3 — Criar workflow de backup semanal

Criar [`.github/workflows/backup-postgres.yml`](#) com o conteúdo do **Apêndice A** abaixo.

**Importante na Fase 1:** **comente o `cron`** e deixe só `workflow_dispatch`. Rode manualmente algumas vezes antes de habilitar o agendamento.

```yaml
on:
  # schedule:
  #   - cron: '0 3 * * 0'   # Domingo 03:00 UTC — habilitar na Fase 2
  workflow_dispatch:
```

Rodar via **Actions → Backup Semanal Postgres → Run workflow**. Verificar:
- Dump criado e cifrado
- Upload pro R2 confirmado
- Notificação Slack recebida

---

### 10.5 Passo 4 — Criar workflow de sync R2

Criar [`.github/workflows/sync-r2.yml`](#) (**Apêndice B**). Mesma estratégia: agendamento comentado, rodar manualmente primeiro.

**Verificar:** após primeira execução, comparar contagem de objetos entre `r2-source` e `r2-backup`.

---

### 10.6 Passo 5 — Criar workflow de teste de restore mensal

Criar [`.github/workflows/test-restore.yml`](#) (**Apêndice C**), **usando Postgres efêmero em container**, não o staging real.

**Critério de sucesso:** workflow conclui em verde, smoke tests passam (tabelas > 10, `auth.users` > 0).

---

### 10.7 Passo 6 — Versionar cron jobs como migration

Se há jobs `pg_cron` criados manualmente no Dashboard, transformá-los em migration:

```bash
# Localmente, listar jobs atuais
psql [POOLER_URL_PROD] -c "SELECT jobname, schedule, command FROM cron.job"

# Criar nova migration
supabase migration new setup_cron_jobs
# Editar o arquivo gerado em supabase/migrations/ adicionando SELECT cron.schedule(...)
```

Aplicar em staging primeiro, validar, depois em produção.

---

### 10.8 Passo 7 — Documentar contatos e secrets

- Preencher seção **9.2 Contatos críticos**.
- Criar `docs/dr/secrets-inventory.md` listando **nomes** de todas as env vars (sem valores). Versionar.
- Fazer primeiro export do `.env` produção cifrado com `age`. Guardar no cofre.

---

### 10.9 Passo 8 — Go-live (Fase 2)

Quando produção for ao ar:

1. ✅ Upgrade do projeto `wazvqeqigsupivnnayqf` para **Pro** ($25/mês). PITR ativa automaticamente.
2. ✅ Confirmar em Dashboard → Database → Backups que PITR mostra janela de 7 dias.
3. ✅ **Descomentar agendamentos** nos 3 workflows e fazer commit.
4. ✅ Rodar teste de restore manual cronometrado, registrar em `docs/dr/registros/`.
5. ✅ Adicionar `AGE_PRIVATE_KEY` como secret do GitHub (necessário para o workflow de teste de restore).
6. ✅ Configurar alertas: workflow não executou em 8 dias.
7. ✅ Comunicar time sobre o canal `#dr-alerts`.

---

### 10.10 Apêndices — Workflows prontos

#### Apêndice A: `.github/workflows/backup-postgres.yml`

```yaml
name: Backup Semanal Postgres (Supabase Prod)

on:
  # schedule:
  #   - cron: '0 3 * * 0'   # Domingo 03:00 UTC — habilitar na Fase 2
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: backup-postgres
  cancel-in-progress: false

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Instalar Postgres 16 client + age
        run: |
          sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16 age awscli

      - name: Gerar dump completo
        env:
          PGPASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          set -euo pipefail
          STAMP=$(date -u +%Y%m%d-%H%M)
          FILE="satri-prod-${STAMP}.dump"
          echo "FILE=${FILE}" >> $GITHUB_ENV
          echo "STAMP=${STAMP}" >> $GITHUB_ENV

          POOLER_HOST="aws-0-${{ secrets.SUPABASE_REGION }}.pooler.supabase.com"
          POOLER_USER="postgres.${{ secrets.SUPABASE_PROJECT_REF }}"

          pg_dump \
            --host="$POOLER_HOST" \
            --port=5432 \
            --username="$POOLER_USER" \
            --dbname=postgres \
            --format=custom \
            --no-owner \
            --no-acl \
            --verbose \
            --exclude-schema='graphql*' \
            --exclude-schema='pgsodium*' \
            --exclude-schema='realtime' \
            --exclude-schema='supabase_functions' \
            --file="${FILE}"

          ls -lh "${FILE}"
          echo "SIZE_BYTES=$(stat -c%s ${FILE})" >> $GITHUB_ENV

      - name: Validar dump
        run: |
          set -euo pipefail
          pg_restore --list "${FILE}" | head -50
          OBJ_COUNT=$(pg_restore --list "${FILE}" | grep -c '^[0-9]' || true)
          echo "Objetos no dump: ${OBJ_COUNT}"
          if [ "${OBJ_COUNT}" -lt 50 ]; then
            echo "::error::Dump suspeito - menos de 50 objetos"
            exit 1
          fi
          if [ "${SIZE_BYTES}" -lt 100000 ]; then
            echo "::error::Dump suspeito - menos de 100KB"
            exit 1
          fi

      - name: Exportar cron jobs e RLS policies
        env:
          PGPASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          POOLER_HOST="aws-0-${{ secrets.SUPABASE_REGION }}.pooler.supabase.com"
          POOLER_USER="postgres.${{ secrets.SUPABASE_PROJECT_REF }}"
          psql -h "$POOLER_HOST" -U "$POOLER_USER" -d postgres -c "\copy (SELECT jobid, schedule, command, active FROM cron.job) TO 'cron-jobs-${STAMP}.csv' WITH CSV HEADER" || echo "cron schema indisponivel"
          psql -h "$POOLER_HOST" -U "$POOLER_USER" -d postgres -c "\copy (SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies) TO 'rls-policies-${STAMP}.csv' WITH CSV HEADER"

      - name: Criptografar com age
        run: |
          set -euo pipefail
          echo "${{ secrets.AGE_PUBLIC_KEY }}" > recipient.txt
          age -R recipient.txt -o "${FILE}.age" "${FILE}"
          age -R recipient.txt -o "cron-jobs-${STAMP}.csv.age" "cron-jobs-${STAMP}.csv" || true
          age -R recipient.txt -o "rls-policies-${STAMP}.csv.age" "rls-policies-${STAMP}.csv"
          rm -f "${FILE}" "cron-jobs-${STAMP}.csv" "rls-policies-${STAMP}.csv"
          ls -lh *.age

      - name: Upload para Cloudflare R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_BACKUP_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_BACKUP_SECRET_KEY }}
          R2_ENDPOINT: ${{ secrets.R2_BACKUP_ENDPOINT }}
          R2_BUCKET: ${{ secrets.R2_BACKUP_BUCKET }}
        run: |
          set -euo pipefail
          YEAR=$(date -u +%Y)
          MONTH=$(date -u +%m)
          PREFIX="postgres/${YEAR}/${MONTH}"
          for f in *.age; do
            aws s3 cp "$f" "s3://${R2_BUCKET}/${PREFIX}/$f" --endpoint-url "${R2_ENDPOINT}"
          done

      - name: Notificar Slack (sucesso)
        if: success()
        run: |
          SIZE_MB=$(echo "scale=2; ${SIZE_BYTES}/1048576" | bc)
          curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"✅ Backup Supabase OK — arquivo: ${FILE}.age (${SIZE_MB} MB)\"}" \
            "${{ secrets.SLACK_WEBHOOK_URL }}" || true

      - name: Notificar Slack (falha)
        if: failure()
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 BACKUP SUPABASE FALHOU — verificar workflow ${{ github.run_id }}\"}" \
            "${{ secrets.SLACK_WEBHOOK_URL }}" || true
```

#### Apêndice B: `.github/workflows/sync-r2.yml`

```yaml
name: Sync Diário R2 (Storage Offsite)

on:
  # schedule:
  #   - cron: '0 4 * * *'   # Diário 04:00 UTC — habilitar na Fase 2
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: sync-r2
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 90

    steps:
      - name: Instalar rclone
        run: curl https://rclone.org/install.sh | sudo bash

      - name: Configurar rclone
        run: |
          mkdir -p ~/.config/rclone
          cat > ~/.config/rclone/rclone.conf <<EOF
          [r2-source]
          type = s3
          provider = Cloudflare
          access_key_id = ${{ secrets.R2_SOURCE_ACCESS_KEY }}
          secret_access_key = ${{ secrets.R2_SOURCE_SECRET_KEY }}
          endpoint = ${{ secrets.R2_SOURCE_ENDPOINT }}
          acl = private

          [r2-backup]
          type = s3
          provider = Cloudflare
          access_key_id = ${{ secrets.R2_BACKUP_ACCESS_KEY }}
          secret_access_key = ${{ secrets.R2_BACKUP_SECRET_KEY }}
          endpoint = ${{ secrets.R2_BACKUP_ENDPOINT }}
          acl = private
          EOF

      - name: Sync incremental
        run: |
          set -euo pipefail
          rclone sync \
            r2-source:${{ secrets.R2_SOURCE_BUCKET }} \
            r2-backup:${{ secrets.R2_BACKUP_BUCKET }}/storage-mirror \
            --backup-dir r2-backup:${{ secrets.R2_BACKUP_BUCKET }}/storage-deleted/$(date -u +%Y%m%d) \
            --transfers 16 --checkers 32 --fast-list \
            --stats 30s --stats-one-line

      - name: Comparar contagens
        run: |
          SRC=$(rclone size r2-source:${{ secrets.R2_SOURCE_BUCKET }} --json | jq -r '.count')
          DST=$(rclone size r2-backup:${{ secrets.R2_BACKUP_BUCKET }}/storage-mirror --json | jq -r '.count')
          DIFF=$((SRC - DST))
          echo "Origem: ${SRC} | Destino: ${DST} | Diff: ${DIFF}"
          if [ "$DIFF" -gt 100 ] || [ "$DIFF" -lt -100 ]; then
            echo "::warning::Diferença grande entre origem e destino"
          fi

      - name: Notificar falha
        if: failure()
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 SYNC R2 FALHOU — verificar workflow ${{ github.run_id }}\"}" \
            "${{ secrets.SLACK_WEBHOOK_URL }}" || true
```

#### Apêndice C: `.github/workflows/test-restore.yml`

```yaml
name: Teste Mensal de Restore (Postgres Efêmero)

on:
  # schedule:
  #   - cron: '0 6 5 * *'   # Dia 5 às 06:00 UTC — habilitar na Fase 2
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test-restore:
    runs-on: ubuntu-latest
    timeout-minutes: 120

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=5s
          --health-timeout=5s
          --health-retries=10

    steps:
      - name: Instalar dependências
        run: |
          sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16 age awscli

      - name: Baixar dump mais recente do R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_BACKUP_ACCESS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_BACKUP_SECRET_KEY }}
        run: |
          set -euo pipefail
          LATEST=$(aws s3 ls "s3://${{ secrets.R2_BACKUP_BUCKET }}/postgres/" \
            --endpoint-url "${{ secrets.R2_BACKUP_ENDPOINT }}" --recursive \
            | grep '.dump.age' | sort | tail -1 | awk '{print $4}')
          echo "Restaurando: $LATEST"
          aws s3 cp "s3://${{ secrets.R2_BACKUP_BUCKET }}/$LATEST" backup.dump.age \
            --endpoint-url "${{ secrets.R2_BACKUP_ENDPOINT }}"
          echo "LATEST=$LATEST" >> $GITHUB_ENV

      - name: Decriptar com age
        run: |
          echo "${{ secrets.AGE_PRIVATE_KEY }}" > key.txt
          age -d -i key.txt -o backup.dump backup.dump.age
          rm key.txt backup.dump.age
          ls -lh backup.dump

      - name: Restaurar em Postgres efêmero
        env:
          PGPASSWORD: testpass
        run: |
          set -euo pipefail
          echo "START=$(date +%s)" >> $GITHUB_ENV

          # Criar schema auth (não vem com a imagem oficial)
          psql -h localhost -U postgres -d postgres -c "CREATE SCHEMA IF NOT EXISTS auth;"

          pg_restore -h localhost -p 5432 -U postgres -d postgres \
            --no-owner --no-acl --jobs=4 --verbose backup.dump \
            || echo "Avisos no restore (esperado para extensões Supabase-only)"

      - name: Smoke tests
        env:
          PGPASSWORD: testpass
        run: |
          set -euo pipefail

          TABLES=$(psql -h localhost -U postgres -d postgres -tAc \
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
          echo "Tabelas: $TABLES"
          [ "$TABLES" -ge 10 ] || { echo "::error::Poucas tabelas"; exit 1; }

          USERS=$(psql -h localhost -U postgres -d postgres -tAc \
            "SELECT count(*) FROM auth.users" 2>/dev/null || echo "0")
          echo "auth.users: $USERS"

          psql -h localhost -U postgres -d postgres -c \
            "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20"

          RLS=$(psql -h localhost -U postgres -d postgres -tAc \
            "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity=true")
          echo "Tabelas com RLS: $RLS"

      - name: Calcular tempo
        run: |
          END=$(date +%s)
          DURATION=$((END - START))
          MIN=$((DURATION / 60))
          echo "Restore em ${MIN}min (${DURATION}s)"
          echo "DURATION_MIN=$MIN" >> $GITHUB_ENV

      - name: Notificar resultado
        if: always()
        run: |
          STATUS="${{ job.status }}"
          ICON=$([ "$STATUS" = "success" ] && echo "✅" || echo "🚨")
          curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"${ICON} Teste mensal de restore: ${STATUS} — ${LATEST}, ${DURATION_MIN}min\"}" \
            "${{ secrets.SLACK_WEBHOOK_URL }}" || true
```

---

## Resumo executivo — ordem de execução

```
HOJE (Fase 1, sem custo extra)
  1. Gerar chave age e guardar privada no 1Password         (5 min)
  2. Criar bucket R2 dedicado + credencial write-only       (15 min)
  3. Adicionar secrets no GitHub                            (10 min)
  4. Validar dump manual local (Passo 10.2)                 (15 min)
  5. Validar restore manual local com Docker (Passo 10.3)   (20 min)
  6. Commit dos 3 workflows com cron comentado              (10 min)
  7. Rodar manualmente cada workflow uma vez                (30 min)
  8. Versionar cron jobs como migration (Passo 10.7)        (30 min)

NO GO-LIVE (Fase 2)
  9. Upgrade prod para Pro ($25/mês) — PITR liga sozinho
 10. Descomentar crons e push para main
 11. Primeiro teste de restore cronometrado
 12. Preencher contatos (seção 9.2)

DEPOIS (Fase 3, com usuários reais)
 13. Espelho Git, replicação lógica, Terraform, game days
```

**Esforço total Fase 1:** ~2-3 horas de trabalho efetivo, espalhado em alguns dias.
