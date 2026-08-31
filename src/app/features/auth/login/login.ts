import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private router = inject(Router);

  showRecover = false;

  toggleRecover() {
    this.showRecover = !this.showRecover;
  }

  doLogin(type: 'aluno' | 'admin') {
    // Mock login and redirect
    if (type === 'aluno') {
      localStorage.setItem('role', 'aluno');
      this.router.navigate(['/ava']);
    } else {
      localStorage.setItem('role', 'admin');
      this.router.navigate(['/admin']);
    }
  }
}
