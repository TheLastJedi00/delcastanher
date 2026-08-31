import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-student-layout',
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="h-screen flex overflow-hidden font-sans text-slate-800 bg-brand-light">
      
      <!-- Overlay para mobile -->
      <div 
        class="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
        [class.opacity-100]="isExpanded()"
        [class.pointer-events-auto]="isExpanded()"
        [class.opacity-0]="!isExpanded()"
        [class.pointer-events-none]="!isExpanded()"
        (click)="toggle()">
      </div>

      <!-- Aside expansível -->
      <aside 
        class="bg-brand-blue text-white transition-all duration-300 flex flex-col z-50 h-full shadow-xl fixed md:relative md:translate-x-0"
        [class.w-64]="isExpanded()" 
        [class.w-16]="!isExpanded()"
        [class.-translate-x-full]="!isExpanded()"
        [class.translate-x-0]="isExpanded()"
      >
        <!-- Toggle / Header do Aside -->
        <div class="flex items-center p-4 h-[65px] border-b border-white/10" [class.justify-between]="isExpanded()" [class.justify-center]="!isExpanded()">
          @if (isExpanded()) {
            <span class="font-bold text-lg whitespace-nowrap overflow-hidden">Menu</span>
          }
          <button (click)="toggle()" class="p-1 hover:bg-white/10 rounded">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>

        <!-- Links de Navegação -->
        <nav class="flex-1 overflow-y-auto py-4 flex flex-col gap-2 px-2">
          
          <a routerLink="/ava" class="flex items-center gap-4 p-2 rounded-lg hover:bg-white/10 transition-colors" title="Home Hub" (click)="closeOnMobile()">
            <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
            @if (isExpanded()) { <span class="whitespace-nowrap">Home Hub</span> }
          </a>

          <a routerLink="/ava/perfil" class="flex items-center gap-4 p-2 rounded-lg hover:bg-white/10 transition-colors" title="Meu Perfil" (click)="closeOnMobile()">
            <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            @if (isExpanded()) { <span class="whitespace-nowrap">Meu Perfil</span> }
          </a>

          <a routerLink="/ava/trilha" class="flex items-center gap-4 p-2 rounded-lg hover:bg-white/10 transition-colors" title="Trilha de Estudos" (click)="closeOnMobile()">
            <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
            @if (isExpanded()) { <span class="whitespace-nowrap">Trilha de Estudos</span> }
          </a>

          <a routerLink="/ava/materiais" class="flex items-center gap-4 p-2 rounded-lg hover:bg-white/10 transition-colors" title="Materiais de Apoio" (click)="closeOnMobile()">
            <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            @if (isExpanded()) { <span class="whitespace-nowrap">Materiais</span> }
          </a>

          <a routerLink="/ava/artigos" class="flex items-center gap-4 p-2 rounded-lg hover:bg-white/10 transition-colors" title="Artigos" (click)="closeOnMobile()">
            <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
            @if (isExpanded()) { <span class="whitespace-nowrap">Artigos</span> }
          </a>
        </nav>

        <!-- Sair -->
        <div class="p-2 border-t border-white/10">
          <a routerLink="/login" class="flex items-center gap-4 p-2 rounded-lg hover:bg-red-500/20 text-red-300 hover:text-red-400 transition-colors" title="Sair">
            <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            @if (isExpanded()) { <span class="whitespace-nowrap font-bold">Sair</span> }
          </a>
        </div>
      </aside>

      <!-- Conteúdo principal -->
      <main class="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <!-- Header minimalista só para mobile e logotipo -->
        <nav class="bg-white border-b border-slate-100 flex-shrink-0 h-[65px] flex items-center px-4 justify-between sticky top-0 z-30 shadow-sm">
          <div class="flex items-center gap-3">
            <button class="md:hidden p-1 text-slate-600 hover:text-brand-blue" (click)="toggle()">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
            <a routerLink="/ava" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="assets/logo.jpg" alt="Delcastanher Logo" class="h-8 object-contain rounded-md shadow-sm">
              <span class="font-bold text-brand-blue hidden sm:block">Ambiente do Aluno</span>
            </a>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium hidden sm:block text-slate-600">Lidiane Delcastanher</span>
            <div class="w-8 h-8 bg-brand-teal rounded-full text-white flex items-center justify-center font-bold shadow-sm text-xs">LD</div>
          </div>
        </nav>
        
        <div class="flex-1 flex flex-col min-h-0 relative">
          <router-outlet></router-outlet>
        </div>
      </main>
    </div>
  `
})
export class StudentLayout {
  isExpanded = signal(false);

  toggle() {
    this.isExpanded.update(v => !v);
  }

  closeOnMobile() {
    if (window.innerWidth < 768) {
      this.isExpanded.set(false);
    }
  }
}
