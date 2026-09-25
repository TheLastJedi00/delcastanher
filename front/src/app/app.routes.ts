import { Routes } from '@angular/router';
import { accessGuard } from './core/guards/access.guard';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';
import { PLANS_META } from './core/mocks/plans.mock';
import { DEFAULT_SEO, SEO_DATA_KEY, courseSeoResolver, privateSeo } from './core/services/seo-route';
import { FULL_HEIGHT_DATA_KEY } from './core/services/layout-route';

/**
 * Metadados por rota (Spec 009, decisao 8): quem aplica e o `App`, num unico
 * ponto por `NavigationEnd`. Rota sem `seo` cai no padrao da marca — e rota
 * privada declara `noindex` explicitamente.
 */
export const routes: Routes = [
  {
    path: '',
    data: { [SEO_DATA_KEY]: DEFAULT_SEO },
    loadComponent: () => import('./features/landing/landing').then(m => m.Landing),
  },
  {
    path: 'cursos/:slug',
    // Resolver: as campanhas apontam para cada slug, entao o snippet muda com
    // o produto — e slug fora do catalogo sai como `noindex` (decisao 7).
    resolve: { [SEO_DATA_KEY]: courseSeoResolver },
    loadComponent: () => import('./features/course-detail/course-detail').then(m => m.CourseDetail),
  },
  {
    path: 'planos',
    data: {
      [SEO_DATA_KEY]: { title: PLANS_META.title, description: PLANS_META.description },
    },
    loadComponent: () => import('./features/plans/plans').then(m => m.Plans),
  },
  {
    // Portal publico de validacao (Spec 008): quem verifica um diploma e um
    // recrutador sem conta, entao a rota fica fora dos guards.
    path: 'certificado/verificar',
    data: {
      [SEO_DATA_KEY]: {
        title: 'Validar certificado | Delcastanher',
        description:
          'Confira a autenticidade de um certificado emitido pela Delcastanher informando o código de validação.',
      },
    },
    loadComponent: () =>
      import('./features/certificado-verificar/certificado-verificar').then(
        m => m.CertificadoVerificar,
      ),
  },
  {
    // Paginas legais (Spec 009): publicas, indexaveis e linkadas do rodape —
    // exigir login para ler os termos que regem o servico nao faria sentido.
    path: 'termos-de-uso',
    data: {
      [SEO_DATA_KEY]: {
        title: 'Termos de Uso | Delcastanher',
        description:
          'Condições que regem o acesso e o uso da plataforma Delcastanher, dos cursos e da área do aluno.',
      },
    },
    loadComponent: () => import('./features/legal/termos-de-uso').then(m => m.TermosDeUso),
  },
  {
    path: 'politica-de-privacidade',
    data: {
      [SEO_DATA_KEY]: {
        title: 'Política de Privacidade | Delcastanher',
        description:
          'Como a Delcastanher coleta, utiliza, armazena, compartilha e protege dados pessoais, em conformidade com a LGPD, e quais direitos você pode exercer sobre eles.',
      },
    },
    loadComponent: () =>
      import('./features/legal/politica-de-privacidade').then(m => m.PoliticaDePrivacidade),
  },
  {
    path: 'politica-de-cookies',
    data: {
      [SEO_DATA_KEY]: {
        title: 'Política de Cookies | Delcastanher',
        description:
          'Quais cookies a plataforma Delcastanher usa, para que servem e como revisar a sua escolha a qualquer momento.',
      },
    },
    loadComponent: () =>
      import('./features/legal/politica-de-cookies').then(m => m.PoliticaDeCookies),
  },
  {
    path: 'login',
    // Quem ja tem sessao vai para a propria area em vez de ver o formulario de
    // novo (Spec 019, decisao 16).
    canActivate: [guestGuard],
    data: {
      [SEO_DATA_KEY]: {
        title: 'Entrar | Delcastanher',
        description: 'Acesse a área do aluno da Delcastanher.',
        // A tela de login nao disputa busca organica e nao deve aparecer na
        // SERP concorrendo com a vitrine.
        indexable: false,
      },
    },
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, onboardingGuard],
    data: { [SEO_DATA_KEY]: privateSeo('Onboarding') },
    loadComponent: () => import('./features/onboarding/onboarding').then(m => m.Onboarding),
  },
  {
    // Loja de modulos (Spec 014). Pos-login e pos-onboarding, e **sem** o
    // `accessGuard`: e justamente aqui que chega quem ainda nao comprou nada
    // (decisao 19). `noindex` porque e area interna.
    path: 'loja',
    canActivate: [authGuard, onboardingGuard],
    data: { [SEO_DATA_KEY]: privateSeo('Loja de módulos') },
    // Spec 019, decisao 15: a loja mora no mesmo shell do AVA. Solta, ela era
    // uma pagina sem sidebar nem cabecalho, e o aluno que saia da trilha para
    // comprar so voltava ao painel digitando a URL. O `path` continua `loja`:
    // e por ele que o `authGuard` decide o papel, e mudar a arvore sem mante-lo
    // aqui reabriria o laco `/ava` -> `/loja` da Spec 014.
    loadComponent: () => import('./features/student/layout/layout').then(m => m.StudentLayout),
    loadChildren: () => import('./features/loja/loja.routes').then(m => m.LOJA_ROUTES),
  },
  {
    path: 'ava',
    canActivate: [authGuard, onboardingGuard],
    data: { [SEO_DATA_KEY]: privateSeo('Ambiente do Aluno') },
    loadComponent: () => import('./features/student/layout/layout').then(m => m.StudentLayout),
    children: [
      // O `accessGuard` vai nas filhas, e nao no pai: `perfil` fica de fora
      // dele de proposito (decisao 19) — corrigir os proprios dados e exercer
      // os direitos da Spec 009 nao podem depender de ter comprado algo.
      {
        path: '',
        canActivate: [accessGuard],
        loadComponent: () => import('./features/student/hub/hub').then(m => m.Hub),
      },
      // A trilha e a unica tela do AVA que ocupa a altura util e rola por
      // dentro (dois paineis). As demais crescem com o conteudo.
      {
        path: 'trilha',
        canActivate: [accessGuard],
        data: { [FULL_HEIGHT_DATA_KEY]: true },
        loadComponent: () => import('./features/student/trilha/trilha').then(m => m.Trilha),
      },
      // Deep-link do "retomar de onde parou": a trilha abre direto no modulo,
      // na primeira aula em aberto dele.
      {
        path: 'trilha/:moduleId',
        canActivate: [accessGuard],
        data: { [FULL_HEIGHT_DATA_KEY]: true },
        loadComponent: () => import('./features/student/trilha/trilha').then(m => m.Trilha),
      },
      // Forma completa desde a Spec 012 (decisao 9). As duas acima continuam
      // validas — link salvo, e-mail e historico do navegador nao quebram.
      // A altura cheia vale para as tres: e a mesma tela.
      {
        path: 'trilha/:moduleId/:lessonId',
        canActivate: [accessGuard],
        data: { [FULL_HEIGHT_DATA_KEY]: true },
        loadComponent: () => import('./features/student/trilha/trilha').then(m => m.Trilha),
      },
      { path: 'certificado', canActivate: [accessGuard], loadComponent: () => import('./features/student/certificado/certificado').then(m => m.Certificado) },
      { path: 'perfil', loadComponent: () => import('./features/perfil/perfil').then(m => m.Perfil) },
      { path: 'materiais', canActivate: [accessGuard], loadComponent: () => import('./features/student/materiais/materiais').then(m => m.Materiais) },
      { path: 'artigos', canActivate: [accessGuard], loadComponent: () => import('./features/student/artigos/artigos').then(m => m.Artigos) }
    ]
  },
  {
    path: 'admin',
    // O adminGuard e explicito na rota (Spec 010, decisao 13): daqui saem as
    // URLs assinadas de escrita no bucket, e a exigencia de papel nao deve
    // depender de lembrar de um mapa em outro arquivo.
    canActivate: [authGuard, adminGuard, onboardingGuard],
    data: { [SEO_DATA_KEY]: privateSeo('Administração') },
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/dashboard/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./features/admin/perfil/admin-perfil').then(m => m.AdminPerfil),
      }
    ]
  },
  {
    // Ate a Spec 009 isto era `redirectTo: ''`, que respondia qualquer URL
    // inexistente com a landing: conteudo duplicado e visitante sem pista de
    // que errou o link (decisao 7).
    path: '**',
    data: {
      [SEO_DATA_KEY]: {
        title: 'Página não encontrada | Delcastanher',
        description: 'O endereço acessado não existe na plataforma Delcastanher.',
        indexable: false,
      },
    },
    loadComponent: () => import('./features/not-found/not-found').then(m => m.NotFound),
  },
];
