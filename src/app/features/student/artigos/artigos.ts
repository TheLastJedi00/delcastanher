import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-artigos',
  imports: [RouterLink],
  template: `
    <div class="p-6 md:p-8 max-w-5xl mx-auto w-full animate-fade-in">
      <a routerLink="/ava" class="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-brand-teal transition-colors mb-6">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        Voltar ao Hub
      </a>
      <h1 class="text-2xl font-bold text-brand-blue mb-6">Artigos e Leituras Recomenadadas</h1>
      <div class="grid grid-cols-1 gap-6">
        <a href="#" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow group">
          <img src="assets/aula2.jpeg" class="w-full md:w-48 h-32 object-cover rounded-lg">
          <div>
            <h2 class="text-xl font-bold text-brand-blue mb-2 group-hover:text-brand-teal transition-colors">Como estruturar um plano de cargos e salários sem engessar a empresa</h2>
            <p class="text-slate-600 text-sm mb-4">Descubra os passos fundamentais para criar uma matriz salarial que motive os colaboradores e respeite o caixa da empresa...</p>
            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Leitura: 5 min</span>
          </div>
        </a>
        <a href="#" class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow group">
          <img src="assets/aula3.jpeg" class="w-full md:w-48 h-32 object-cover rounded-lg">
          <div>
            <h2 class="text-xl font-bold text-brand-blue mb-2 group-hover:text-brand-teal transition-colors">People Analytics: Onde começar?</h2>
            <p class="text-slate-600 text-sm mb-4">Aprenda a analisar os dados do seu RH para prever turnover e identificar potenciais líderes na sua organização...</p>
            <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Leitura: 8 min</span>
          </div>
        </a>
      </div>
    </div>
  `
})
export class Artigos {}
