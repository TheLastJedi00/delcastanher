import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Module {
  id: number;
  title: string;
  completed: boolean;
}

@Component({
  selector: 'app-trilha',
  imports: [RouterLink],
  templateUrl: './trilha.html',
  styleUrl: './trilha.scss',
})
export class Trilha {
  modules: Module[] = [
    { id: 1, title: 'Fundamentos do RH Estratégico', completed: true },
    { id: 2, title: 'Diagnóstico Organizacional', completed: true },
    { id: 3, title: 'Recrutamento e Seleção', completed: false },
    { id: 4, title: 'Onboarding e Integração', completed: false },
    { id: 5, title: 'Desenvolvimento e Treinamento', completed: false },
    { id: 6, title: 'Gestão de Desempenho', completed: false },
    { id: 7, title: 'Clima e Cultura', completed: false },
    { id: 8, title: 'Cargos e Salários', completed: false },
    { id: 9, title: 'Relações Trabalhistas', completed: false },
    { id: 10, title: 'Comunicação Interna', completed: false },
    { id: 11, title: 'Indicadores e Métricas', completed: false },
    { id: 12, title: 'Plano de Ação Final', completed: false }
  ];

  activeModule: Module = this.modules[2]; // Currently learning

  get progressPercentage(): number {
    return Math.round((this.modules.filter(m => m.completed).length / this.modules.length) * 100);
  }

  setActiveModule(mod: Module) {
    this.activeModule = mod;
  }
}
