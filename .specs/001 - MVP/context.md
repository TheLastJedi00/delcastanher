# Especificação de Requisitos (MVP) - Imersão RH Estratégico

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Especialista:** Lidiane Delcastanher
**Autor da Especificação:** Leno Borges

## 1. Visão Geral e Objetivos do Projeto

O objetivo deste MVP (Minimum Viable Product) é projetar e validar as interfaces de uma plataforma educacional para a "Imersão RH Estratégico". O projeto visa encapsular a experiência da especialista Lidiane Delcastanher em um curso online interativo, focado em ensinar a estruturação de um RH do zero através de metodologias, ferramentas e materiais de apoio.

O MVP deverá contar com dados mockados (simulados) em tela para demonstrar o fluxo completo do usuário, englobando atração (Landing Page), acesso (Login), consumo de conteúdo (Ambiente do Aluno) e gestão de resultados (Dashboard Admin).

## 2. Arquitetura de Funcionalidades e Requisitos (Features)

A plataforma será estruturada em 4 áreas principais, cada uma com objetivos e requisitos bem definidos:

### 2.1. Landing Page (Página de Vendas e Apresentação)

**Objetivo:** Atrair, informar e converter visitantes em alunos, estabelecendo a autoridade da especialista e o valor do curso.

**Requisitos Funcionais e Visuais:**

- **Hero Section:** Título de impacto focado na estruturação de RH, acompanhado de uma foto profissional da especialista e um botão de CTA (Call to Action) em destaque para inscrição/compra.
- **Seção de Autoridade:** Apresentação da Lidiane Delcastanher, destacando sua trajetória (+20 anos de experiência, CEO da Delcastanher Serviços Administrativos, coautora do livro "Trajetória e Cotidiano dos Líderes do Brasil").
- **Proposta de Valor:** Destaque para os pilares do método (Pessoas, Processos, Cultura e Resultados).
- **Prova Social:** Área dedicada à exibição de logotipos de empresas parceiras ou que já passaram por imersões (ex: Grupo Flexível, JEC, Amcom, Magna).
- **Grade Curricular:** Listagem visual dos 12 módulos que compõem a imersão.
- **Rodapé (Footer):** Links para redes sociais, contatos institucionais e um link de acesso (Login) para quem já é aluno.

### 2.2. Autenticação (Login)

**Objetivo:** Prover uma porta de entrada segura para o ambiente restrito, roteando o usuário de acordo com seu perfil.

**Requisitos Funcionais:**

- Formulário de entrada contendo campos para E-mail e Senha.
- Opção de "Esqueci minha senha" para recuperação de acesso.
- Redirecionamento inteligente: após o login simulado, o sistema deve direcionar para o Ambiente Virtual do Aluno (se perfil aluno) ou para o Dashboard Admin (se perfil administrador).

### 2.3. Ambiente Virtual do Aluno (AVA)

**Objetivo:** Entregar uma experiência de aprendizado fluida, intuitiva e livre de distrações, permitindo o acompanhamento claro do progresso.

**Requisitos Funcionais:**

- **Navegação Estruturada (Sidebar):** Menu lateral contendo a trilha completa de aprendizado com os 12 módulos:
  1. Fundamentos do RH Estratégico
  2. Diagnóstico Organizacional
  3. Recrutamento e Seleção
  4. Onboarding e Integração
  5. Desenvolvimento e Treinamento
  6. Gestão de Desempenho
  7. Clima e Cultura
  8. Cargos e Salários
  9. Relações Trabalhistas
  10. Comunicação Interna
  11. Indicadores e Métricas
  12. Plano de Ação Final
- **Controle de Progresso:** Indicadores visuais (ex: barras de progresso, ícones de "concluído") mostrando o avanço do aluno por aula e por módulo.
- **Player de Conteúdo (Área Central):** Espaço para reprodução das videoaulas.
- **Detalhes da Aula:** Abaixo do player, exibição do título da aula, tema abordado e o resultado esperado. (Exemplo Módulo 1: "Aula 1 - O RH que sua empresa realmente precisa / Visão estratégica e papel do RH").
- **Central de Materiais:** Área de apoio para download de recursos complementares da aula selecionada (arquivos PDF, planilhas de diagnóstico, templates de documentos).

### 2.4. Dashboard Administrativo (Visão Exclusiva)

**Objetivo:** Fornecer à especialista (Admin) uma visão gerencial e analítica sobre vendas, engajamento e status dos alunos.

**Requisitos Funcionais:**

- **Indicadores Chave (KPIs):** Cards superiores mostrando dados consolidados simulados:
  - Total de Vendas / Faturamento.
  - Número de Alunos Ativos na plataforma.
  - Taxa Média de Engajamento ou Conclusão do curso.
- **Gestão de Alunos (Tabela/Listagem):** Uma interface em lista detalhando os dados individuais de cada usuário matriculado, contendo:
  - Nome e E-mail do aluno.
  - Data da matrícula.
  - Módulo atualmente em curso.
  - Barra de progresso individual (%).
- **Gráficos de Desempenho:** Representações visuais (gráficos de linha/barra simulados) indicando o volume de acessos na plataforma e a evolução das turmas ao longo do tempo.

## 3. Diretrizes de UX/UI e Identidade Visual

- **Identidade da Marca:** O design deve estar estritamente alinhado à marca Delcastanher.
- **Paleta de Cores:** Utilização predominante de Azul Marinho (transmitindo autoridade, liderança e confiança) e Verde-Água/Teal (transmitindo humanização, inovação e conexão), presentes no logotipo.
- **Fundos e Contrastes:** Uso de tons claros e neutros (branco, cinza claro) no Ambiente do Aluno e Dashboard para garantir uma leitura confortável e foco nos dados e vídeos.
- **Responsividade (Mobile First):** Todas as interfaces, especialmente a Landing Page e o Ambiente do Aluno, devem ser projetadas para adaptação perfeita em dispositivos móveis, tablets e desktops.