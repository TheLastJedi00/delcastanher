import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { environment } from '../../../environments/environment';
import { CertificadoVerificar } from './certificado-verificar';

const VERIFY_URL = (code: string) =>
  `${environment.apiUrl}/certificates/verify/${encodeURIComponent(code)}`;

const VALID = {
  status: 'valid',
  certificate: {
    code: 'DELC-ABCD-2345',
    scope: 'course',
    moduleTitle: null,
    studentName: 'Lidiane Delcastanher',
    courseTitle: 'Imersão RH Estratégico',
    workloadHours: null,
    issuedAt: '2026-09-10T12:00:00.000Z',
  },
};

const VALID_MODULE = {
  status: 'valid',
  certificate: {
    code: 'DELC-MODU-2345',
    scope: 'module',
    studentName: 'Lidiane Delcastanher',
    courseTitle: 'Imersão RH Estratégico',
    moduleTitle: 'Módulo 1: Fundamentos do RH',
    workloadHours: null,
    issuedAt: '2026-09-10T12:00:00.000Z',
  },
};

describe('CertificadoVerificar', () => {
  let fixture: ComponentFixture<CertificadoVerificar>;
  // Opcional de proposito: o teste da rota publica nao monta TestBed, e o
  // Karma sorteia a ordem — sem isso o afterEach quebra quando ele vem antes
  // do primeiro `create()`.
  let backend: HttpTestingController | undefined;

  /** Backend do teste corrente; so faz sentido depois de `create()`. */
  const http = () => backend as HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const field = () => el().querySelector('input') as HTMLInputElement;
  const submit = () => {
    (el().querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  const type = (value: string) => {
    const input = field();

    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /** `codigo` simula a chegada pelo link impresso no diploma. */
  const create = async (codigo: string | null = null) => {
    await TestBed.configureTestingModule({
      imports: [CertificadoVerificar],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: (key: string) => (key === 'codigo' ? codigo : null) } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CertificadoVerificar);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  afterEach(() => {
    backend?.verify();
    backend = undefined;
    TestBed.resetTestingModule();
  });

  it('a rota publica nao tem guard nenhum', () => {
    const route = routes.find(candidate => candidate.path === 'certificado/verificar');

    expect(route).toBeDefined();
    expect(route?.canActivate).toBeUndefined();
    expect(route?.canMatch).toBeUndefined();
  });

  it('nao faz nenhuma chamada antes de o visitante pedir', async () => {
    await create();

    // Sem requisicao pendente: a tela abre inerte, sem exigir sessao.
    http().expectNone(() => true);
    expect(text()).toContain('Confira a autenticidade');
  });

  it('cobra o codigo antes de consultar', async () => {
    await create();

    submit();

    expect(text()).toContain('Informe o código completo');
  });

  it('exibe os dados do aluno quando o certificado e valido', async () => {
    await create();
    type('DELC-ABCD-2345');
    submit();

    http().expectOne(VERIFY_URL('DELC-ABCD-2345')).flush(VALID);
    fixture.detectChanges();

    const rendered = text();

    expect(rendered).toContain('Certificado válido');
    expect(rendered).toContain('Lidiane Delcastanher');
    expect(rendered).toContain('Imersão RH Estratégico');
    expect(rendered).toContain('10/09/2026');
    // Carga horaria ainda pendente no comercial: placeholder, nao um numero.
    expect(rendered).toContain('[CARGA HORÁRIA]');
  });

  it('anuncia o diploma do curso completo no escopo course', async () => {
    await create();
    type('DELC-ABCD-2345');
    submit();

    http().expectOne(VERIFY_URL('DELC-ABCD-2345')).flush(VALID);
    fixture.detectChanges();

    expect(text()).toContain('curso completo');
    expect(text()).not.toContain('Módulo');
  });

  it('mostra o modulo certificado quando o escopo e module', async () => {
    await create();
    type('DELC-MODU-2345');
    submit();

    http().expectOne(VERIFY_URL('DELC-MODU-2345')).flush(VALID_MODULE);
    fixture.detectChanges();

    const rendered = text();

    // Quem verifica precisa saber que aquilo nao e o curso inteiro.
    expect(rendered).toContain('de módulo');
    expect(rendered).toContain('Módulo 1: Fundamentos do RH');
    expect(rendered).toContain('Imersão RH Estratégico');
  });

  it('nao exibe PII nem id interno em nenhum dos escopos', async () => {
    await create();
    type('DELC-MODU-2345');
    submit();

    http().expectOne(VERIFY_URL('DELC-MODU-2345')).flush(VALID_MODULE);
    fixture.detectChanges();

    const rendered = text();

    expect(rendered).not.toContain('@');
    expect(rendered).not.toContain('uid-');
  });

  it('explica a revogacao no estado invalido', async () => {
    await create();
    type('DELC-ABCD-2345');
    submit();

    http().expectOne(VERIFY_URL('DELC-ABCD-2345')).flush({ status: 'invalid', reason: 'revoked' });
    fixture.detectChanges();

    expect(text()).toContain('Certificado inválido');
    expect(text()).toContain('revogado');
  });

  it('distingue dados adulterados de certificado revogado', async () => {
    await create();
    type('DELC-ABCD-2345');
    submit();

    http().expectOne(VERIFY_URL('DELC-ABCD-2345')).flush({ status: 'invalid', reason: 'tampered' });
    fixture.detectChanges();

    expect(text()).toContain('não conferem com o registro original');
  });

  it('diz que o codigo nao existe em vez de tratar como erro', async () => {
    await create();
    type('DELC-ZZZZ-9999');
    submit();

    http().expectOne(VERIFY_URL('DELC-ZZZZ-9999')).flush({ status: 'not_found' });
    fixture.detectChanges();

    expect(text()).toContain('Código não encontrado');
  });

  it('envia o codigo como digitado, sem normalizar de novo no front', async () => {
    await create();
    type('  delc abcd 2345 ');
    submit();

    const request = http().expectOne(VERIFY_URL('delc abcd 2345'));

    expect(request.request.method).toBe('GET');
    request.flush({ status: 'not_found' });
  });

  it('nao manda Authorization: a consulta e anonima', async () => {
    await create();
    type('DELC-ABCD-2345');
    submit();

    const request = http().expectOne(VERIFY_URL('DELC-ABCD-2345'));

    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(VALID);
  });

  it('trata a falha de comunicacao com opcao de tentar de novo', async () => {
    await create();
    type('DELC-ABCD-2345');
    submit();

    http()
      .expectOne(VERIFY_URL('DELC-ABCD-2345'))
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    fixture.detectChanges();

    expect(text()).toContain('Não foi possível verificar agora');
    expect(text()).toContain('Tentar novamente');
  });

  it('verifica direto quando o codigo chega pela URL do diploma', async () => {
    await create('DELC-ABCD-2345');

    expect(field().value).toBe('DELC-ABCD-2345');

    http().expectOne(VERIFY_URL('DELC-ABCD-2345')).flush(VALID);
    fixture.detectChanges();

    expect(text()).toContain('Certificado válido');
  });
});
