# Mapa de Arquitetura — Intranet SATRI

> Última revisão: 2026-08-27. Manter atualizado a cada mudança relevante (ver `CLAUDE.md`). Itens marcados **A CONFIRMAR** não foram auditados a fundo — não tratar como certeza.

## Visão geral

- **Front-end**: React + TypeScript + Vite, hospedado na Vercel. PWA (service worker próprio, `src/sw.ts`).
- **Back-end**: Supabase (Postgres + RLS + Auth + Storage + Edge Functions + `pg_cron`). Sem servidor próprio — toda lógica de negócio roda em RPCs `SECURITY DEFINER` no banco ou em edge functions (`supabase/functions/*`).
- **Multi-tenant**: uma instância só, isolamento por `company_id` em quase toda tabela, garantido (ou deveria ser) via RLS. Empresas podem ser segmentadas internamente por `business_unit_id` / `management_group_id`.
- **Estado do front**: React Context por domínio (`src/contexts/*.tsx`) + React Query pra cache/fetch. Não tem Redux/Zustand.
- **Deploy**: `develop` → staging (auto), `main` → produção (auto, só via promoção manual). Ver seção "Deploy" do `CLAUDE.md`.

## Mecanismos transversais

Estes NÃO são módulos — são mecanismos que atravessam vários módulos ao mesmo tempo. A maioria dos bugs reais que já encontramos veio de mexer nisto sem considerar todo mundo que depende:

| Mecanismo | Onde vive | Quem depende |
|---|---|---|
| `company_modules` + `ModulesContext.isModuleEnabled()` | tabela `company_modules`, `src/contexts/ModulesContext.tsx` | Liga/desliga módulo inteiro por empresa (Eventos, Treinamentos, Gamificação como categoria, Ideias, etc.) — controla rota/menu |
| `points_enabled` (`company_settings`) | `company_settings.points_enabled` | Fonte de verdade separada pra "Gamificação ligada" — quando off, XP/moedas/badges/nível somem de Profile, Dashboard, mobile |
| `has_permission(user_id, module, action)` | RPC no banco | Quase toda policy de escrita administrativa. **Não conhece multi-tenancy sozinho** — quem escreve a policy precisa somar `company_id = get_user_company_id(auth.uid())` |
| `is_platform_admin()` / `get_user_company_id()` | RPCs no banco | Usado em quase toda policy e RPC `SECURITY DEFINER` |
| Segmentação (`is_global`, `target_business_units`, `target_management_groups`) | colunas em `courses`, `quizzes`, `events`, provavelmente outras — A CONFIRMAR lista completa | Decide quem vê/recebe o quê dentro da empresa. Cast obrigatório `::text = ANY(...::text[])` |
| Upload de arquivo | RLS `storage.objects` + `upload-to-r2` (`isAuthorizedObjectPath`) | Todo upload (documentos, avatars, thumbnails, materiais de aula, certificados) — path tem que começar com `company_id` nos DOIS gates |
| Pontuação / XP / moedas | `add_user_points()` RPC, `awardPointsForAction()` (client), `gamificationHelpers.ts` | Treinamentos, Quiz, Eventos, Campanhas, Badges — concessão de pontos deveria ser sempre verificada no servidor (RPC), não decidida só pelo client |
| `email_templates` + `company_email_settings` | migration `20260519000000_email_system.sql` | Padrão "modelo da plataforma + override por empresa" reaproveitado depois em `certificate_templates` |

## Módulos

