import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { StudentCertificate } from '../../../core/services/certificate.service';
import { CourseProgress } from '../../../core/services/progress.service';
import { Certificado } from './certificado';

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;
const CERTIFICATE_URL = `${environment.apiUrl}/certificates/me`;

const MODULES = [
  { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo 1', completed: false },
  { id: 'm2', order: 2, title: 'Diagnóstico', summary: 'Resumo 2', completed: false },
  { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo 3', completed: false },
];

function progress(completedIds: string[]): CourseProgress {
  const modules = MODULES.map(module => ({
    ...module,
    completed: completedIds.includes(module.id),
  }));
  const completedCount = modules.filter(module => module.completed).length;

  return {
    course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
    modules,
    completedCount,
    totalCount: modules.length,
    percentage: Math.round((completedCount / modules.length) * 100),
    nextModule: modules.find(module => !module.completed) ?? null,
    completed: completedCount === modules.length,
  };
}

const CERTIFICATE: StudentCertificate = {
  code: 'DELC-ABCD-2345',
  hash: 'f'.repeat(64),
  studentName: 'Lidiane Delcastanher',
  courseTitle: 'Imersão RH Estratégico',
  workloadHours: null,
  issuedAt: '2026-09-10T12:00:00.000Z',
  status: 'ACTIVE',
};

describe('Certificado', () => {
  let fixture: ComponentFixture<Certificado>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const buttonWith = (label: string) =>
    Array.from(el().querySelectorAll('button')).find(button =>
      button.textContent?.includes(label),
    ) as HTMLButtonElement | undefined;

  const create = async () => {
    await TestBed.configureTestingModule({
      imports: [Certificado],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Certificado);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  /** Responde as duas cargas da tela: progresso e certificado. */
  const respond = (body: CourseProgress, certificate: StudentCertificate | null = null) => {
    backend.expectOne(PROGRESS_URL).flush(body);
    fixture.detectChanges();
    backend.expectOne(CERTIFICATE_URL).flush(certificate);
    fixture.detectChanges();
  };

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  describe('trilha incompleta', () => {
    it('nao emite e diz quantos modulos faltam', async () => {
      await create();
      respond(progress(['m1']));

      expect(text()).toContain('ainda não está liberado');
      expect(text()).toContain('Faltam 2 módulos');
      expect(buttonWith('Emitir certificado')).toBeUndefined();
    });

    it('usa o singular quando falta um unico modulo', async () => {
      await create();
      respond(progress(['m1', 'm2']));

      expect(text()).toContain('Falta 1 módulo');
    });

    it('oferece o link para continuar no modulo em aberto', async () => {
      await create();
      respond(progress(['m1']));

      expect(
        Array.from(el().querySelectorAll('a')).some(
          anchor => anchor.getAttribute('href') === '/ava/trilha/m2',
        ),
      ).toBe(true);
    });
  });

  describe('trilha concluida sem certificado', () => {
    it('oferece a emissao', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']));

      expect(text()).toContain('Trilha concluída');
      expect(buttonWith('Emitir certificado')).toBeDefined();
    });

    it('emite pela API e passa a exibir o diploma', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']));

      buttonWith('Emitir certificado')?.click();
      fixture.detectChanges();

      const request = backend.expectOne(CERTIFICATE_URL);

      expect(request.request.method).toBe('POST');
      request.flush(CERTIFICATE);
      fixture.detectChanges();

      expect(text()).toContain('Lidiane Delcastanher');
    });

    it('mostra o erro de negocio devolvido pela API', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']));

      buttonWith('Emitir certificado')?.click();
      fixture.detectChanges();

      backend
        .expectOne(CERTIFICATE_URL)
        .flush({ message: 'Conclua todos os modulos.' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text()).toContain('Conclua todos os modulos.');
    });
  });

  describe('certificado emitido', () => {
    it('exibe todas as variaveis obrigatorias do diploma', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']), CERTIFICATE);

      const rendered = text();

      expect(rendered).toContain('Lidiane Delcastanher');
      expect(rendered).toContain('Imersão RH Estratégico');
      expect(rendered).toContain('10/09/2026');
      expect(rendered).toContain('DELC-ABCD-2345');
      expect(rendered).toContain(CERTIFICATE.hash);
      // Carga horaria e assinatura ainda pendentes: tratamento de placeholder,
      // nunca um numero ou uma rubrica inventada.
      expect(rendered).toContain('[CARGA HORÁRIA]');
      expect(rendered).toContain('[ASSINATURA DA COORDENAÇÃO]');
    });

    it('exibe a carga horaria quando o curso ja tem o dado', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']), { ...CERTIFICATE, workloadHours: 40 });

      expect(text()).toContain('40 horas');
      expect(text()).not.toContain('[CARGA HORÁRIA]');
    });

    it('indica onde o codigo pode ser conferido', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']), CERTIFICATE);

      expect(text()).toContain('/certificado/verificar');
    });

    it('marca o diploma como area de impressao e esconde os controles no papel', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']), CERTIFICATE);

      expect(el().querySelector('.print-area')).not.toBeNull();
      expect(el().querySelectorAll('.print-hidden').length).toBeGreaterThan(0);
    });

    it('aciona a impressao nativa, sem lib de PDF', async () => {
      await create();
      respond(progress(['m1', 'm2', 'm3']), CERTIFICATE);

      const print = spyOn(window, 'print');

      buttonWith('Baixar / imprimir')?.click();

      expect(print).toHaveBeenCalled();
    });
  });
});
