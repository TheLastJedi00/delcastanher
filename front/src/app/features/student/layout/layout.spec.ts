import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { StudentLayout } from './layout';

function signIn(): void {
  localStorage.setItem(
    'delcastanher.session',
    JSON.stringify({
      idToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: { uid: 'uid-123', email: 'aluno@delcastanher.com', name: 'Aluno', role: 'aluno' },
    }),
  );
}

/**
 * Spec 011, Task 1.4.
 *
 * O AVA tinha o mesmo defeito do painel. Sem este teste, o "Sair" daqui volta
 * a apenas navegar, e quem entrasse em seguida no mesmo navegador continuaria
 * na sessao da pessoa anterior.
 */
describe('StudentLayout', () => {
  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.clear());

  it('encerra a sessao pelo "Sair" da sidebar', () => {
    signIn();
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBeTrue();

    const fixture = TestBed.createComponent(StudentLayout);
    fixture.detectChanges();

    const sidebar = fixture.debugElement.query(By.css('ui-sidebar'));
    sidebar.componentInstance.logout.emit();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('delcastanher.session')).toBeNull();
  });
});
