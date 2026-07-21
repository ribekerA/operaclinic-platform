# OperaClinic — Design System

> Companion de `docs/IMPLEMENTATION_PLAN.md`. Descreve os tokens e componentes
> consolidados nesta rodada. Não é um guia de marca (ver PDFs `Opera Clinica0.pdf`
> / `Opera Clinica.pdf` para isso) — é a referência técnica de implementação.

## 1. Tokens

Definidos em dois lugares que **devem ficar sincronizados manualmente**:
`apps/web/tailwind.config.ts` (uso em `className`) e `apps/web/lib/design-tokens.ts`
(uso em TypeScript fora de className — ex.: lógica que decide uma cor por estado).
Qualquer novo token entra nos dois arquivos, nunca em só um.

### Cores

| Token | Valor | Uso |
| --- | --- | --- |
| `canvas` / `panel` / `border` / `ink` / `muted` | (já existentes) | Paleta neutra base, inalterada nesta rodada. |
| `accent` `#0f766e` / `accentSoft` | (já existente) | Teal principal da marca. Inalterado. |
| `navy` `#0b1324` / `navy-soft` `#111c34` | novo | Azul-marinho premium (guia de marca), substitui `slate-950` ad hoc em superfícies escuras (`Card tone="dark"`, `Button variant="primary"`). |
| `success` `#0f9d63` / `success-soft` `#d8f5e6` | novo | Substitui `emerald-*` literais em pills, alerts, badges de status positivo. |
| `warning` `#b45309` / `warning-soft` `#fef3c7` | novo | Substitui `amber-*` literais. |
| `danger` `#be123c` / `danger-soft` `#ffe4e6` | novo | Substitui `rose-*`/`red-*` literais. |

### Radius

| Token | Valor | Uso |
| --- | --- | --- |
| `rounded-card` | 28px | Cards de conteúdo (pacientes, agendamentos, profissionais). |
| `rounded-panel` | 20px | Painéis internos, alerts, tooltips. |
| `rounded-control` | 14px | Inputs, selects, textareas, botões. |
| `rounded-pill` | 9999px | Badges, status pills. |

### Outros

- **Spacing**: `spacing.18` = `4.5rem` (único acréscimo; escala padrão do Tailwind preservada).
- **Shadow**: `shadow-control` (inputs/botões), `shadow-popover` (dropdown/tooltip/modal).
- **Z-index**: `dropdown:40`, `sticky:50`, `drawer:60`, `modal:70`, `toast:80`, `tooltip:90` — evita a guerra de `z-[9999]` espalhada.
- **Motion**: `transitionDuration.DEFAULT = 160ms`; `@media (prefers-reduced-motion: reduce)` em `globals.css` neutraliza animações/transições globalmente para quem pede.
- **Tipografia**: Manrope (`font-sans`) + IBM Plex Mono (`font-mono`) — já existiam, sem mudança.

## 2. Componentes

Estado "Novo" = criado nesta rodada. Estado "Ajustado" = já existia, recebeu
`focus-visible`/tokens. Estado "Existente" = não tocado.

