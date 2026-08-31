# Plano de Tarefas - MVP: Imersão RH Estratégico

## Fase 1: Configuração Inicial e Estruturação (Setup)
- [ ] **Task 1.1:** Inicializar o projeto Frontend (Angular - porta 4200) e Backend (Node.js - porta 3000), caso o backend seja necessário para mock avançado.
- [ ] **Task 1.2:** Configurar o framework de CSS (ex: Tailwind CSS ou SCSS) e definir as variáveis da paleta de cores da marca (Azul Marinho, Verde-Água, tons claros).
- [ ] **Task 1.3:** Configurar a estrutura de pastas do projeto e o roteamento principal (Rotas públicas vs. Rotas privadas).
- [ ] **Task 1.4:** Estruturar os serviços/arquivos de mock de dados (mocks para Alunos, Progresso, KPIs, Módulos).

## Fase 2: Landing Page (Página de Vendas e Apresentação)
- [ ] **Task 2.1:** Desenvolver a **Hero Section** (Título de impacto, foto da especialista e botão CTA).
- [ ] **Task 2.2:** Desenvolver a **Seção de Autoridade** (Apresentação da Lidiane Delcastanher e trajetória).
- [ ] **Task 2.3:** Desenvolver as seções de **Proposta de Valor** (Pilares) e **Prova Social** (Logotipos de parceiros).
- [ ] **Task 2.4:** Desenvolver a seção de **Grade Curricular** (Listagem visual dos 12 módulos).
- [ ] **Task 2.5:** Desenvolver o **Rodapé (Footer)** e realizar os testes de responsividade em dispositivos móveis e desktop.

## Fase 3: Autenticação (Login) e Roteamento
- [ ] **Task 3.1:** Desenvolver a interface da página de Login (formulário com E-mail, Senha e CTA).
- [ ] **Task 3.2:** Desenvolver a tela/modal de recuperação de senha ("Esqueci minha senha").
- [ ] **Task 3.3:** Implementar a lógica de roteamento condicional (Auth Guard) com login mockado (redirecionando para AVA se aluno, e Dashboard se admin).

## Fase 4: Ambiente Virtual do Aluno (AVA)
- [ ] **Task 4.1:** Desenvolver o Layout Base do AVA (Shell), contendo a área central e a **Navegação Estruturada (Sidebar)** responsiva com a trilha de 12 módulos.
- [ ] **Task 4.2:** Implementar os indicadores de **Controle de Progresso** (barras e ícones de concluído) na Sidebar e cabeçalhos.
- [ ] **Task 4.3:** Desenvolver o **Player de Conteúdo** (área de vídeo) e a seção de **Detalhes da Aula** (título, tema, resultado esperado).
- [ ] **Task 4.4:** Desenvolver a **Central de Materiais** para download de recursos (PDFs, templates).
- [ ] **Task 4.5:** Integrar os mocks de aulas e materiais no AVA e testar a fluidez do consumo de conteúdo.

## Fase 5: Dashboard Administrativo (Visão Exclusiva)
- [ ] **Task 5.1:** Desenvolver o Layout Base do Dashboard (Shell Admin) e navegação.
- [ ] **Task 5.2:** Implementar os cards de **Indicadores Chave (KPIs)** (Vendas, Alunos ativos, Taxa de engajamento).
- [ ] **Task 5.3:** Desenvolver a interface da **Gestão de Alunos**, com tabela ou listagem incluindo as informações individuais e barra de progresso.
- [ ] **Task 5.4:** Implementar os **Gráficos de Desempenho** utilizando biblioteca de gráficos (ex: Chart.js ou Ng2-Charts) integrados aos dados mockados.

## Fase 6: Revisão e Validação Final
- [ ] **Task 6.1:** Revisão completa de responsividade (Mobile First) de todas as interfaces e fluxos.
- [ ] **Task 6.2:** Validação de aderência à paleta de cores, contraste (UI/UX) e comportamento dos dados mockados.