| Módulo | Contexto(s) | Páginas principais | Depende de | Impacta |
|---|---|---|---|---|
| Autenticação / Usuários | `AuthContext`, `PermissionsContext` | `Login`, `Employees`, `Admin`, `PermissionsGuide` | — | Todos os módulos |
| Empresas / Config | `CompanyContext`, `ModulesContext`, `BusinessUnitContext`, `ManagementGroupContext` | `CompanyAdmin` | Autenticação | Todos os módulos (liga/desliga funcionalidades) |
| Feed / Dashboard | `FeedContext`, `SocialContext` | `Dashboard`, `MobileFeed` | Eventos, Campanhas, Gamificação, Notícias — A CONFIRMAR lista completa de origens do feed | — |
| Eventos | `EventsContext`, `CalendarContext` | `Events`, `EventDetail`, `EditorialCalendar` | Usuários, Gamificação (pontos), Notificações (push) | Feed, Dashboard |
| Treinamentos | `TrainingContext` | `Training`, `TrainingCoursePlayer`, `TrainingCourseView`, `TrainingManagement` | Usuários, Quiz (opcional, `linked_quiz_id`), Gamificação (pontos), segmentação (`is_global`/`target_business_units`/`target_management_groups`), Certificados (`certificate_templates`) | Dashboard, Gamificação |
| Quiz | `QuizContext` | `Quizzes`, `QuizManagement` | Usuários, Gamificação (pontos, exceto quando `fromCampaign`/embutido em curso) | Treinamentos (quiz vinculado), Campanhas |
| Quiz Competitivo | A CONFIRMAR (não mapeado ainda) | `CompetitiveQuiz*` | Usuários | Ranking |
| Campanhas | `CampaignsContext` | `Campaigns`, `CampaignView`, `CampaignManagement` | Quiz, Documentos, Treinamentos (ação pode linkar curso) | Feed, Gamificação |
| Gamificação | `GamificationConfigContext`, `XPContext`, `BadgesRewardsContext`, `BadgeRecognitionsContext`, `SeasonsContext` | `Gamification`, `Ranking` | `points_enabled`, Eventos/Treinamentos/Quiz/Campanhas (fontes de pontos) | Profile, Dashboard, mobile |
| Ideias | `IdeasContext`, `IdeaProgramContext` | `Ideas`, `IdeaBank`, `IdeaPrograms`, `PublicIdeaPrograms` | Usuários | Gamificação (A CONFIRMAR se dá pontos) |
| Reclamações / Denúncias | `ComplaintsContext` | `Complaints`, `ComplaintDetail`, `ComplaintsManagement` | Usuários, Notificações | — |
| Documentos | `DocumentsContext` / `DocumentsContextReal` (A CONFIRMAR qual é o ativo) | `Documents` | Upload (mecanismo transversal) | Treinamentos (lição pode referenciar Documentos — A CONFIRMAR se já foi implementado), Institucional |
| Onboarding | `OnboardingContext` | `Onboarding`, `OnboardingManagement` | Usuários, Treinamentos (A CONFIRMAR se linka curso) | — |
| Aprovações | `ApprovalContext` | `Approvals` | Posts/Feed (A CONFIRMAR escopo completo — sabidamente ligado a `require_post_approval`) | Feed |
| Institucional | `InstitutionalContext` | `Institutional`, `InstitutionalManagement` | Documentos, Upload | — |
| Notificações | `NotificationsContext` | `Notifications` | Push (`send-push` edge function), quase todo módulo dispara | — |
| Mensagens | `SocialContext` (A CONFIRMAR) | `Messages` | Usuários | — |
| Automações | `AutomationsContext` | `AutomationManagement` | `daily-automations`/`reminder-automations` (edge functions + cron) | Vários (dispara ações automáticas) |
| Assistente de IA | — | `AiAssistants` | `ai-chat`, `ai-index-document`, `ai-process-document` (edge functions) | Documentos (RAG simplificado — ver nota abaixo) |
| Certificados | — (lógica dentro de `TrainingContext`/`CourseCertificate.tsx`) | Aba "Certificado" em `CompanyAdmin` | Treinamentos | — |
| E-mails | `EmailTemplatesContext` | Aba "E-mails" em `CompanyAdmin` | — | Qualquer módulo que dispare e-mail transacional |

## Notas de risco conhecidas (não resolvidas)

- **RAG do Assistente de IA não é RAG de verdade**: `ai-chat` despeja o documento inteiro no prompt, sem chunking/embeddings. Fix barato já aplicado; RAG real ficou como projeto à parte.
- **Checagem de "é admin"**: existem 4 mecanismos diferentes espalhados pelo schema (`is_platform_admin`, roles, `access_level`, permissões). Pendente de consolidação — não mexer sem combinar antes.
- **`import_logs`** guarda senha/PIN em texto puro (RLS já corrigida pra só admin ler, mas o dado em si continua sendo risco residual).
- Produção atual é considerada **provisória** — será recriada do zero em algum momento futuro; não gastar esforço mantendo produção 100% sincronizada com staging até lá.

## Como manter isto atualizado

Quando um módulo novo for criado, um mecanismo transversal novo for introduzido, ou um bug real revelar uma dependência escondida — atualizar este arquivo no mesmo commit da mudança. O SATRI DR Panel (app local) tem uma aba que exibe este documento; ele não busca a versão mais nova sozinho, só reflete o que está aqui — atualizar aqui é o que importa.
