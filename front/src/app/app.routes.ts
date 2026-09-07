import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then(m => m.Landing),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/onboarding/onboarding').then(m => m.Onboarding),
  },
  {
    path: 'ava',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/student/layout/layout').then(m => m.StudentLayout),
    children: [
      { path: '', loadComponent: () => import('./features/student/hub/hub').then(m => m.Hub) },
      { path: 'trilha', loadComponent: () => import('./features/student/trilha/trilha').then(m => m.Trilha) },
      { path: 'perfil', loadComponent: () => import('./features/student/perfil/perfil').then(m => m.Perfil) },
      { path: 'materiais', loadComponent: () => import('./features/student/materiais/materiais').then(m => m.Materiais) },
      { path: 'artigos', loadComponent: () => import('./features/student/artigos/artigos').then(m => m.Artigos) }
    ]
  },
  {
    path: 'admin',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./features/admin/dashboard/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard),
  },
  { path: '**', redirectTo: '' }
];
