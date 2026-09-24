import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { signInForTest } from '../../../core/testing/session';
import { AdminLayout } from './admin-layout';

/**
 * Spec 011, Task 1.4.
 *
 * O bug original nao estava no AuthService: estava em o shell montar o header
 * sem bindar o output `logout`. Por isso o teste clica no botao renderizado,
 * em vez de chamar o servico — so o clique prova que o output esta ligado.
 */
describe('AdminLayout', () => {
  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => localStorage.clear());

  it('encerra a sessao ao clicar em "Sair" no cabecalho', () => {
    signInForTest('admin');
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBeTrue();

    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();

    const sair = fixture.debugElement
      .queryAll(By.css('a[href="/login"]'))
      .find(el => (el.nativeElement as HTMLElement).textContent?.includes('Sair'));

    expect(sair).withContext('o botao "Sair" precisa existir no painel').toBeDefined();
    sair!.triggerEventHandler('click', new MouseEvent('click'));
    fixture.detectChanges();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('delcastanher.has-session')).toBeNull();
  });

  it('encerra a sessao pelo "Sair" da sidebar', () => {
    signInForTest('admin');
    const auth = TestBed.inject(AuthService);

    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();

    const sidebar = fixture.debugElement.query(By.css('ui-sidebar'));
    sidebar.componentInstance.logout.emit();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('delcastanher.has-session')).toBeNull();
  });
});