| Componente | Arquivo | Status | Estados suportados |
| --- | --- | --- | --- |
| Button | `components/ui/button.tsx` | Ajustado | default, hover, focus-visible, disabled, variantes primary/secondary/accent/ghost/danger/warning |
| Card | `components/ui/card.tsx` | Ajustado | tone default/dark, `rounded-card` |
| Sheet (drawer lateral) | `components/ui/sheet.tsx` | Ajustado | `role="dialog"`, `aria-modal`, `z-drawer`, focus-visible no fechar |
| StatusPill | `components/ui/status-pill.tsx` | Ajustado | tone success/warning/danger/neutral (tokens novos) |
| ProgressBar | `components/ui/progress-bar.tsx` | Existente | — |
| Input / SearchInput | `components/ui/input.tsx` | Novo | default, focus-visible, invalid, disabled |
| Textarea | `components/ui/textarea.tsx` | Novo | default, focus-visible, invalid, disabled |
| Select | `components/ui/select.tsx` | Novo | default, focus-visible, invalid, disabled |
| FormField | `components/ui/form-field.tsx` | Novo | label + hint + erro, injeta `aria-describedby`/`aria-invalid` automaticamente |
| IconButton | `components/ui/icon-button.tsx` | Novo | default/ghost/danger, sm/md, exige `label` (vira `aria-label`) |
| Avatar | `components/ui/avatar.tsx` | Novo | iniciais calculadas, `role="img"` |
| Alert | `components/ui/alert.tsx` | Novo | info/success/warning/danger, banner persistente (`role="alert"` em warning/danger, `role="status"` nos demais) |
| Modal | `components/ui/modal.tsx` | Novo | sm/md/lg, Escape para fechar, trava scroll do body, `role="dialog"` |
| ConfirmationDialog | `components/ui/confirmation-dialog.tsx` | Novo | tone default/danger, loading |
| DropdownMenu | `components/ui/dropdown-menu.tsx` | Novo | click-outside, Escape, foco no primeiro item habilitado |
| Tooltip | `components/ui/tooltip.tsx` | Novo | hover **e** foco de teclado (não é mouse-only) |
| Tabs / TabPanel | `components/ui/tabs.tsx` | Novo | roving tabindex, setas ←/→, `role="tablist"/"tab"/"tabpanel"` |
| Table | `components/ui/table.tsx` | Novo | genérica, `overflow-x-auto` (sem overflow de página) |
| Pagination | `components/ui/pagination.tsx` | Novo | auto-oculta com 1 página só |
| Toast / ToastProvider | `components/ui/toast.tsx` | Novo | info/success/danger, auto-dismiss 5s, `role="status" aria-live="polite"` — **aditivo**, não substitui os banners `Alert` locais |
| ErrorState | `components/ui/error-state.tsx` | Novo | mensagem + `onRetry` opcional, construído sobre `Alert` |
| LoadingState | `components/ui/loading-state.tsx` | Novo | spinner + `role="status"` |
| PatientCard | `components/clinic/patient-card.tsx` | Novo | selected, apresentacional puro |
| AppointmentCard | `components/clinic/appointment-card.tsx` | Novo | atrasado/no-horário, `actions` injetáveis |
| ProfessionalCard | `components/clinic/professional-card.tsx` | Novo | selected, apresentacional puro |
| WhatsAppConnectionStatus | `components/clinic/whatsapp-connection-status.tsx` | Novo | connected/degraded/disconnected/error — nunca só cor, sempre ícone + texto |
| `Admin*` (PageHeader, MetricGrid, ShortcutPanel, EmptyState, CountBadge, FilterSummary...) | `components/platform/platform-admin.tsx` | Existente | Já cobriam boa parte do catálogo pedido (MetricCard, PageHeader, EmptyState, FilterBar); não duplicados. |

**Não criado nesta rodada** (avaliado e descartado por já existir equivalente ou
por ser fora do escopo real, ver `docs/UX_DECISIONS.md`): `MobileNavigation`
dedicado, `TimePicker`/`DatePicker` customizados (inputs nativos `type="date"`/`time`
já cobrem o uso real do produto), `Stepper`/`Timeline` genéricos (já existe
`Timeline`/`ActionCard` em `platform-admin.tsx` para os casos reais em uso).

## 3. Acessibilidade — convenções aplicadas

- `focus-visible:ring-4` em vez de `focus:ring-4` em todo componente interativo novo/ajustado — foco visível só ao navegar por teclado, sem "anel" em clique de mouse.
- Cor nunca é o único sinal de estado: todo `StatusPill`/`Alert`/`WhatsAppConnectionStatus` combina cor + ícone + texto.
- `prefers-reduced-motion: reduce` neutraliza animação/transição/scroll suave globalmente (`app/globals.css`).
- Diálogos (`Modal`, `ConfirmationDialog`, `Sheet`) fecham com `Escape` e usam `role="dialog" aria-modal="true"`.
- `Tabs` usa roving tabindex (uma única tab focável por vez, setas movem o foco) — padrão WAI-ARIA para tablist.
- `Tooltip` aparece em hover **e** em foco de teclado — nunca depende só do mouse.

## 4. Regra de ouro

Qualquer nova tela ou componente reutiliza estes tokens e componentes antes de
introduzir uma cor, radius ou padrão de estado novo. Valor literal (`#hex`,
`rounded-[Npx]`, `z-[9999]`) fora deste sistema é sinal de que falta um token —
adicionar o token, não o valor solto.
