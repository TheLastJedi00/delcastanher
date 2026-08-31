import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-materiais',
  imports: [RouterLink],
  template: `
    <div class="p-6 md:p-8 max-w-5xl mx-auto w-full animate-fade-in">
      <a routerLink="/ava" class="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-brand-teal transition-colors mb-6">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        Voltar ao Hub
      </a>
      <h1 class="text-2xl font-bold text-brand-blue mb-6">Central de Materiais</h1>
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <p class="text-slate-600 mb-6">Encontre aqui todos os templates e planilhas disponibilizados nos módulos.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="#" class="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:border-brand-teal transition-colors group">
            <div class="w-10 h-10 bg-red-50 text-red-500 rounded flex items-center justify-center font-bold">PDF</div>
            <div>
              <p class="font-bold text-sm group-hover:text-brand-teal">Slides: O RH que sua empresa precisa</p>
              <p class="text-xs text-slate-500">Módulo 1 • 2.4 MB</p>
            </div>
          </a>
          <a href="#" class="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:border-brand-teal transition-colors group">
            <div class="w-10 h-10 bg-green-50 text-green-600 rounded flex items-center justify-center font-bold">XLS</div>
            <div>
              <p class="font-bold text-sm group-hover:text-brand-teal">Planilha de Diagnóstico Organizacional</p>
              <p class="text-xs text-slate-500">Módulo 2 • 850 KB</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  `
})
export class Materiais {}
