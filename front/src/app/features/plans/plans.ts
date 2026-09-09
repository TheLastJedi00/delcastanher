import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { PLANS_META, PLAN_BENEFITS, PLANS, Plan } from '../../core/mocks/plans.mock';
import { AnimateOnScroll } from '../../shared/directives/animate-on-scroll';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader, NavLink } from '../../shared/ui/nav-header/nav-header';
import { PlanCard, PlanCardBenefit } from '../../shared/ui/plan-card/plan-card';
import { SectionHeader } from '../../shared/ui/section-header/section-header';

/** Plano do mock ja com a lista comparavel montada para o card. */
interface PlanView extends Plan {
  benefits: PlanCardBenefit[];
}

@Component({
  selector: 'app-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NavHeader, Footer, Button, PlanCard, SectionHeader, AnimateOnScroll],
  templateUrl: './plans.html',
})
export class Plans {
  protected readonly navLinks: NavLink[] = [
    { label: 'Planos', href: '#planos' },
    { label: 'Dúvidas', href: '#duvidas' },
    { label: 'Início', href: '/', routerLink: '/' },
  ];

  /**
   * Todo card recebe a lista completa de PLAN_BENEFITS na mesma ordem, marcando
   * o que esta incluso. E isso que permite comparar os planos lado a lado: o
   * beneficio ausente aparece riscado em vez de sumir da lista.
   */
  protected readonly plans = computed<PlanView[]>(() =>
    PLANS.map(plan => ({
      ...plan,
      benefits: PLAN_BENEFITS.map(label => ({
        label,
        included: plan.included.includes(label),
      })),
    }))
  );

  constructor() {
    // /planos e destino de campanha: titulo e descricao ficam com o mock,
    // junto do resto do conteudo comercial da pagina.
    inject(Title).setTitle(PLANS_META.title);
    inject(Meta).updateTag({ name: 'description', content: PLANS_META.description });
  }
}
