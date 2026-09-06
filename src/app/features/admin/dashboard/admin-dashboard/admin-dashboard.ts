import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AdminLayout, AdminTab } from '../../../../shared/layouts/admin-layout/admin-layout';
import { Avatar } from '../../../../shared/ui/avatar/avatar';
import { Badge } from '../../../../shared/ui/badge/badge';
import { Button } from '../../../../shared/ui/button/button';
import { Card } from '../../../../shared/ui/card/card';
import { Input } from '../../../../shared/ui/input/input';
import { PageContainer } from '../../../../shared/ui/page-container/page-container';
import { ProgressBar } from '../../../../shared/ui/progress-bar/progress-bar';
import { SectionHeader } from '../../../../shared/ui/section-header/section-header';
import { StatCard } from '../../../../shared/ui/stat-card/stat-card';

interface Student {
  id: number;
  name: string;
  email: string;
  initials: string;
  enrollmentDate: string;
  currentModule: number;
  progress: number;
}

@Component({
  selector: 'app-admin-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminLayout,
    PageContainer,
    SectionHeader,
    StatCard,
    Card,
    Input,
    Button,
    Badge,
    Avatar,
    ProgressBar,
  ],
  templateUrl: './admin-dashboard.html',
})
export class AdminDashboard {
  readonly activeTab = signal<AdminTab>('visao-geral');
  readonly search = signal('');
  readonly legalTab = signal<'termos' | 'privacidade'>('termos');

  readonly lessonTitle = signal('');
  readonly lessonVideoUrl = signal('');
  readonly emailSubject = signal('');
  readonly emailBody = signal('');
  readonly legalContent = signal('');

  readonly kpis = {
    sales: 'R$ 145.000',
    activeStudents: '248',
    engagementRate: '82%',
  };

  readonly students: Student[] = [
    { id: 1, name: 'Ana Silva', email: 'ana@empresa.com', initials: 'AS', enrollmentDate: '10/08/2026', currentModule: 3, progress: 25 },
    { id: 2, name: 'Carlos Santos', email: 'carlos@empresa.com', initials: 'CS', enrollmentDate: '12/08/2026', currentModule: 8, progress: 66 },
    { id: 3, name: 'Mariana Costa', email: 'mariana@empresa.com', initials: 'MC', enrollmentDate: '15/08/2026', currentModule: 1, progress: 8 },
    { id: 4, name: 'João Ferreira', email: 'joao@empresa.com', initials: 'JF', enrollmentDate: '20/08/2026', currentModule: 12, progress: 100 },
  ];

  /** Lista exibida na tabela, filtrada pelo campo de busca por nome ou e-mail. */
  readonly filteredStudents = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.students;
    return this.students.filter(
      s => s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term)
    );
  });

  setLegalTab(tab: 'termos' | 'privacidade') {
    this.legalTab.set(tab);
  }
}
