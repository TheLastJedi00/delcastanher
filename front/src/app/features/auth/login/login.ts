import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { Button } from '../../../shared/ui/button/button';
import { Input } from '../../../shared/ui/input/input';
import { Logo } from '../../../shared/ui/logo/logo';

type Role = 'aluno' | 'admin';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, Button, Input, BackLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly router = inject(Router);

  readonly showRecover = signal(false);
  readonly role = signal<Role>('aluno');
  readonly email = signal('');
  readonly password = signal('');
  readonly recoverEmail = signal('');
  readonly recoverSent = signal(false);

  toggleRecover() {
    this.showRecover.update(v => !v);
    this.recoverSent.set(false);
  }

  setRole(role: Role) {
    this.role.set(role);
  }

  doLogin() {
    const role = this.role();
    localStorage.setItem('role', role);
    this.router.navigate([role === 'aluno' ? '/ava' : '/admin']);
  }

  sendRecover() {
    this.recoverSent.set(true);
  }
}
