import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Input } from '../../../shared/ui/input/input';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

@Component({
  selector: 'app-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, BackLink, SectionHeader, Card, Avatar, Input, Button],
  template: `
    <ui-page-container maxWidth="sm">
      <div class="mb-6">
        <ui-back-link />
      </div>

      <div class="mb-6">
        <ui-section-header overline="Sua conta" title="Meu Perfil" />
      </div>

      <ui-card variant="default" padding="lg" [hover]="false">
        <form (submit)="$event.preventDefault(); save()" class="flex flex-col gap-6">
          <div class="flex items-center gap-6">
            <ui-avatar initials="LD" size="lg" />
            <ui-button variant="ghost" size="sm">Alterar foto</ui-button>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ui-input label="Nome Completo" [(value)]="name" />
            <ui-input label="E-mail" type="email" [(value)]="email" />
          </div>

          <ui-input label="Cargo / Empresa" [(value)]="role" />

          @if (saved()) {
            <p class="rounded-xl bg-state-success/10 px-4 py-3 text-sm font-medium text-state-success">
              Alterações salvas.
            </p>
          }

          <div class="flex justify-end">
            <ui-button variant="primary" type="submit">Salvar Alterações</ui-button>
          </div>
        </form>
      </ui-card>
    </ui-page-container>
  `,
})
export class Perfil {
  readonly name = signal('Lidiane Delcastanher');
  readonly email = signal('lidiane@delcastanher.com');
  readonly role = signal('CEO - Delcastanher Serviços');
  readonly saved = signal(false);

  save() {
    this.saved.set(true);
  }
}
