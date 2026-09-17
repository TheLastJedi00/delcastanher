import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { CourseProgress } from '../../../core/services/progress.service';
import { Hub } from './hub';

const PROGRESS_URL = `${environment.apiUrl}/progress/me`;

const MODULES = [
  { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo 1', completed: false },
  { id: 'm2', order: 2, title: 'Diagnóstico', summary: 'Resumo 2', completed: false },
  { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo 3', completed: false },
  { id: 'm4', order: 4, title: 'Onboarding', summary: 'Resumo 4', completed: false },
];

/**
 * Cada modulo do fixture tem **uma** aula, como ficou o banco depois da
 * migration da Spec 012: `completedIds` continua sendo id de modulo, e a
 * conclusao do modulo vem derivada da aula dele.
 */
function progress(completedIds: string[]): CourseProgress {
  const modules = MODULES.map(module => {
    const completed = completedIds.includes(module.id);
    const lesson = {
      id: `l${module.order}`,
      order: 1,
      title: `Aula 1 — ${module.title}`,
      summary: module.summary,
      completed,
      hasVideo: true,
      videoReady: true,
      durationSeconds: 600,
    };

    return {
      ...module,
      completed,
      lessons: [lesson],
      completedCount: completed ? 1 : 0,
      totalCount: 1,
      nextLesson: completed ? null : lesson,
      // Spec 014: aluno com acesso ativo — o modulo trancado tem suite propria.
      access: { unlocked: true, expiresAt: '2027-03-17T12:00:00.000Z', priceCents: 19900 },
    };
  });
  const completedCount = modules.filter(module => module.completed).length;
  const nextModule = modules.find(module => module.nextLesson !== null) ?? null;

  return {
    course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
    modules,
    completedCount,
    totalCount: modules.length,
    percentage: Math.round((completedCount / modules.length) * 100),
    nextModule,
    nextLesson: nextModule?.nextLesson ?? null,
    completed: completedCount === modules.length,
  };
}

describe('Hub', () => {
  let fixture: ComponentFixture<Hub>;
  let backend: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const resumeHref = () =>
    Array.from(el().querySelectorAll('a'))
      .map(anchor => anchor.getAttribute('href'))
      .find(href => href?.includes('/ava/trilha') || href?.includes('/ava/certificado'));

  const create = async () => {
    await TestBed.configureTestingModule({
      imports: [Hub],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Hub);
    backend = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };

  /** Responde a carga do progresso e o perfil, se a tela tiver pedido. */
  const respond = (body: CourseProgress) => {
    backend.expectOne(PROGRESS_URL).flush(body);
    fixture.detectChanges();
  };

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
  });

  it('mostra o percentual e a contagem de aulas concluidas', async () => {
    await create();
    respond(progress(['m1']));

    expect(text()).toContain('25%');
    expect(text()).toContain('1 de 4 aulas concluídas');
  });

  it('destaca a proxima aula em aberto, com o modulo dela como contexto', async () => {
    await create();
    respond(progress(['m1', 'm2']));

    expect(text()).toContain('Próxima aula');
    // O destaque e o titulo da AULA; o modulo vira contexto (decisao 6).
    expect(text()).toContain('Aula 1 — Recrutamento');
    expect(text()).toContain('Módulo 3 · Recrutamento');
  });

  it('aponta o CTA de retomada para o deep-link da aula em aberto', async () => {
    await create();
    respond(progress(['m1']));

    expect(text()).toContain('Retomar curso');
    expect(resumeHref()).toBe('/ava/trilha/m2/l2');
  });

  it('sem nenhuma aula concluida o CTA convida a comecar, na primeira aula', async () => {
    await create();
    respond(progress([]));

    expect(text()).toContain('Começar o curso');
    expect(resumeHref()).toBe('/ava/trilha/m1/l1');
  });

  it('com a trilha concluida o CTA leva ao certificado', async () => {
    await create();
    respond(progress(['m1', 'm2', 'm3', 'm4']));

    expect(text()).toContain('Curso concluído');
    expect(text()).toContain('Emitir certificado');
    expect(resumeHref()).toBe('/ava/certificado');
  });

  it('o card do certificado so aparece depois da conclusao', async () => {
    await create();
    respond(progress(['m1', 'm2', 'm3']));

    expect(text()).not.toContain('Meu Certificado');
  });

  it('mostra a mensagem de erro com opcao de tentar de novo', async () => {
    await create();
    backend.expectOne(PROGRESS_URL).flush(
      { message: 'Falha ao carregar.' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(text()).toContain('Falha ao carregar.');
    expect(text()).toContain('Tentar novamente');
  });
});
