import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-student-layout',
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="min-h-screen flex flex-col font-sans text-slate-800 bg-brand-light">
      <!-- Header do Aluno -->
      <nav class="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <a routerLink="/ava" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="assets/logo.jpg" alt="Delcastanher Logo" class="h-8 object-contain rounded-md shadow-sm">
            <span class="font-bold text-brand-blue hidden sm:block">Ambiente do Aluno</span>
          </a>
          <div class="flex items-center gap-4">
            <a routerLink="/ava" class="text-sm font-medium text-slate-600 hover:text-brand-teal">Hub</a>
            <span class="text-sm font-medium hidden sm:block border-l border-slate-200 pl-4">Lidiane Delcastanher</span>
            <div class="w-10 h-10 bg-brand-teal rounded-full text-white flex items-center justify-center font-bold shadow-sm">LD</div>
            <a routerLink="/login" class="text-sm font-bold text-red-500 hover:text-red-700 ml-2">Sair</a>
          </div>
        </div>
      </nav>
      <!-- Conteúdo principal -->
      <main class="flex-1 flex flex-col">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class StudentLayout {}
