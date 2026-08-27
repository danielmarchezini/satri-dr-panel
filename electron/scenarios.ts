// Cenários do runbook (docs/DISASTER_RECOVERY.md, seção 4) como checklist
// de passos -- mesma lógica, só que marcável em vez de só texto corrido.

export interface Scenario {
  id: string;
  title: string;
  steps: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'A',
    title: 'Cenário A — Perda parcial (DELETE acidental, migration ruim)',
    steps: [
      'Identificar o escopo exato do dano (quais tabelas/linhas foram afetadas)',
      'Se possível, usar PITR (Point-in-Time Recovery) do Supabase pra restaurar só até antes do incidente',
      'Se não houver PITR disponível, restaurar o dump mais recente num projeto temporário e extrair só os dados perdidos',
      'Reaplicar os dados extraídos no banco de produção com cuidado (evitar duplicar o que já existe)',
      'Validar integridade referencial (foreign keys, triggers) depois do reparo',
      'Documentar causa raiz pra evitar recorrência',
    ],
  },
  {
    id: 'B',
    title: 'Cenário B — Banco de produção corrompido/indisponível',
    steps: [
      'Criar novo projeto Supabase (mesma região, mesmo plano)',
      'Aplicar migrations: supabase db push',
      'Restaurar o dump mais recente: pg_restore --no-owner --no-acl --clean --if-exists',
      'Reaplicar policies/funções via migrations se não vieram completas',
      'Reconfigurar pg_cron a partir do CSV exportado junto do backup',
      'Atualizar env vars no Vercel (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, secrets de edge functions)',
      'Redeploy: vercel --prod + supabase functions deploy --project-ref [NOVO-REF]',
      'Validar fluxos críticos: login, feed, upload, IA',
      'Se logins falharem após restore: forçar reset de senha em massa via Supabase Admin API',
      'Comunicar usuários',
    ],
  },
  {
    id: 'C',
    title: 'Cenário C — Perda de arquivos no R2',
    steps: [
      'Verificar versionamento do bucket -- se ativo, restaurar versão anterior via console R2 ou aws s3api',
      'Se versionamento expirou, restaurar do bucket espelho offsite',
      'Validar integridade comparando etag com registros do banco',
    ],
  },
  {
    id: 'D',
    title: 'Cenário D — Perda do repositório Git',
    steps: [
      'Clonar do espelho secundário (se configurado)',
      'Senão, usar clone local de qualquer dev (todo clone é backup completo)',
      'Restaurar secrets do cofre criptografado (Bitwarden)',
      'Redeploy: vercel --prod + supabase functions deploy',
    ],
  },
  {
    id: 'E',
    title: 'Cenário E — DR completo (banco + storage simultâneo)',
    steps: [
      'Acionar comunicação institucional em até 1h após o incidente declarado',
      'Dividir em dois operadores: um executa o Cenário B (banco), outro o Cenário C (storage), em paralelo',
      'Sincronizar os dois antes de liberar o sistema pros usuários',
      'RTO alvo: 8h -- monitorar o tempo decorrido',
      'Pós-incidente: registrar linha do tempo completa e causa raiz',
    ],
  },
];
