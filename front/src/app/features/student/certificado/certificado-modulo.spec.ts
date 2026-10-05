import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { StudentCertificate } from '../../../core/services/certificate.service';
import { CertificadoModulo } from './certificado-modulo';

const MODULES_URL = `${environment.apiUrl}/certificates/me/modules`;

const MODULE_CERTIFICATE: StudentCertificate = {
  code: 'DELC-MODU-2345',
  hash: 'a'.repeat(64),
  scope: 'module',
  studentName: 'Aluno Teste',
  courseTitle: 'Imersão RH Estratégico',
  moduleTitle: 'Módulo 1: Fundamentos',
  moduleId: 'm1',
  summary: 'O que separa o RH operacional do RH que participa da estratégia.',
  workloadHours: 6,
  issuedAt: '2026-09-11T12:00:00.000Z',
  status: 'ACTIVE',
};

describe('CertificadoModulo (Spec 023, Parte D)', () => {
  let fixture: ComponentFixture<CertificadoModulo>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  async function create(moduleId: string, certificates: StudentCertificate[]) {
    await TestBed.configureTestingModule({
      imports: [CertificadoModulo],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ moduleId })) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CertificadoModulo);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    backend.expectOne(MODULES_URL).flush(certificates);
    fixture.detectChanges();
  }

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('mostra a folha do diploma do modulo da rota, pronta para imprimir', async () => {
    await create('m1', [MODULE_CERTIFICATE]);

    expect(text()).toContain('Módulo 1: Fundamentos');
    expect(text()).toContain('6 horas');
    expect(text()).toContain('DELC-MODU-2345');
    expect(el().querySelector('.print-area ui-certificado')).not.toBeNull();
  });

  it('aciona a impressao nativa', async () => {
    await create('m1', [MODULE_CERTIFICATE]);
    const print = spyOn(window, 'print');

    Array.from(el().querySelectorAll('button'))
      .find(button => button.textContent?.includes('Baixar / imprimir'))
      ?.click();

    expect(print).toHaveBeenCalled();
  });

  it('modulo sem diploma emitido manda de volta para a trilha', async () => {
    await create('m2', [MODULE_CERTIFICATE]);

    expect(text()).toContain('Diploma ainda não emitido');
    expect(el().querySelector('ui-certificado')).toBeNull();
    expect(
      Array.from(el().querySelectorAll('a')).some(
        anchor => anchor.getAttribute('href') === '/ava/trilha/m2',
      ),
    ).toBe(true);
  });

  it('mostra o erro da API', async () => {
    await TestBed.configureTestingModule({
      imports: [CertificadoModulo],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ moduleId: 'm1' })) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CertificadoModulo);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    backend
      .expectOne(MODULES_URL)
      .flush({ message: 'Falha ao carregar.' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('Falha ao carregar.');
  });
});
