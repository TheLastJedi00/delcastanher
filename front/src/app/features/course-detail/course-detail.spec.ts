import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { COURSES, DEFAULT_COURSE_SLUG } from '../../core/mocks/courses.mock';
import { CourseDetail } from './course-detail';

describe('CourseDetail', () => {
  let fixture: ComponentFixture<CourseDetail>;
  let paramMap: BehaviorSubject<Map<string, string>>;

  const course = COURSES[DEFAULT_COURSE_SLUG];

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  const setup = async (slug: string) => {
    paramMap = new BehaviorSubject(new Map([['slug', slug]]));

    await TestBed.configureTestingModule({
      imports: [CourseDetail],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: paramMap.asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CourseDetail);
    fixture.detectChanges();
  };

  describe('slug existente', () => {
    beforeEach(() => setup(DEFAULT_COURSE_SLUG));

    it('resolve o curso pelo slug da rota', () => {
      expect(text()).toContain(course.headline);
      expect(el().querySelector('h1')!.textContent).toContain(course.headline);
    });

    it('renderiza todas as seções do funil', () => {
      for (const id of ['problema', 'resultados', 'grade', 'bonus', 'investimento', 'faq']) {
        expect(el().querySelector(`#${id}`))
          .withContext(`seção #${id}`)
          .not.toBeNull();
      }
    });

    it('lista o problema, os resultados e os bônus do mock', () => {
      expect(text()).toContain(course.problem.title);
      expect(text()).toContain(course.outcomes[0]);
      expect(text()).toContain(course.bonuses[0].title);
    });

    it('monta a grade curricular com um item por módulo', () => {
      const grade = el().querySelector('#grade')!;
      expect(grade.querySelectorAll('ui-accordion button').length).toBe(course.modules.length);
      expect(grade.textContent).toContain(course.modules[0].title);
    });

    it('monta o FAQ com uma pergunta por item do mock', () => {
      const faq = el().querySelector('#faq')!;
      expect(faq.querySelectorAll('ui-accordion button').length).toBe(course.faq.length);
      expect(faq.textContent).toContain(course.faq[0].question);
    });

    it('exibe a faixa de escassez e o preço na seção de investimento', () => {
      const oferta = el().querySelector('#investimento')!;
      expect(oferta.querySelector('ui-scarcity-banner')).not.toBeNull();
      expect(oferta.textContent).toContain(course.offer.price);
      expect(oferta.textContent).toContain(course.guarantees[0].title);
    });

    it('dá tratamento de pendente aos placeholders comerciais', () => {
      expect(el().querySelectorAll('ui-placeholder-text .border-dashed').length).toBeGreaterThan(0);
    });

    it('fecha a página com o rodapé', () => {
      expect(el().querySelector('ui-footer')).not.toBeNull();
    });

    it('recalcula a página quando o slug da rota muda', () => {
      paramMap.next(new Map([['slug', 'nao-existe']]));
      fixture.detectChanges();

      expect(text()).toContain('Esse curso não está no ar');
    });
  });

  describe('slug inexistente', () => {
    beforeEach(() => setup('curso-que-nao-existe'));

    it('mostra o fallback amigável em vez da página do curso', () => {
      expect(text()).toContain('Esse curso não está no ar');
      expect(text()).not.toContain(course.headline);
    });

    it('oferece caminhos de volta para o funil', () => {
      const hrefs = Array.from(el().querySelectorAll('a')).map(a => a.getAttribute('href'));
      expect(hrefs).toContain('/planos');
      expect(hrefs).toContain('/');
    });

    it('mantém cabeçalho e rodapé no fallback', () => {
      expect(el().querySelector('ui-nav-header')).not.toBeNull();
      expect(el().querySelector('ui-footer')).not.toBeNull();
    });
  });
});
