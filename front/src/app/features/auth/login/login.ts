import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CreateAccountModal } from '../create-account-modal/create-account-modal';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Input } from '../../../shared/ui/input/input';
import { LoadingOverlay } from '../../../shared/ui/loading-overlay/loading-overlay';
import { Logo } from '../../../shared/ui/logo/logo';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, Button, Input, BackLink, LoadingOverlay, CreateAccountModal],
  templateUrl: './login.html',
})
export class Login {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly showRecover = signal(false);
  readonly email = signal('');
  readonly password = signal('');
  readonly recoverEmail = signal('');
  readonly recoverSent = signal(false);

  /** Controla a abertura do formulario modal de criacao de conta. */
  readonly showCreateAccount = signal(false);

  /** Bloqueia a tela enquanto a requisicao de login esta em andamento. */
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  readonly canSubmit = computed(
    () => this.email().trim().length > 0 && this.password().length > 0 && !this.isLoading(),
  );

  openCreateAccount() {
    this.showCreateAccount.set(true);
  }

  closeCreateAccount() {
    this.showCreateAccount.set(false);
  }

  toggleRecover() {
    this.showRecover.update(v => !v);
    this.recoverSent.set(false);
    this.errorMessage.set('');
  }

  doLogin() {
    if (!this.canSubmit()) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.auth.login(this.email(), this.password()).subscribe({
      next: () => {
        this.isLoading.set(false);
        void this.router.navigateByUrl(this.auth.homeUrl());
      },
      error: (message: string) => {
        this.isLoading.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  sendRecover() {
    this.recoverSent.set(true);
  }
}
