import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-perfil',
  imports: [RouterLink],
  template: `
    <div class="p-6 md:p-8 max-w-3xl mx-auto w-full animate-fade-in">
      <a routerLink="/ava" class="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-brand-teal transition-colors mb-6">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        Voltar ao Hub
      </a>
      <h1 class="text-2xl font-bold text-brand-blue mb-6">Meu Perfil</h1>
      <div class="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <form class="flex flex-col gap-6">
          <div class="flex items-center gap-6 mb-4">
            <div class="w-24 h-24 bg-brand-teal rounded-full text-white flex items-center justify-center font-bold text-2xl shadow-sm">LD</div>
            <button type="button" class="text-sm font-bold text-brand-teal hover:underline">Alterar foto</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Nome Completo</label>
              <input type="text" value="Lidiane Delcastanher" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-teal">
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">E-mail</label>
              <input type="email" value="lidiane@delcastanher.com" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-teal">
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Cargo / Empresa</label>
            <input type="text" value="CEO - Delcastanher Serviços" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-teal">
          </div>
          <div class="flex justify-end mt-4">
            <button type="button" class="px-6 py-2 bg-brand-teal text-white rounded-lg hover:bg-teal-700 font-bold transition-colors shadow-sm">Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class Perfil {}
