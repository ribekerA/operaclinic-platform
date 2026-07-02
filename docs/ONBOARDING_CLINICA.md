# Guia de Onboarding — Primeira Clínica Cliente

Bem-vinda ao OperaClinic. Este guia cobre tudo que a sua equipe precisa para sair do zero ao atendimento real com eficiência.

---

## Sumário

1. [Primeiro Acesso](#1-primeiro-acesso)
2. [Configuração Inicial](#2-configuração-inicial)
3. [Configurar WhatsApp](#3-configurar-whatsapp)
4. [Cadastro de Pacientes](#4-cadastro-de-pacientes)
5. [Usando a Recepção](#5-usando-a-recepção)
6. [Protocolos de Tratamento](#6-protocolos-de-tratamento)
7. [App Mobile para Profissionais](#7-app-mobile-para-profissionais)
8. [FAQ](#8-faq)
9. [Suporte](#9-suporte)

---

## 1. Primeiro Acesso

### URL de acesso

O sistema é acessado pelo navegador (Chrome ou Edge recomendados). Você receberá a URL do seu ambiente no e-mail de boas-vindas. O formato padrão é:

```
https://app.operaclinic.com.br
```

### Tela de login

Na tela inicial, clique em **Entrar como Clínica**. Você será direcionado para a tela de login de clínica (`/login/clinic`).

> **Dica:** Não use a tela de login de plataforma — ela é exclusiva para a equipe interna do OperaClinic.

### Credenciais iniciais

Você receberá um e-mail com as credenciais do **Admin da Clínica**. Por padrão, o ambiente de demonstração usa:

| Perfil           | E-mail                              | Senha inicial |
|------------------|-------------------------------------|---------------|
| Admin da Clínica | `admin@suaclinica.com`              | Enviado por e-mail |
| Gestor           | `gestor@suaclinica.com`             | Enviado por e-mail |
| Recepção         | `recepcao@suaclinica.com`           | Enviado por e-mail |
| Profissional     | `profissional@suaclinica.com`       | Enviado por e-mail |

### Como trocar a senha

1. Faça login com as credenciais recebidas.
2. No menu lateral, clique em **Minha conta** (`/clinic/account`).
3. Localize a seção de segurança e altere a senha.
4. Use uma senha forte com letras maiúsculas, minúsculas, números e símbolos.

> **Dica:** Troque todas as senhas antes de liberar o acesso à equipe. Cada pessoa deve ter o seu próprio login.

---

## 2. Configuração Inicial

A configuração segue uma ordem lógica: primeiro a estrutura da clínica, depois os profissionais e seus horários. Siga os passos abaixo.

> **Dica:** Todas as configurações ficam no menu lateral, acessível pelo perfil **Admin** ou **Gestor**.

### 2.1 Especialidades (`/clinic/specialties`)

Especialidades definem as áreas estéticas da sua clínica (ex.: Estética Facial, Harmonização Orofacial, Corporal).

**Passos:**
1. Acesse **Especialidades** no menu lateral.
2. Clique em **Nova especialidade**.
3. Informe o nome e salve.
4. Repita para cada especialidade que a clínica oferece.

### 2.2 Procedimentos Estéticos (`/clinic/consultation-types`)

Procedimentos definem o que é agendado — com duração, área estética e nível de invasividade.

**Passos:**
1. Acesse **Procedimentos estéticos** no menu.
2. Crie cada procedimento com:
   - Nome (ex.: "Toxina Botulínica", "Limpeza de Pele Profunda")
   - Duração em minutos
   - Área estética (facial, corporal, capilar, laser, harmonização, peeling)
   - Nível de invasividade
   - Dias de recuperação
   - Frequência recomendada em dias
3. Marque se é uma consulta de primeiro atendimento ou retorno.

> **Dica:** O sistema já vem com um catálogo de mais de 20 procedimentos no ambiente de demonstração — avalie quais se aplicam à sua realidade antes de criar do zero.

### 2.3 Unidades (`/clinic/units`)

Se a clínica opera em mais de um endereço ou espaço físico, cadastre cada unidade.

**Passos:**
1. Acesse **Unidades** no menu.
2. Clique em **Nova unidade**.
3. Informe o nome (ex.: "Unidade Centro", "Sala VIP") e uma descrição opcional.

### 2.4 Profissionais (`/clinic/professionals`)

Profissionais são os membros da equipe que realizam atendimentos. O cadastro de profissional é separado do login de usuário.

**Passos:**
1. Acesse **Profissionais** no menu.
2. Clique em **Novo profissional**.
3. Preencha:
   - Nome completo e nome de exibição
   - Registro profissional
   - Especialidades vinculadas
   - Unidade(s) onde atende
4. Para vincular o profissional a um login de usuário, acesse a ficha do profissional e associe o usuário correspondente.

### 2.5 Usuários e permissões (`/clinic/users`)

Cada pessoa da equipe deve ter seu próprio login com o papel correto:

| Papel            | O que pode fazer |
|------------------|-----------------|
| **Admin (TENANT_ADMIN)** | Acesso completo — configurações, financeiro, usuários |
| **Gestor (CLINIC_MANAGER)** | Operação e configuração, sem gerenciar usuários |
| **Recepção (RECEPTION)** | Agenda, pacientes, check-in, agendamentos |
| **Profissional (PROFESSIONAL)** | Somente seu espaço pessoal de agenda |

**Passos para criar um usuário:**
1. Acesse **Usuários** no menu.
2. Clique em **Novo usuário**.
3. Informe o e-mail e selecione o papel.
4. O usuário receberá um e-mail de ativação.

### 2.6 Horários dos profissionais

A agenda de cada profissional é definida por horários semanais, vinculados a uma unidade.

**Passos:**
1. Acesse a ficha do profissional em **Profissionais**.
2. Localize a seção de horários.
3. Configure os blocos de atendimento por dia da semana (ex.: segunda a sexta, 08h–12h e 13h–18h; sábado, 08h–12h).
4. Defina o intervalo de slots em minutos (padrão: 15 minutos).

> **Dica:** Sem horários configurados, o profissional não aparece na busca de disponibilidade durante o agendamento.

---

## 3. Configurar WhatsApp

A integração com WhatsApp permite que a clínica envie confirmações, lembretes e gerencie conversas com pacientes de forma automatizada.

> **Permissão necessária:** Somente Admin ou Gestor da clínica podem configurar integrações.

### Pré-requisitos

Antes de começar, você precisará de:
- Uma conta **Meta Business** verificada
- Um número de WhatsApp Business dedicado (não pode ser o pessoal do dono)
- Acesso ao painel de desenvolvedor da Meta

### Passo a passo — Via Meta Embedded Signup (recomendado)

1. Acesse **Integrações** no menu lateral (`/clinic/integrations`).
2. Na seção **Conectar WhatsApp**, clique em **Entrar com Meta Business**.
3. Uma janela da Meta abrirá. Faça login com a conta Meta Business da clínica.
4. Selecione o número de WhatsApp Business que deseja conectar.
5. Autorize as permissões solicitadas.
6. O sistema conectará automaticamente o número. **Você verá os dados do webhook logo abaixo — copie o Verify Token agora**, pois ele não será exibido novamente.

### Configurar o Webhook na Meta

Após a conexão, você precisa registrar o webhook no painel da Meta:

1. Acesse o [Meta for Developers](https://developers.facebook.com) > seu App > WhatsApp > Configuração.
2. Na seção Webhooks, informe:
   - **URL do Callback:** `https://seudominio.com.br/webhook/whatsapp/{id-da-integração}`
   - **Verify Token:** o token gerado pelo OperaClinic
3. Assine os eventos: `messages`, `message_deliveries`, `message_reads`.
4. Clique em **Verificar e salvar**.

### Verificar se está funcionando

Retorne a **Integrações** e confira o painel **Pronto para piloto?**:

- **Backend:** deve estar verde
- **Meta habilitado:** verde
- **Conexão ativa:** verde
- **Phone number id:** verde (confirma que o número está vinculado)

> **Dica:** Se algum item estiver vermelho, acione o suporte com print da tela de readiness — isso agiliza muito o diagnóstico.

### Configuração avançada (manual)

Se preferir configurar sem o fluxo Meta, clique em **Configuração avançada (manual)** na página de integrações e preencha:
- Provedor: Meta WhatsApp
- Nome da conexão
- Número WhatsApp (formato: `+5511999999999`)
- Phone number id da Meta
- Verify token (opcional — gerado automaticamente se deixado em branco)

---

## 4. Cadastro de Pacientes

O cadastro de pacientes está em **Pacientes** (`/clinic/patients`) e pode ser feito tanto pelo painel administrativo quanto diretamente da recepção durante o atendimento.

### Cadastro completo (`/clinic/patients`)

1. Na parte direita da tela, localize a seção **Novo paciente**.
2. Preencha os campos:
   - **Nome completo**
   - **Tipo de contato:** WhatsApp (preferencial) ou Telefone
   - **Contato:** número com DDD
   - **Data de nascimento**
   - **Documento:** CPF ou outro
   - **Observações:** notas operacionais gerais
3. Marque **Paciente ativo**.
4. Clique em **Cadastrar paciente**.

### Ficha estética

Após cadastrar, abra a ficha do paciente clicando nele na lista. A ficha apresenta uma seção dedicada à **estética**, com campos que ficam visíveis para o profissional no atendimento:

| Campo | Para que serve |
|-------|---------------|
| **Alergias** | Ex.: látex, lidocaína, parabenos |
| **Objetivos estéticos** | Ex.: redução de manchas, firmeza, volume labial |
| **Contraindicações** | Ex.: gestante, marca-passo, uso de anticoagulantes |

> **Dica:** Preencha a ficha estética no primeiro atendimento. Essas informações ficam disponíveis para todos os profissionais da clínica, evitando perguntas repetidas.

### Busca de pacientes

Use a barra de busca para encontrar pacientes por **nome**, **documento** ou **telefone**. A busca é rápida e não recarrega a página.

### Protocolos vinculados

Na ficha do paciente, há uma seção de **Tratamento estético** que mostra todos os protocolos ativos, o progresso de sessões e a próxima data prevista. Para inscrever o paciente em um protocolo, selecione-o no seletor e clique em **Inscrever**.

### Cadastro rápido pela recepção

Durante o atendimento, a equipe de recepção pode cadastrar pacientes diretamente na tela de recepção sem sair do fluxo. Veja a seção [Usando a Recepção](#5-usando-a-recepção).

---

## 5. Usando a Recepção

A recepção (`/clinic/reception`) é a central operacional do dia. Ela mostra a agenda em tempo real, a fila de espera, confirmações pendentes e permite criar agendamentos manuais.

> **Dica:** Para usuários com perfil **Recepção**, a fila interativa abre automaticamente ao entrar no sistema.

### Visão geral — métricas do dia

No topo da página você verá os números do dia:
- **Hoje:** total de atendimentos previstos
- **Confirmações:** pacientes que ainda não confirmaram presença
- **Fila:** pacientes com check-in aguardando chamada
- **Retorno:** pacientes aguardando pagamento e baixa
- **No-show:** faltas registradas no dia

### Busca e cadastro rápido de pacientes

No painel esquerdo da tela principal:
1. Digite nome, documento ou telefone na barra de busca e pressione **Enter** ou clique em **Buscar**.
2. Clique no paciente na lista para selecioná-lo (ele ficará destacado em azul).
3. Para cadastrar um novo paciente sem sair da recepção, preencha o **Cadastro rápido**:
   - Nome do paciente
   - Contato (obrigatório) e tipo (WhatsApp ou Telefone)
   - Data de nascimento e documento (opcional)
   - Observações (opcional)
4. Clique em **Cadastrar e selecionar** — o paciente já ficará selecionado para o próximo agendamento.

### Criar um novo agendamento manual

No painel direito (**Novo agendamento manual**):
1. Certifique-se de que um paciente está selecionado no painel esquerdo.
2. Preencha:
   - **Data** do atendimento
   - **Profissional**
   - **Protocolo** (opcional — se o paciente estiver inscrito em um protocolo)
   - **Procedimento estético** (obrigatório)
   - **Unidade** (opcional)
   - **Sala** (opcional)
3. Clique em **Buscar slots** — os horários disponíveis aparecerão agrupados por Manhã / Tarde / Noite.
4. Clique no slot desejado para confirmar o agendamento.

> **Dica:** Se selecionar um protocolo antes do procedimento, o sistema pré-seleciona o procedimento automaticamente e exibe o número de sessões e o intervalo sugerido.

### Fluxo completo de atendimento

O atendimento segue este ciclo de status:

```
BOOKED (agendado) 
  → CONFIRMED (confirmado)
    → CHECKED_IN (check-in feito)
      → [Profissional chama]
        → IN_PROGRESS (em atendimento)
          → AWAITING_PAYMENT (aguardando pagamento)
            → COMPLETED (concluído)
```

**Ações disponíveis para cada status:**

| Ação | Quando usar |
|------|-------------|
| **Confirmar** | O paciente confirmou que virá (por telefone ou WhatsApp) |
| **Check-in** | O paciente chegou e está na recepção |
| **Chamar / Ver ficha** | Abrir a ficha do atendimento e notificar o profissional |
| **Pagamento + baixa** | Após o procedimento, registrar o pagamento e encerrar |
| **Cancelar** | Cancelar o agendamento (motivo obrigatório) |
| **No-show** | Marcar falta quando o paciente não comparece |

### Agenda interativa (fila em tela cheia)

Clique em **Abrir fila** (ou **Abrir agenda interativa**) para entrar no modo de fila em tela cheia. Este modo é ideal para deixar fixo em uma tela na recepção.

Funcionalidades do modo fila:
- **Painel de chamada:** exibe o próximo paciente e o tempo de espera em destaque
- **Alerta de espera crítica:** aviso visual (vermelho) quando alguém espera mais de 20 minutos
- **Som de alerta:** clique em **Ativar som** para receber alerta sonoro em esperas críticas
- **Modo painel / Modo detalhado:** alterne para ver mais ou menos detalhes
- **Auto-sync:** a fila sincroniza automaticamente via WebSocket em tempo real
- **Atualizar fila:** clique para forçar uma sincronização manual

### Confirmações pendentes

O painel de **Confirmações** lista pacientes agendados que ainda não confirmaram. Para cada um, você pode:
- Clicar em **Confirmar** — registra a confirmação diretamente
- Clicar em **Ver ficha** — abrir os detalhes do agendamento

### Exportar agenda

Clique em **Exportar CSV** no cabeçalho da recepção para baixar a agenda do dia em formato planilha.

---

## 6. Protocolos de Tratamento

Protocolos são planos de tratamento com múltiplas sessões (ex.: "Microagulhamento Intensivo — 6 sessões a cada 21 dias"). Eles organizam a jornada do paciente ao longo do tempo.

> **Permissão necessária:** Apenas Admin ou Gestor podem criar e editar protocolos.

### Criar um protocolo (`/clinic/protocols`)

1. Acesse **Protocolos** no menu lateral.
2. No painel direito, preencha **Novo protocolo**:
   - **Procedimento estético:** selecione o procedimento base (deve estar cadastrado em Procedimentos estéticos)
   - **Nome do protocolo:** ex.: "Protocolo Peeling Químico 4 Sessões"
   - **Sessões totais:** número de sessões do tratamento completo (de 1 a 52)
   - **Intervalo (dias):** quantos dias entre cada sessão
   - **Descrição:** orientações para a equipe (opcional)
3. Marque **Protocolo ativo**.
4. Clique em **Criar protocolo**.

### Protocolos pré-configurados no demo

O ambiente de demonstração já vem com 5 protocolos criados:

| Protocolo | Sessões | Intervalo |
|-----------|---------|-----------|
| Tratamento Toxina Botulínica | 3 | 15 dias |
| Protocolo Preenchimento Facial | 2 | 7 dias |
| Microagulhamento Intensivo | 6 | 21 dias |
| PRP Capilar Completo | 4 | 30 dias |
| Harmonização Completa | 3 | 15 dias |

### Inscrever um paciente em um protocolo

A inscrição é feita na ficha do paciente:

1. Acesse **Pacientes** (`/clinic/patients`).
2. Clique no paciente na lista para abrir a ficha.
3. Na seção **Tratamento estético**, localize **Inscrever em protocolo**.
4. Selecione o protocolo no seletor e clique em **Inscrever**.
5. O sistema registra o início do tratamento e começa a rastrear o progresso das sessões.

### Acompanhar o progresso

Na ficha do paciente, a seção **Tratamento estético** mostra:
- Nome do protocolo e status (Ativo / Concluído / Cancelado)
- Progresso em barra: sessões concluídas / total planejado
- Data da próxima sessão prevista
- Previsão de conclusão do tratamento

Durante o agendamento na recepção, ao selecionar um paciente inscrito em um protocolo, o protocolo aparece como opção no formulário de novo agendamento, facilitando a criação das sessões seguintes.

---

## 7. App Mobile para Profissionais

O OperaClinic disponibiliza um aplicativo mobile para profissionais que precisam acompanhar a agenda pessoal sem estar na frente de um computador.

### Tecnologia

O app é desenvolvido em **Flutter**, disponível para iOS e Android.

### Como baixar

- **Android:** acesse a Play Store e busque por "OperaClinic Profissional" ou use o link QR Code enviado pela equipe de onboarding.
- **iOS:** acesse a App Store e busque por "OperaClinic Profissional" ou use o link enviado por e-mail.

> **Dica:** O link de download oficial será enviado no e-mail de boas-vindas. Use sempre o link oficial para garantir que está instalando a versão correta.

### Como conectar ao sistema da clínica

1. Abra o app após instalar.
2. Na tela de login, informe o e-mail e senha do usuário com perfil **Profissional**.
3. O app carrega automaticamente a agenda pessoal do profissional vinculado a esse login.

### O que o profissional vê no app

O espaço do profissional (`/clinic/professional`) apresenta:
- **Agenda do dia:** todos os atendimentos de hoje em ordem cronológica
- **Foco:** paciente chamado, atendimento em andamento, próximo da lista
- **Histórico recente:** atendimentos concluídos
- **Agenda futura:** próximos atendimentos agendados

### Ações disponíveis pelo app

O profissional pode, diretamente do app:
- Chamar o paciente para a sala
- Registrar início e fim do atendimento
- Indicar aguardando fechamento ou pagamento
- Registrar notas clínicas do atendimento (preparação da pele, intercorrências, orientações finais)

> **Dica:** O app sincroniza em tempo real com a recepção via WebSocket — quando o profissional chama um paciente, a recepção vê o status atualizado instantaneamente.

---

## 8. FAQ

**1. Esqueci a senha de acesso. O que faço?**
Na tela de login, clique em **Esqueci minha senha**. Você receberá um e-mail para redefinição. Se não encontrar o e-mail, verifique a caixa de spam ou entre em contato com o suporte.

**2. Não estou conseguindo ver determinado menu. Por que?**
O menu exibido depende do seu perfil. Recepcionistas não veem Financeiro ou Usuários, por exemplo. Verifique com o admin da clínica se o perfil do seu usuário está correto em **Usuários** (`/clinic/users`).

**3. O profissional não aparece na busca de slots ao criar um agendamento.**
O profissional precisa ter horários cadastrados vinculados a uma unidade. Acesse a ficha do profissional em **Profissionais** e configure os horários semanais.

**4. Como cancelo um agendamento?**
Na recepção, abra a ficha do agendamento clicando em **Ver ficha** ou localize o atendimento na agenda do dia e clique em **Cancelar**. Um motivo será solicitado — isso é obrigatório para manter o histórico.

**5. Como registrar que um paciente não compareceu?**
Localize o atendimento na agenda do dia ou na fila e clique em **No-show**. O sistema registra a falta sem exigir motivo.

**6. Posso ter mais de um número de WhatsApp conectado?**
No plano atual, cada clínica suporta uma conexão WhatsApp ativa. Se precisar de múltiplos números, entre em contato com o suporte para avaliar a configuração correta.

**7. Como saber se o WhatsApp está funcionando corretamente?**
Acesse **Integrações** (`/clinic/integrations`) e veja o painel **Pronto para piloto?**. Todos os itens devem estar verdes. Se algo estiver vermelho, o painel explica o que está faltando.

**8. O paciente pode se comunicar com a clínica pelo WhatsApp?**
Sim. Quando o WhatsApp estiver configurado, mensagens recebidas aparecem em **Mensagens** (`/clinic/messaging`) e no **Inbox** (`/clinic/inbox`). O Inbox mostra conversas que o agente de IA escalou para atendimento humano.

**9. Como exportar a lista de pacientes?**
Em **Pacientes**, clique em **Exportar CSV** no cabeçalho. Se quiser filtrar antes, use a busca e depois exporte — o CSV respeita o filtro ativo.

**10. Quero criar um protocolo de tratamento mas não vejo a opção. Por que?**
A criação de protocolos é restrita a Admin e Gestor. Se você for recepcionista ou profissional, solicite ao administrador da clínica que crie o protocolo. Para inscrever um paciente, também é necessário o papel de Admin, Gestor ou Recepcionista.

---

## 9. Suporte

Estamos aqui para garantir que sua clínica entre em operação sem fricção.

### Canais de atendimento

| Canal | Para que serve | Horário |
|-------|---------------|---------|
| **WhatsApp do suporte** | Dúvidas rápidas, erros urgentes | Seg–Sex, 9h–18h |
| **E-mail** | Solicitações não urgentes, envio de prints | A qualquer momento |
| **Videochamada (agendada)** | Treinamento da equipe, configuração assistida | Sob agendamento |

### O que enviar ao abrir um chamado

Para resolver mais rápido, inclua:
1. Qual tela você estava quando o problema aconteceu (URL ajuda muito)
2. O que você tentou fazer
3. O que aconteceu de fato (mensagem de erro, comportamento inesperado)
4. Print ou vídeo curto da tela, se possível

### Antes de chamar o suporte

Verifique:
- Tente atualizar a página (F5) — muitos problemas visuais se resolvem assim
- Confira se o usuário tem o perfil correto para a ação
- Em integrações, confira o painel de readiness — ele já identifica a maioria dos problemas de WhatsApp

> **Dica:** Guarde este documento em um local acessível para toda a equipe. Ele cobre os fluxos mais comuns e pode responder dúvidas sem precisar chamar o suporte.

---

*Versão: 1.0 — Junho de 2026*
