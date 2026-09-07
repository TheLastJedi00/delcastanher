# Plano de Tarefas - Especificação 004: Autenticação

## Fase 1: Configuração do Backend (Firebase API)
- [ ] **Task 1.1:** Acessar a pasta `api` e instalar a biblioteca `firebase-admin` (caso não esteja presente).
- [ ] **Task 1.2:** Estruturar a configuração e inicialização do Firebase Admin SDK no NestJS, utilizando as credenciais já presentes no `.env` (`FIREBASE_WEB_API_KEY` e `FIREBASE_SERVICE_ACCOUNT_JSON`), garantindo que não seja necessário configurar o projeto no Firebase do zero.
- [ ] **Task 1.3:** Criar o `AuthModule` e o `AuthService`, centralizando a lógica de autenticação e comunicação com os serviços do Firebase.
- [ ] **Task 1.4:** Criar o `AuthController` contendo a rota principal de acesso (ex: `/auth/login` ou `/auth/verify`) que processará a requisição e retornará a validação adequada para o front.

## Fase 2: Implementação Visual do Frontend (Loading Screen)
- [ ] **Task 2.1:** Acessar o projeto Frontend (`front/src`) e configurar um componente de **Loading Fullscreen** ou adaptar o estado no próprio componente da página de Login.
- [ ] **Task 2.2:** Aplicar o estilo estrutural do contêiner do loading para sobrepor toda a tela, utilizando as classes utilitárias do Tailwind: `fixed inset-0 z-50 flex items-center justify-center`.
- [ ] **Task 2.3:** Aplicar o efeito de fundo desfocado com transparência, utilizando `backdrop-blur-sm bg-white/50`, garantindo a leitura leve da interface que ficará atrás.
- [ ] **Task 2.4:** Incluir a **Animação do Logotipo** central, referenciando o componente `ui-logo` ou a imagem original (`assets/logo-delcastanher.svg`) e aplicando uma classe de rotação em loop constante (ex: `animate-spin` do Tailwind).
- [ ] **Task 2.5:** Integrar a reatividade de estado no formulário de login (ex: variável `isLoading`), garantindo que a tela de loading só seja ativada durante a requisição de login e desativada ao receber a resposta final.

## Fase 3: Fluxo de Criação de Conta
- [ ] **Task 3.1:** Adicionar um botão/link "Criar nova conta" na tela de Login.
- [ ] **Task 3.2:** Implementar um formulário modal que é aberto ao clicar em "Criar nova conta".
- [ ] **Task 3.3:** Incluir no modal dois campos de entrada para o email (ex: `email` e `confirmEmail`) e implementar validação no front-end para garantir que ambos os valores sejam idênticos antes do envio.
- [ ] **Task 3.4:** Integrar a submissão do modal com o Firebase Auth (via frontend SDK ou API do backend) para enviar o link de definição de senha para o email fornecido, configurando a `actionUrl` para a tela de login.
- [ ] **Task 3.5:** (Opcional/Backend) Se implementado via API, criar a rota/função correspondente no `AuthController` e `AuthService` para despachar o email pelo Firebase Admin SDK com as `ActionCodeSettings` corretas.

## Fase 4: Scripts Administrativos
- [ ] **Task 4.1:** Criar um script avulso (no backend ou em um diretório `scripts`) com acesso ao Firebase Admin SDK.
- [ ] **Task 4.2:** Implementar no script uma função para promover um usuário a administrador, que deverá buscar o usuário pelo e-mail fornecido e atribuir uma *custom claim* (ex: `setCustomUserClaims(uid, { admin: true })`).
- [ ] **Task 4.3:** Implementar no mesmo script (ou em um separado) a funcionalidade para revogar o acesso de administrador (remover ou alterar a *custom claim* do usuário).
