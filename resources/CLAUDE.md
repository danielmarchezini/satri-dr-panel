# Protocolo de Desenvolvimento — Intranet SATRI

Este projeto é um SaaS multi-tenant desenvolvido majoritariamente por IA. Já tivemos regressões reais por causa disso (uma mudança em RLS de um módulo quebrando aprovação em outro, `has_permission()` vazando dado entre empresas porque não conhece multi-tenancy, etc.) — este documento existe pra reduzir esse risco, não é burocracia por burocracia.

## Antes de alterar código

Para qualquer alteração que não seja trivial e isolada (um texto, um estilo, um bug de UI local), pare e mapeie o impacto antes de editar:

1. **Qual módulo principal é afetado?** Consulte `docs/ARCHITECTURE.md` — ele lista os módulos reais do sistema e o que cada um depende/impacta.
2. **A alteração toca algum mecanismo transversal?** (`company_modules`, `points_enabled`, `has_permission()`, RLS, segmentação `is_global`/`target_business_units`, upload com prefixo `company_id`) Esses são os pontos que mais já causaram bug silencioso em módulo nenhuma relação aparente. Ver seção "Mecanismos transversais" em `docs/ARCHITECTURE.md`.
3. **Quais outros módulos usam a mesma tabela/RPC/contexto?** Fazer uma busca real no código (grep), não confiar de memória.
4. Se a alteração for em RLS, `has_permission`, segmentação ou qualquer coisa que decide "quem vê o quê" — **mostrar a análise antes de aplicar contra o banco**, esperar confirmação.

Alterações pequenas e óbvias (ajuste de estilo, texto, bug isolado numa tela) não precisam desse ritual — use bom senso, não transforme isso em burocracia para tudo.

## Regras específicas deste projeto (aprendidas com bugs reais)

- **Nunca** `auth.uid() IS NULL → EXCEPTION` dentro de função `SECURITY DEFINER` — quebra cron jobs e edge functions silenciosamente (eles rodam sem sessão de usuário).
- **RLS**: sempre comparar as 4 políticas (SELECT/INSERT/UPDATE/DELETE) lado a lado. INSERT protegido não significa UPDATE/DELETE protegidos — já achamos tabelas assim.
- **`has_permission(user_id, module, action)`** não sabe de multi-tenancy sozinho — sempre checar se a policy também compara `company_id`, senão vaza dado entre empresas.
- **Segmentação de conteúdo** (cursos, quizzes, eventos): usa `is_global` / `target_business_units` (array de UUID como `text[]`) / `target_management_groups`. Comparação com `business_unit_id` (uuid) exige cast: `p.business_unit_id::text = ANY(c.target_business_units::text[])` — já foi bug de tipo antes.
- **Uploads**: dois gates independentes precisam do path começar com `company_id` — RLS de `storage.objects` E a checagem própria do edge function `upload-to-r2` (`isAuthorizedObjectPath`). Os dois, não só um.
- **Gamificação**: `points_enabled` (em `company_settings`) é a fonte de verdade de "módulo Gamificação ligado/desligado" — quando desligado, TODA UI de pontos/XP/moedas/badges/nível deve sumir, não só o menu.
- **Módulos por empresa**: `company_modules` + `ModulesContext.isModuleEnabled()` — não é a mesma coisa que `points_enabled`, são dois sistemas de toggle diferentes que coexistem.

## Deploy

Nunca fazer deploy direto em produção. Fluxo padrão: `git push origin develop` já publica staging sozinho (Vercel + GitHub Actions), testar lá, só promover pra `main` quando confirmado. Ver `docs/DISASTER_RECOVERY.md` pra cenários de restore.

## Manutenção deste documento e do ARCHITECTURE.md

Quando uma alteração relevante mudar a arquitetura (novo módulo, novo mecanismo transversal, novo padrão descoberto), atualizar `docs/ARCHITECTURE.md` no mesmo commit. Não deixar acumular — documentação desatualizada é pior que não ter documentação, porque engana.
