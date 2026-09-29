import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminCourse, AdminCoursesService } from '../../../core/services/admin-courses.service';
import { AdminDadosCurso, formatDuration } from './admin-dados-curso';

const COURSE: AdminCourse = {
  slug: 'imersao-rh',
  title: 'Imersão RH Estratégico',
  workloadHours: null,
  videoSeconds: 51 * 60,
  videoLessons: 10,
  totalLessons: 12,
};

/** Bloco "Dados do curso" sobre o servico simulado (Spec 022, decisao 12). */
describe('AdminDadosCurso', () => {
  let fixture: ComponentFixture<AdminDadosCurso>;
  let service: { load: jasmine.Spy; updateWorkload: jasmine.Spy };

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => (el().textContent ?? '').replace(/\s+/g, ' ');

  function create(course: AdminCourse): void {
    service = {
      load: jasmine.createSpy('load').and.returnValue(of(course)),
      updateWorkload: jasmine
        .createSpy('updateWorkload')
        .and.callFake((_slug: string, workloadHours: number | null) =>
          of({ ...course, workloadHours }),
        ),
    };

    TestBed.configureTestingModule({
      imports: [AdminDadosCurso],
      providers: [{ provide: AdminCoursesService, useValue: service }],
    });

    fixture = TestBed.createComponent(AdminDadosCurso);
    fixture.detectChanges();
  }

  function submit(value: string): void {
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('carrega o curso pelo slug', () => {
    create(COURSE);

    expect(service.load).toHaveBeenCalledWith('imersao-rh');
  });

  it('mostra a soma dos vídeos processados só como referência', () => {
    create(COURSE);

    expect(el().querySelector('[data-testid="referencia-videos"]')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'os vídeos processados somam 51 min (10 de 12 aulas)',
    );
    expect((el().querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('salva a primeira carga horária sem pedir confirmação', () => {
    create(COURSE);
    const confirmSpy = spyOn(window, 'confirm');

    submit('24');

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(service.updateWorkload).toHaveBeenCalledWith('imersao-rh', 24);
    expect(text()).toContain('Carga horária salva.');
  });

  it('pede confirmação ao mudar um valor já definido, avisando dos certificados', () => {
    create({ ...COURSE, workloadHours: 24 });
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(false);

    submit('30');

    expect(confirmSpy.calls.mostRecent().args[0]).toContain(
      'Os certificados já emitidos passam a mostrar a nova carga horária',
    );
    expect(service.updateWorkload).not.toHaveBeenCalled();
  });

  it('volta para "a definir" com o campo vazio', () => {
    create({ ...COURSE, workloadHours: 24 });
    spyOn(window, 'confirm').and.returnValue(true);

    submit('');

    expect(service.updateWorkload).toHaveBeenCalledWith('imersao-rh', null);
  });

  for (const invalid of ['0', '-3', '2.5', '1000', 'doze']) {
    it(`recusa "${invalid}" sem chamar o servidor`, () => {
      create(COURSE);

      submit(invalid);

      expect(service.updateWorkload).not.toHaveBeenCalled();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain('de 1 a 999');
    });
  }

  it('mostra a recusa do servidor', () => {
    create(COURSE);
    service.updateWorkload.and.returnValue(throwError(() => 'workloadHours must not be greater than 999'));

    submit('24');

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('999');
  });

  it('formata a duração em horas e minutos', () => {
    expect(formatDuration(51 * 60)).toBe('51 min');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2 h 05 min');
  });
});
