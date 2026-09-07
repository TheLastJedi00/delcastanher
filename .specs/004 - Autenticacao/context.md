# Especificação de Requisitos (Autenticação) - Imersão RH Estratégico

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Especialista:** Lidiane Delcastanher
**Autor da Especificação:** Leno Borges

## 1. Visão Geral e Objetivos do Projeto

O objetivo desta especificação é focar na implementação da camada de autenticação real do sistema, substituindo dados simulados. Ela abrange a configuração da API backend para validação e login via Firebase Auth, além dos ajustes visuais no front-end para otimizar a experiência e fornecer um feedback visual elegante ao usuário durante o acesso.

## 2. Requisitos de Backend (API)

A implementação da autenticação no backend usará o NestJS, validando as credenciais de acesso via integração com o Firebase.

**Requisitos Funcionais:**

- **Módulo de Autenticação:** Criação do módulo (`AuthModule`), serviço (`AuthService`) e controller (`AuthController`) responsáveis pela lógica e rotação de login.
- **Configuração do Firebase Auth:** O ambiente (arquivo `.env`) já conta com as variáveis `FIREBASE_WEB_API_KEY` e `FIREBASE_SERVICE_ACCOUNT_JSON`. O backend deve inicializar o Firebase Admin SDK através dessas variáveis sem a necessidade de criar a conta do zero.
- **Rota de Autenticação:** Uma rota, por exemplo `/auth/login`, deverá receber, processar e validar o acesso do usuário utilizando os métodos providos pelo Firebase Auth (validação de token e etc).
- **Criação de Conta (Firebase Auth):** Implementar funcionalidade para envio de email ao usuário visando a definição da senha. O fluxo deverá utilizar o Firebase Auth, configurando a `actionUrl` no template de e-mail para que, após definir a senha, o usuário seja redirecionado de volta para a tela de login.
- **Scripts de Administração (Custom Claims):** Desenvolver um script para gerenciar privilégios administrativos dos usuários de forma programática. O script deve receber o email do usuário e permitir promovê-lo a administrador (concedendo uma custom claim, ex: `{ admin: true }`) ou revogar o acesso de administrador (removendo a custom claim) através do Firebase Admin SDK.

## 3. Requisitos de Frontend (Loading Visual e Interface)

As modificações de frontend visam adequar o fluxo de acesso a um ambiente de carregamento moderno.

**Requisitos Funcionais e Visuais:**

- **Tela de Carregamento (Loading):** Implementação de um loading de tela cheia (fullscreen) que será ativado na página de Login, impedindo interações indesejadas enquanto a requisição de login está em andamento.
- **Feedback Visual (Animação):** O loading não deve ser um spinner comum, e sim o próprio logotipo da plataforma girando. A animação deve estar no componente `ui-logo` ou referenciando a imagem `logo-delcastanher.svg` em loop (`animate-spin`).
- **Aspecto do Fundo (Background Blur):** O painel do loading (contêiner base) precisa aplicar uma sobreposição desfocada ao fundo do login com transparência branca (`backdrop-blur-sm bg-white/50`), mantendo o design limpo e fluido da interface original.
- **Fluxo de Criação de Conta:**
  - Adicionar na tela de login a opção de "Criar nova conta".
  - A ação de criar conta abrirá um formulário modal.
  - O modal terá campos para preencher o email com dupla validação (ex: "Email" e "Confirme seu Email") para garantir que o email digitado está correto.
  - Ao submeter, o sistema usará o Firebase Auth para enviar um email ao usuário, que receberá um link para definir sua senha inicial e ser redirecionado para o login (via `actionUrl`).
