import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { signInForTest } from '../../../core/testing/session';
import { StudentLayout } from './layout';

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

  /** Spec 019, decisao 15. */
  it('leva a loja pela sidebar, depois de Artigos', () => {
    signInForTest('aluno');
    const fixture = TestBed.createComponent(StudentLayout);
    fixture.detectChanges();

    const links = fixture.componentInstance.links.map(link => link.link);

    expect(links.at(-1)).toBe('/loja');
    expect(links.indexOf('/loja')).toBe(links.indexOf('/ava/artigos') + 1);
    expect(fixture.nativeElement.querySelector('ui-sidebar a[href="/loja"]')).not.toBeNull();
  });

  it('encerra a sessao pelo "Sair" da sidebar', () => {
    signInForTest('aluno');
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBeTrue();

    const fixture = TestBed.createComponent(StudentLayout);
    fixture.detectChanges();

    const sidebar = fixture.debugElement.query(By.css('ui-sidebar'));
    sidebar.componentInstance.logout.emit();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('delcastanher.has-session')).toBeNull();
  });
});
