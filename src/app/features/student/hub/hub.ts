import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-hub',
  imports: [RouterLink],
  template: `
    <div class="p-6 md:p-8 max-w-6xl mx-auto w-full animate-fade-in-up">
      <div class="mb-10 text-center md:text-left">
        <h1 class="text-3xl font-bold text-brand-blue mb-2">Bem-vindo(a) ao seu Hub de Aprendizado</h1>
        <p class="text-slate-600">O que você deseja fazer hoje?</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <!-- Meu Perfil -->
        <a routerLink="/ava/perfil" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-brand-teal transition-all group flex flex-col items-center text-center hover:-translate-y-1">
          <div class="w-16 h-16 bg-slate-50 text-brand-blue rounded-full flex items-center justify-center mb-4 group-hover:bg-brand-blue group-hover:text-white transition-colors">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
          </div>
          <h2 class="font-bold text-lg text-brand-blue mb-2">Meu Perfil</h2>
          <p class="text-sm text-slate-500">Atualize seus dados pessoais e preferências.</p>
        </a>

        <!-- Trilha de Estudos -->
        <a routerLink="/ava/trilha" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-brand-teal transition-all group flex flex-col items-center text-center hover:-translate-y-1">
          <div class="w-16 h-16 bg-teal-50 text-brand-teal rounded-full flex items-center justify-center mb-4 group-hover:bg-brand-teal group-hover:text-white transition-colors">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
          </div>
          <h2 class="font-bold text-lg text-brand-blue mb-2">Trilha de Estudos</h2>
          <p class="text-sm text-slate-500">Continue de onde parou. Acesso aos 12 módulos.</p>
        </a>

        <!-- Materiais de Apoio -->
        <a routerLink="/ava/materiais" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-brand-teal transition-all group flex flex-col items-center text-center hover:-translate-y-1">
          <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          </div>
          <h2 class="font-bold text-lg text-brand-blue mb-2">Materiais de Apoio</h2>
          <p class="text-sm text-slate-500">Baixe planilhas, PDFs e ferramentas práticas.</p>
        </a>

        <!-- Artigos -->
        <a routerLink="/ava/artigos" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-brand-teal transition-all group flex flex-col items-center text-center hover:-translate-y-1">
          <div class="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
          </div>
          <h2 class="font-bold text-lg text-brand-blue mb-2">Artigos</h2>
          <p class="text-sm text-slate-500">Leituras complementares sobre gestão e RH.</p>
        </a>

      </div>
    </div>
  `
})
export class Hub {}
