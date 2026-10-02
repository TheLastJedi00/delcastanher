import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Descadastro } from './descadastro';

/** Spec 023, decisao B5. */
describe('Descadastro', () => {
  let fixture: ComponentFixture<Descadastro>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const confirmButton = () =>
    Array.from(el().querySelectorAll('button')).find(b => b.textContent?.includes('Confirmar descadastro')) as
      | HTMLButtonElement
      | undefined;

  function render(token: string | null): void {
    TestBed.configureTestingModule({
      imports: [Descadastro],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap(token ? { token } : {})) },
        },
      ],
    });

    fixture = TestBed.createComponent(Descadastro);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => backend.verify());

  // Um GET que descadastra seria disparado pelo antivirus que abre os links.
  it('abrir a página não descadastra ninguém', () => {
    render('dG9rZW4.assinatura');

    backend.expectNone(`${environment.apiUrl}/email/unsubscribe`);
    expect(confirmButton()).toBeDefined();
  });

  it('só descadastra no clique do botão, com o token do link', () => {
    render('dG9rZW4.assinatura');

    confirmButton()?.click();

    const request = backend.expectOne(`${environment.apiUrl}/email/unsubscribe`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: 'dG9rZW4.assinatura' });
    request.flush({ unsubscribed: true });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="descadastrado"]')?.textContent).toContain('Inscrição cancelada');
    expect(el().textContent).toContain('nota fiscal');
  });

  it('token recusado pela API mostra link inválido', () => {
    render('adulterado.x');

    confirmButton()?.click();
    backend
      .expectOne(`${environment.apiUrl}/email/unsubscribe`)
      .flush({ message: 'Link de descadastro invalido.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="link-invalido"]')).not.toBeNull();
  });

  it('sem token, diz que o link está incompleto e não oferece o botão', () => {
    render(null);

    expect(el().querySelector('[data-testid="link-invalido"]')).not.toBeNull();
    expect(confirmButton()).toBeUndefined();
  });

  it('falha de rede deixa tentar de novo', () => {
    render('dG9rZW4.assinatura');

    confirmButton()?.click();
    backend
      .expectOne(`${environment.apiUrl}/email/unsubscribe`)
      .flush(null, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    expect(el().textContent).toContain('Tente de novo');
    expect(confirmButton()).toBeDefined();
  });
});
