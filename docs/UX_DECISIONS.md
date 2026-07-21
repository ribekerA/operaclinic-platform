# OperaClinic — Decisões de UX

> Registro das decisões de produto/UX tomadas durante a implementação desta
> rodada, com o motivo e a fonte que a justificou, seguindo a ordem de
> prioridade definida em `docs/IMPLEMENTATION_PLAN.md`: (1) regra de negócio já
> no código, (2) imagens de referência de design, (3) guia de marca, (4) este
> briefing, (5) boas práticas gerais.

## 1. Toast é aditivo, não substitui o feedback local

`ToastProvider`/`useToast` (`components/ui/toast.tsx`) existe para eventos
efêmeros (ex.: "Convite reenviado"). Ele **não substitui** o padrão de
`Alert`/`ErrorState` fixado na tela após uma ação — porque erros de formulário
e estados de carregamento precisam permanecer visíveis até o usuário agir,
enquanto um toast desaparece sozinho em 5s. As duas camadas convivem: toast
para "algo aconteceu em background", banner local para "isto precisa da sua
atenção agora".

## 2. `Tabs` recebe `id` explícito, não index posicional

A API de `Tabs`/`TabPanel` usa um `id` de string por aba (não o índice do
array), para que o estado ativo sobreviva a reordenações de aba e para que o
roving-tabindex e o `aria-controls`/`aria-labelledby` gerados sejam estáveis
entre renders.

## 3. Central de atenção (recepção): só 4 categorias, não as 7 do briefing

O briefing pede também: falhas de WhatsApp, horários livres/encaixe e
confirmações via canal digital. Auditoria de `packages/shared/src/reception.ts`
e do estado já computado em `reception/page.tsx` confirmou que **não existe**
hoje rastreamento de falha de envio de WhatsApp nem de vagas livres/encaixe no
modelo de dados real — só existiriam como dado fabricado no frontend.

Pela regra de prioridade #1 (regra de negócio já no código vence o briefing),
a Central de atenção ficou com as 4 categorias que têm dado real por trás:

1. Fila crítica (aguardando ≥20min)
2. Atrasados (horário previsto já passou)
3. Confirmações pendentes
4. Retorno para pagamento (atendimento concluído, sem baixa financeira)

**Consequência para o backlog**: se o produto quiser as categorias de
WhatsApp/encaixe, isso exige trabalho de backend novo (rastrear
status de entrega de mensagem, ou expor slots livres da agenda) — não é um
ajuste de UI, é uma feature nova a ser especificada separadamente.

## 4. Central de atenção implementada inline, não como componente separado

`IMPLEMENTATION_PLAN.md` (seção 5) previa `components/clinic/attention-center.tsx`
como arquivo isolado. Na implementação, ficou inline em
`app/(clinic)/clinic/reception/page.tsx` porque a seção depende fortemente de
estado e handlers já locais à página (`renderQuickActions`, `nowTimestamp`,
`timezone`, os arrays já computados por `useMemo`). Extrair exigiria passar ~8
props e duplicar tipos só para separar arquivo — sem ganho real de
reutilização, já que a Central de atenção não é usada em nenhuma outra tela.

Também substituiu o card "Próximos a chegar" (que mostrava
`dashboard.nextAppointments`), por ser redundante com o card "Chegadas e
atrasos" logo abaixo — resolvendo o problema de "excesso de cards competindo"
citado no briefing, em vez de simplesmente empilhar mais um painel.

## 5. Alert vs. ErrorState: quando usar cada um

Duas situações diferentes, verificadas por página via grep de todo `setError(`
antes de decidir:

- **Estado de erro/sucesso compartilhado por vários handlers de ação**
  (ex.: `patients/page.tsx`, onde `error` é setado tanto por `loadPatients`
  quanto por criar/editar paciente e matricular em protocolo) → `Alert`
  (`tone="danger"`/`"success"`, sem `children`, sem ação de retry). Um botão
  "Tentar novamente" seria enganoso aqui: se a última falha foi ao *criar* um
  paciente, um retry que só re-executa o *load* não corrige nada.
- **Estado de erro exclusivo de um carregamento específico**
  (ex.: `clinic/page.tsx` → `loadDashboard`; `finance/page.tsx` → `load(period)`;
  `follow-ups/page.tsx` → `loadDispatches`; o painel de detalhe de paciente em
  `professional/page.tsx` → `handleOpenPatient`) → `ErrorState` com `onRetry`
  apontando exatamente para essa função de carga.

Páginas convertidas para `Alert` (erro compartilhado): `patients`, `users`,
`units`, `specialties`, `consultation-types`, `account`, `integrations`,
`protocols` (preservando o `UpsellCard` já existente à frente do erro),
`reception`, e o par erro/feedback de topo em `professional`.

Páginas convertidas para `ErrorState` (erro exclusivo de load, com retry):
`clinic` (dashboard executivo), `finance`, `follow-ups`, e o painel de detalhe
de paciente dentro de `professional`.

Esse mapeamento foi corrigido uma vez em `patients/page.tsx`: a primeira
tentativa usou `ErrorState`+retry assumindo erro exclusivo de load; o grep
revelou que era compartilhado, e a implementação foi revertida para `Alert`
antes de generalizar a regra para as demais páginas.

## 6. `professional/page.tsx`: alertas clínicos não convertidos

As duas caixas de alerta específicas — "Atenção clínica" e "Alerta de
intercorrência" — foram deliberadamente **mantidas como estão**, não
convertidas para `Alert` genérico. Diferem semanticamente de um banner de
erro/sucesso de formulário: carregam rótulo clínico próprio e urgência
assistencial, não uma mensagem de resultado de ação. Convertê-las arriscaria
perder esse significado por um ganho de consistência visual marginal —
contraria a regra do briefing de não redesenhar além do necessário.

## 7. Tokens novos (`navy`, `success`, `warning`, `danger`) substituem cor solta, não a paleta neutra

A paleta neutra (`canvas`, `panel`, `border`, `ink`, `muted`) e o `accent` teal
já existiam e vinham do guia de marca — não foram alterados. Os tokens novos
resolvem especificamente os casos onde o código usava `emerald-*`/`amber-*`/
`rose-*`/`slate-950` literais para comunicar estado, criando uma paleta de
estado inconsistente entre telas. Ver `docs/DESIGN_SYSTEM.md` seção 1 para a
tabela completa.

## 8. Fora do escopo desta rodada (registrado, não esquecido)

Já explicitamente fora do escopo em `IMPLEMENTATION_PLAN.md` seção 9, listado
aqui de novo para rastreabilidade: stepper de novo agendamento, onboarding
pós-cadastro, unificação de rotas de login, reescrita da landing page, módulo
de API dedicado para Financeiro, testes Playwright. Esses itens exigem decisão
de produto e/ou trabalho de backend que não estava determinável só pela
auditoria de código + referências visuais — não foram implementados para
evitar inventar comportamento não especificado.
