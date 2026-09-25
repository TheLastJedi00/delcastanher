import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavHeader } from './nav-header';

/** Spec 019, decisao 16. */
describe('NavHeader', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NavHeader], providers: [provideRouter([])] });
  });

  function render(authenticated?: boolean): HTMLElement {
    const fixture = TestBed.createComponent(NavHeader);

    if (authenticated !== undefined) {
      fixture.componentRef.setInput('authenticated', authenticated);
    }

    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  it('mostra "Área do Aluno" para o visitante', () => {
    const element = render();

    expect(element.textContent).toContain('Área do Aluno');
    expect(element.textContent).not.toContain('Ir para o meu painel');
  });

  it('mostra "Ir para o meu painel" com sessao, sem mudar o destino', () => {
    const element = render(true);

    expect(element.textContent).toContain('Ir para o meu painel');
    expect(element.querySelector('a[href="/login"]')).not.toBeNull();
  });
});
