import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Student {
  id: number;
  name: string;
  email: string;
  enrollmentDate: string;
  currentModule: number;
  progress: number;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard {
  activeTab: 'visao-geral' | 'aulas' | 'comunicacao' | 'termos' = 'visao-geral';

  kpis = {
    sales: 'R$ 145.000',
    activeStudents: 248,
    engagementRate: '82%'
  };

  students: Student[] = [
    { id: 1, name: 'Ana Silva', email: 'ana@empresa.com', enrollmentDate: '10/08/2026', currentModule: 3, progress: 25 },
    { id: 2, name: 'Carlos Santos', email: 'carlos@empresa.com', enrollmentDate: '12/08/2026', currentModule: 8, progress: 66 },
    { id: 3, name: 'Mariana Costa', email: 'mariana@empresa.com', enrollmentDate: '15/08/2026', currentModule: 1, progress: 8 },
    { id: 4, name: 'João Ferreira', email: 'joao@empresa.com', enrollmentDate: '20/08/2026', currentModule: 12, progress: 100 },
  ];

  setTab(tab: 'visao-geral' | 'aulas' | 'comunicacao' | 'termos') {
    this.activeTab = tab;
  }
}
