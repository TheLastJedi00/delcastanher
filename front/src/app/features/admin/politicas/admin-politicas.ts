import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Input } from '../../../shared/ui/input/input';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

/**
 * Aba "Politicas & Termos" do painel (Spec 022).
 *
 * Mora num componente proprio, como o `AdminFinanceiro`: a aba deixa de ser
 * maquete e ganha lista, editor, publicacao e historico, que nao cabem no
 * template do `AdminDashboard`.
 */
@Component({
  selector: 'app-admin-politicas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, Button, Card, Input, SectionHeader],
  templateUrl: './admin-politicas.html',
})
export class AdminPoliticas {
  readonly legalTab = signal<'termos' | 'privacidade'>('termos');
  readonly legalContent = signal('');

  setLegalTab(tab: 'termos' | 'privacidade') {
    this.legalTab.set(tab);
  }
}
