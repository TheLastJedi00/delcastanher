import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { MaterialItem, FileType } from '../../../shared/ui/material-item/material-item';
import { ModuleCard } from '../../../shared/ui/module-card/module-card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { VideoPlayer } from '../../../shared/ui/video-player/video-player';

interface Module {
  id: number;
  title: string;
  completed: boolean;
}

interface Material {
  fileName: string;
  fileType: FileType;
  fileSize: string;
}

@Component({
  selector: 'app-trilha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackLink,
    Badge,
    Button,
    Card,
    MaterialItem,
    ModuleCard,
    ProgressBar,
    VideoPlayer,
  ],
  templateUrl: './trilha.html',
})
export class Trilha {
  readonly modules = signal<Module[]>([
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
    { id: 12, title: 'Plano de Ação Final', completed: false },
  ]);

  readonly activeModuleId = signal(3);
  readonly showMobileModules = signal(false);

  readonly activeModule = computed(
    () => this.modules().find(m => m.id === this.activeModuleId()) ?? this.modules()[0]
  );

  readonly progress = computed(() => {
    const all = this.modules();
    return Math.round((all.filter(m => m.completed).length / all.length) * 100);
  });

  readonly materials: Material[] = [
    { fileName: 'Apresentação da Aula', fileType: 'pdf', fileSize: '2.4 MB' },
    { fileName: 'Checklist de Diagnóstico', fileType: 'xls', fileSize: '850 KB' },
  ];

  setActiveModule(id: number) {
    this.activeModuleId.set(id);
    this.showMobileModules.set(false);
  }

  toggleMobileModules() {
    this.showMobileModules.update(v => !v);
  }

  toggleCompleted() {
    const id = this.activeModuleId();
    this.modules.update(list =>
      list.map(m => (m.id === id ? { ...m, completed: !m.completed } : m))
    );
  }
}
