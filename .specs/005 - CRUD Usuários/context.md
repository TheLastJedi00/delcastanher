# Especificação de Requisitos (CRUD Usuários) - Imersão RH Estratégico

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Especialista:** Lidiane Delcastanher
**Autor da Especificação:** Leno Borges

## 1. Visão Geral e Objetivos do Projeto

O objetivo desta especificação é introduzir a persistência de dados utilizando o banco de dados Neon, integrado via Prisma ORM. O foco desta etapa é estabelecer o CRUD de Usuários e implementar o fluxo de Onboarding obrigatório no primeiro acesso, capturando os dados de perfil da conta.

As variáveis de ambiente do banco Neon já encontram-se previamente configuradas no ambiente (Vercel).

## 2. Requisitos de Backend (API)

A persistência será orquestrada via Prisma integrado ao framework NestJS.

**Requisitos Funcionais:**

- **Configuração do Prisma e Neon:**
  - Inicializar o Prisma no projeto (instalação de dependências e `prisma init`).
  - Configurar a conexão com o Neon Database utilizando a URL disponibilizada através das variáveis de ambiente.
  - Criação do serviço `PrismaService` para abstrair e expor o Prisma Client como injeção de dependência global no backend.

- **Modelagem de Dados (Schema):**
  - Criação do model `User` no arquivo `schema.prisma`.
  - Campos esperados no model: `id` (chave primária, preferencialmente vinculada ao UID fornecido pelo Firebase), `email`, `name`, `bio`, `phone`, `linkedin` (opcional), `onboardingCompleted` (booleano com default `false`), `createdAt` e `updatedAt`.
  - Geração do Prisma Client e execução das migrations para refletir o schema no Neon.

- **Módulo de Usuários (CRUD):**
  - Criação da arquitetura para a entidade de usuário contendo `UsersModule`, `UsersService` e `UsersController`.
  - **Rota GET (Perfil):** Para retornar os dados do usuário autenticado no momento e verificar seu status de onboarding.
  - **Rota PUT/PATCH (Atualização e Onboarding):** Para atualizar os dados do perfil, utilizada primariamente na submissão do formulário de Onboarding.

## 3. Requisitos de Frontend (Interface e Guards)

As modificações de frontend visam criar a barreira do Onboarding e permitir o preenchimento e consumo dos dados do perfil salvos no banco.

**Requisitos Funcionais e Visuais:**

- **Tela de Onboarding (Primeiro Acesso):**
  - Criação de uma interface dedicada para o Onboarding contendo um formulário limpo, responsivo e alinhado à identidade visual da plataforma.
  - Campos do formulário:
    - Nome Completo (obrigatório)
    - Bio / Resumo Profissional (obrigatório)
    - Telefone (obrigatório)
    - LinkedIn (opcional)
  - Integração do formulário com a rota de atualização de usuário da API. O sucesso da requisição concluirá o onboarding.

- **Implementação do Guard (Onboarding Guard):**
  - Criação de um *Route Guard* (ou interceptor de rota) no Angular para proteger rotas internas do sistema (dashboard, player de aulas, etc).
  - A lógica do Guard deverá checar se o usuário possui a flag de onboarding como verdadeira (`onboardingCompleted: true`).
  - Se o usuário estiver autenticado, mas a flag estiver falsa ou os dados estiverem ausentes, o Guard deve bloquear o acesso à rota e forçar o redirecionamento imediato para a tela de Onboarding. Isso garante que **inclusive usuários pré-existentes** preencham a base de dados.

- **Sincronização Pós-Login:**
  - Após o sucesso na etapa de validação do Firebase Auth, o frontend deverá buscar as informações atualizadas do usuário no próprio backend (Neon) para alimentar os "estados" globais da aplicação e permitir a verificação do Guard.

- **Integração de Leitura (Dashboard e Meu Perfil):**
  - A tela de **Dashboard** e a tela de **Meu Perfil** deverão consumir os dados salvos para exibir informações dinâmicas do registro do aluno (operação de *read*).
  - A interface deverá utilizar esses dados para personalizar a experiência da plataforma, como, por exemplo, saudar o aluno pelo nome preenchido no banco de dados.
