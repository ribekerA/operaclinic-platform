# OperaClinic — Plano de Implementação (Design System & UX)

> Escopo: consolidação de design system, componentes fundamentais e correções de UX
> na aplicação `apps/web`, preservando a identidade visual do OperaClinic e as regras
> de negócio já existentes no backend (`apps/api`).

## 1. Diagnóstico do projeto

**Fonte das referências visuais**: a pasta `./design-reference/` citada no briefing
**não existe neste repositório**. As únicas referências disponíveis são dois PDFs
anexados diretamente na conversa: `Opera Clinica0.pdf` (guia de marca — logotipo,
cores, tipografia, voz) e `Opera Clinica.pdf` (protótipo do dashboard "Entrada da
operação"). Este plano usa esses dois PDFs como fonte de verdade visual, conforme
autorizado. Se imagens adicionais existirem fora do repo, precisam ser fornecidas
para revisão de fases futuras (landing premium, inbox, app do profissional etc. têm
referência apenas textual no briefing, sem imagem).

**Divergência relevante com a premissa do briefing**: o documento presume um cenário
onde "se não existir backend, não invente integrações reais, use mocks tipados".
Isso **não se aplica aqui** — `apps/api` (NestJS) é um backend real e maduro, e a
auditoria confirmou que recepção, dashboard executivo, inbox, pacientes, financeiro
e app do profissional **já estão implementados e conectados a ele** via
`apps/web/lib/client/*-api.ts` e `apps/web/app/api/**/route.ts` (proxy BFF com sessão
por cookie). Por regra de prioridade nº 1 ("regras de negócio já existentes no código"),
este trabalho não recria essas telas do zero nem introduz uma camada de mocks — ele
consolida design system e cobre lacunas reais de UX/acessibilidade/componentização.

## 2. Arquitetura atual (confirmada por auditoria)

- **Stack**: Next.js 15 (App Router), React 19, TypeScript 5.8. Monorepo pnpm/turbo
  com `apps/api` (NestJS), `apps/web` (Next.js), `apps/professional-mobile` (Flutter,
  fora de escopo), `packages/shared` (tipos/contratos compartilhados).
- **Estado**: sem Redux/Zustand — `useState`/`useEffect` local por página.
- **Dados**: sem React Query/SWR — wrapper próprio (`lib/client/http.ts`:
  `requestJson`, `ApiRequestError`, `toErrorMessage`) chamando rotas proxy Next.js
  (`app/api/**/route.ts` → `requestBackendWithSession`).
- **Estilo**: Tailwind CSS 3.4 (`tailwind.config.ts`), sem CSS-in-JS. Tokens de cor
  hoje limitados a 7 entradas (`canvas`, `panel`, `border`, `ink`, `muted`, `accent`,
  `accentSoft`). Sem tokens de radius/spacing/z-index/motion — tudo usa defaults do
  Tailwind ou classes literais (`slate-950`, `rose-600` etc. espalhadas).
- **Tipografia**: Manrope + IBM Plex Mono já configuradas via `next/font` em
  `app/layout.tsx` e já ligadas ao Tailwind (`--font-manrope`, `--font-mono`). Nenhuma
  mudança de fonte é necessária.
- **Ícones**: `lucide-react` (já em uso extensivo).
- **Formulários**: controlados manualmente (`useState` + `FormEvent`), sem
  `react-hook-form`/`zod`. Mantido — trocar a estratégia de formulários é fora do
  escopo deste plano (risco alto, benefício baixo para o objetivo de design system).
- **Testes**: Vitest apenas (sem Playwright/Cypress instalado). `"lint"` hoje é
  literalmente `tsc --noEmit` — **não existe ESLint configurado no projeto**.
- **Auth/sessão**: padrão único e consistente (`SessionUser`, `requestBackendWithSession`,
  cookies com refresh) — sem exceções encontradas.
- **Acessibilidade atual**: uso de `aria-*`/`role` presente mas inconsistente (119
  ocorrências em 43 arquivos); `focus-visible` só em 4 arquivos públicos;
  `prefers-reduced-motion` **ausente em todo o projeto**, apesar de haver animações
  contínuas (`oc-float`, `oc-shimmer`, `oc-live-ring`).

### Rotas existentes (inventário)

**Públicas**: `/`, `/planos`, `/cadastro`, `/checkout`, `/acesso`,
`/agendar/[slug]`, `/clinic/login`, `/clinic/password-reset`,
`/clinic/reset-password`, `/login/clinic`, `/login/platform`, `/platform/login`,
`/termos`, `/privacidade`. *(nota: existem 3 rotas de login de clínica e 2 de
plataforma sobrepostas — não serão unificadas neste plano por risco de quebrar
links/redirects existentes; documentado como pendência.)*

**Clínica** (`/clinic/*`): dashboard executivo, `reception`, `inbox`, `messaging`,
`patients`, `follow-ups`, `finance`, `professional`, `professionals`, `units`,
`specialties`, `consultation-types`, `protocols`, `users`, `account`,
`integrations`, `no-access`.

**Plataforma** (`/platform/*`): dashboard, `operations`, `growth`, `seo`,
`market-intelligence`, `finance`, `tenants`, `agents`, `reliability`,
`product-control`, `ceo-mode`, `payments`, `plans`, `users`.

**Demo**: `/demo/vitalis` — única página com dados 100% estáticos hardcoded
(fora de escopo comercial, não será tocada).

## 3. Problemas encontrados

1. **Ausência de tokens de design centralizados** — só 7 cores nomeadas; radius,
   spacing, z-index, motion e sombra são implícitos/Tailwind default. Cores
   literais (`slate-950`, `rose-600`, `emerald-50`...) espalhadas pelas páginas.
2. **Biblioteca de componentes incompleta** — de ~40 componentes mínimos do
   briefing, ~15 já existem (`Button`, `Card`, `StatusPill`, `ProgressBar`, `Sheet`
   como Drawer, e a família `Admin*` em `platform-admin.tsx` cobrindo
   MetricCard/PageHeader/EmptyState/Skeleton/ActionCard/Timeline/FilterBar).
   Faltam: Input, SearchInput, Select, Textarea, FormField, IconButton, Avatar,
   Modal (centralizado — só existe Drawer lateral), DropdownMenu genérico, Tooltip,
   Tabs, Table, Pagination, ConfirmationDialog genérico, Alert, Toast,
   PatientCard/AppointmentCard/ProfessionalCard extraídos como componentes
   reutilizáveis, WhatsAppConnectionStatus.
3. **Acessibilidade abaixo do AA em foco de teclado** — `focus:ring` (aparece em
   qualquer foco, incluindo clique de mouse) em vez de `focus-visible:ring` nos
   componentes base (`Button` inclusive). `prefers-reduced-motion` não respeitado.
4. **Recepção**: já implementa fila/agenda/confirmações, mas não organiza os
   itens em uma "Central de atenção" hierarquizada como pede o briefing — os
   cartões de atraso, confirmação pendente e falha de WhatsApp não têm peso
   visual diferenciado nem ordenação por urgência unificada.
5. **Fluxo de novo agendamento** embutido inline na página de recepção
   (`appointment-drawer.tsx`), sem stepper progressivo — formulário único.
6. **Onboarding pós-venda inexistente** — o único onboarding é o comercial
   (pré-checkout, marketing). Não há fluxo de ativação dentro do produto para
   clínica recém-criada (profissionais, procedimentos, horários, WhatsApp,
   importação de pacientes, teste de confirmação).
7. **Login/roteamento duplicado** (3 rotas de clínica, 2 de plataforma).

## 4. Decisões técnicas

- **Não trocar stack**: mantém Next.js App Router, Tailwind, `lucide-react`,
  wrapper `fetch` próprio, Vitest. Nenhuma dependência pesada nova (sem Radix,
  sem shadcn/ui completo, sem React Query) — componentes novos serão construídos
  com Tailwind + primitives HTML nativos + `lucide-react`, seguindo o padrão já
  estabelecido em `Button`/`Card`/`Sheet`.
- **Tokens via `tailwind.config.ts` + `globals.css`** (mecanismo já em uso),
  estendendo — não substituindo — a paleta atual (`accent #0f766e` permanece
  como teal principal; `slate-950` formalizado como token `navy`).
- **Sem framework de formulário novo**: `FormField` será um wrapper de
  apresentação (label + hint + erro), não uma engine de validação.
- **Sem Modal genérico com portal complexo**: `Modal` centralizado será
  implementado com o mesmo padrão de `Sheet` (backdrop + `Escape` + foco preso),
  reaproveitando a lógica existente.
- **`docs/DESIGN_SYSTEM.md` e `docs/UX_DECISIONS.md`** serão criados ao final de
  cada etapa relevante (tokens/componentes → DESIGN_SYSTEM; decisões de fluxo →
  UX_DECISIONS), não como documentos de uma vez só no final.

## 5. Estrutura proposta (novos arquivos)

```
apps/web/
  lib/design-tokens.ts          # constantes tipadas espelhando tailwind.config.ts (radius, motion, z-index)
  components/ui/
    input.tsx                   # Input, SearchInput
    select.tsx                  # Select nativo estilizado
    textarea.tsx
    form-field.tsx              # label + hint + erro
    icon-button.tsx
    avatar.tsx
    modal.tsx                   # dialog centralizado
    dropdown-menu.tsx
    tooltip.tsx
    tabs.tsx
    table.tsx                   # Table + Pagination
    confirmation-dialog.tsx
    alert.tsx
    toast.tsx                   # + toast-provider.tsx (contexto local, sem lib externa)
  components/clinic/
    patient-card.tsx
    appointment-card.tsx
    professional-card.tsx
    whatsapp-connection-status.tsx
    attention-center.tsx        # "Central de atenção" da recepção
```

## 6. Componentes principais (novos ou consolidados)

Ver tabela completa no `docs/DESIGN_SYSTEM.md` (criado na Fase 2). Resumo dos que
serão **criados**: Input/SearchInput, Select, Textarea, FormField, IconButton,
Avatar, Modal, DropdownMenu, Tooltip, Tabs, Table+Pagination, ConfirmationDialog,
Alert, Toast+ToastProvider, PatientCard, AppointmentCard, ProfessionalCard,
WhatsAppConnectionStatus, AttentionCenter. Os que já existem e serão apenas
ajustados para `focus-visible` e tokens: `Button`, `Card`, `Sheet`, `StatusPill`,
`ProgressBar`, a família `Admin*`.

## 7. Ordem de implementação

1. Tokens de design (`tailwind.config.ts`, `globals.css`, `lib/design-tokens.ts`)
   + ajuste de `focus-visible`/`prefers-reduced-motion` nos componentes base
   existentes.
2. Componentes fundamentais faltantes (lista da seção 6).
3. Recepção: "Central de atenção" com hierarquia de urgência real.
4. Pacientes/Profissionais: extrair `PatientCard`/`ProfessionalCard` reutilizáveis
   nas listas existentes (sem alterar a integração com a API).
5. Estados obrigatórios: `Alert`/`ErrorState`/`EmptyState` padronizados aplicados
   onde hoje há caixas vermelhas ad hoc.
6. Documentação: `docs/DESIGN_SYSTEM.md`, `docs/UX_DECISIONS.md`, atualização
   deste plano com o que foi concluído.
7. Qualidade: typecheck + build + revisão manual de overflow/responsividade.

**Fora do escopo desta rodada** (documentado como roadmap, não implementado
agora — ver seção 9): fluxo de novo agendamento como stepper dedicado,
onboarding pós-venda dentro do produto, unificação das rotas de login
duplicadas, reescrita da landing (já existe e já segue a voz da marca —
receberá apenas revisão pontual de copy/CTA), Financeiro com módulo de API
dedicado, testes Playwright (não instalado — não será adicionado uma
dependência pesada nova sem pedido explícito).

## 8. Riscos

- **Escopo do briefing é maior que uma sessão viável**: o documento original
  pede a reconstrução completa de ~10 áreas de produto com stepper, onboarding,
  inbox de 3 colunas etc. Como a maior parte já está construída e funcional,
  refazer do zero teria alto risco de regressão sem ganho real. Este plano
  prioriza consolidar o que existe e preencher lacunas reais de UX/acessibilidade.
- **Sem ESLint configurado**: "executar lint" do briefing (Fase 7) equivale a
  `tsc --noEmit`, que já roda no gate de qualidade — não há regra de lint
  adicional para aplicar.
- **Sem Playwright/Cypress**: comparação visual automatizada com os PDFs de
  referência não é possível sem adicionar dependência pesada; validação será
  manual (dev server + revisão de breakpoints).
- **Mudança de tokens pode afetar contraste em componentes existentes** — cada
  ajuste de cor será verificado contra WCAG AA antes de aplicar.

## 9. Critérios de conclusão desta rodada

- Tokens centralizados e documentados, zero cor hexadecimal nova fora do config.
- Todos os componentes listados na seção 6 implementados com estados
  default/hover/focus-visible/disabled onde aplicável.
- `focus-visible` e `prefers-reduced-motion` cobrindo os componentes base.
- Recepção com "Central de atenção" hierarquizada.
- `docs/DESIGN_SYSTEM.md` e `docs/UX_DECISIONS.md` publicados.
- `pnpm --filter @operaclinic/web typecheck` e `build` sem erros.
- Sem overflow horizontal nos breakpoints 360/390/768/1024/1366/1440px
  (verificação manual nas telas tocadas).

---

## 10. Progresso

- [x] **Etapa 1 — Tokens de design**: `tailwind.config.ts`, `lib/design-tokens.ts`
  e `globals.css` atualizados (`navy`, `success`, `warning`, `danger`,
  `rounded-card/panel/control/pill`, z-index scale, `prefers-reduced-motion`).
  `focus-visible` aplicado nos componentes base existentes.
- [x] **Etapa 2 — Componentes fundamentais**: todos os componentes listados na
  seção 6 foram criados (ver `docs/DESIGN_SYSTEM.md` para o catálogo completo).
  Único desvio: `AttentionCenter` não virou arquivo separado — ver seção 3 de
  `docs/UX_DECISIONS.md`.
- [x] **Etapa 3 — Central de atenção da recepção**: implementada inline em
  `app/(clinic)/clinic/reception/page.tsx`, com 4 categorias (fila crítica,
  atrasados, confirmações pendentes, retorno para pagamento) — reduzida frente
  às 7 do briefing original por ausência de dado real de backend para as
  demais (WhatsApp/encaixe). Substituiu o card redundante "Próximos a chegar".
- [x] **Etapa 4 — PatientCard/AppointmentCard/ProfessionalCard/WhatsAppConnectionStatus**:
  criados e integrados em `patients/page.tsx`, `reception/page.tsx`,
  `clinic-professionals-workspace.tsx` e `integrations/page.tsx`.
- [x] **Etapa 5 — Padronização de estados**: `Alert`/`ErrorState` aplicados em
  todas as páginas clínicas que tinham caixas de erro/sucesso ad hoc
  (`patients`, `users`, `units`, `specialties`, `consultation-types`,
  `account`, `integrations`, `protocols`, `reception`, `professional`,
  dashboard executivo, `finance`, `follow-ups`). Critério Alert-vs-ErrorState
  documentado em `docs/UX_DECISIONS.md` seção 5.
- [x] **Etapa 6 — Documentação**: `docs/DESIGN_SYSTEM.md` e
  `docs/UX_DECISIONS.md` publicados; este plano atualizado.
- [ ] **Etapa 7 — Qualidade**: typecheck + build + revisão de
  responsividade — em andamento (próximo passo).

*Progresso registrado incrementalmente nesta seção conforme cada etapa é concluída.*
