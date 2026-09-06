import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnimateOnScroll } from '../../shared/directives/animate-on-scroll';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { GlassCard } from '../../shared/ui/glass-card/glass-card';
import { ModuleCard } from '../../shared/ui/module-card/module-card';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

interface Pillar {
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NavHeader,
    Footer,
    Button,
    GlassCard,
    ModuleCard,
    SectionHeader,
    AnimateOnScroll,
  ],
  templateUrl: './landing.html',
})
export class Landing {
  readonly navLinks: NavLink[] = [
    { label: 'Método', href: '#metodo' },
    { label: 'A Mentora', href: '#mentora' },
    { label: 'Trilha', href: '#trilha' },
  ];

  readonly stats = [
    { value: '+20', label: 'Anos de Exp.' },
    { value: '+50', label: 'Empresas' },
    { value: '03', label: 'Setores' },
    { value: '01', label: 'Livro Publicado' },
  ];

  readonly pillars: Pillar[] = [
    {
      title: 'Pessoas',
      description:
        'Atração, seleção e retenção dos melhores talentos. O capital humano certo no lugar certo.',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    },
    {
      title: 'Processos',
      description:
        'Desenho de fluxos claros, eficientes e escaláveis, utilizando gestão baseada em dados e People Analytics.',
      icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
    },
    {
      title: 'Cultura',
      description:
        'A importância da segurança psicológica, comunicação assertiva e pertencimento das equipes.',
      icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    },
    {
      title: 'Resultados',
      description: 'Métricas e indicadores de RH. O alinhamento entre valores e as metas do negócio.',
      icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    },
  ];

  readonly curriculum = [
    'Fundamentos do RH Estratégico', 'Diagnóstico Organizacional', 'Recrutamento e Seleção',
    'Onboarding e Integração', 'Desenvolvimento e Treinamento', 'Gestão de Desempenho',
    'Clima e Cultura', 'Cargos e Salários', 'Relações Trabalhistas',
    'Comunicação Interna', 'Indicadores e Métricas', 'Plano de Ação Final',
  ];

  readonly partners = ['GRUPO FLEXÍVEL', 'JEC', 'AMCOM', 'MAGNA', 'GEOVENDAS', 'CRONUS'];
}
