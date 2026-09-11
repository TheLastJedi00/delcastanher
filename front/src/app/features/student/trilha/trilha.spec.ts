import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CourseProgress } from '../../../core/services/progress.service';
import { Trilha } from './trilha';

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;

const MODULES = [
  { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo do modulo 1', completed: false },
  { id: 'm2', order: 2, title: 'Diagnóstico', summary: 'Resumo do modulo 2', completed: false },
  { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo do modulo 3', completed: false },
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

describe('Trilha', () => {
  let fixture: ComponentFixture<Trilha>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const heading = () => el().querySelector('main h2')?.textContent?.trim() ?? '';
  const completeButton = () =>
    Array.from(el().querySelectorAll('button')).find(button =>
      /Marcar como Concluída|Concluída/.test(button.textContent ?? ''),
    ) as HTMLButtonElement | undefined;

  /** `moduleId` nulo simula a rota `/ava/trilha`, sem parametro. */
  const create = async (moduleId: string | null) => {
    await TestBed.configureTestingModule({
      imports: [Trilha],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject({
              get: (key: string) => (key === 'moduleId' ? moduleId : null),
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Trilha);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  const respond = (body: CourseProgress) => {
    backend.expectOne(PROGRESS_URL).flush(body);
    fixture.detectChanges();
  };

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('abre o modulo pedido no deep-link da rota', async () => {
    await create('m3');
    respond(progress(['m1']));

    expect(heading()).toBe('Recrutamento');
  });

  it('sem parametro na rota abre o modulo em aberto do aluno', async () => {
    await create(null);
    respond(progress(['m1']));

    expect(heading()).toBe('Diagnóstico');
  });

  it('cai no primeiro modulo quando o id da rota nao existe', async () => {
    await create('modulo-que-nao-existe');
    respond(progress([]));

    expect(heading()).toBe('Fundamentos');
  });

  it('mostra o progresso vindo da API, e nao um valor fixo', async () => {
    await create(null);
    respond(progress(['m1', 'm2']));

    expect(text()).toContain('67%');
  });

  it('exibe o resumo do modulo vindo do banco', async () => {
    await create('m2');
    respond(progress([]));

    expect(text()).toContain('Resumo do modulo 2');
  });

  it('persiste a conclusao do modulo na API', async () => {
    await create('m1');
    respond(progress([]));

    completeButton()?.click();
    fixture.detectChanges();

    const request = backend.expectOne(`${environment.apiUrl}/progress/me/modules/m1`);

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ completed: true });

    request.flush(progress(['m1']));
    fixture.detectChanges();

    expect(completeButton()?.textContent).toContain('Concluída');
  });

  it('desmarca um modulo ja concluido', async () => {
    await create('m1');
    respond(progress(['m1']));

    completeButton()?.click();
    fixture.detectChanges();

    const request = backend.expectOne(`${environment.apiUrl}/progress/me/modules/m1`);

    expect(request.request.body).toEqual({ completed: false });
    request.flush(progress([]));
  });

  it('oferece o certificado quando a trilha inteira esta concluida', async () => {
    await create('m3');
    respond(progress(['m1', 'm2', 'm3']));

    expect(text()).toContain('Trilha concluída');
    expect(
      Array.from(el().querySelectorAll('a')).some(
        anchor => anchor.getAttribute('href') === '/ava/certificado',
      ),
    ).toBe(true);
  });

  it('mostra o erro da API sem derrubar a tela', async () => {
    await create(null);
    backend
      .expectOne(PROGRESS_URL)
      .flush({ message: 'Falha ao carregar.' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).toContain('Falha ao carregar.');
    expect(text()).toContain('Tentar novamente');
  });
});
