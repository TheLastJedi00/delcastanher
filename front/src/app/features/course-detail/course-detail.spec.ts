import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { COURSES, CourseTestimonial, DEFAULT_COURSE_SLUG } from '../../core/mocks/courses.mock';
import { PLACEHOLDER } from '../../core/mocks/placeholders';
import { CourseSummary } from '../../core/services/course-summary.service';
import { CourseDetail } from './course-detail';

describe('CourseDetail', () => {
  let fixture: ComponentFixture<CourseDetail>;
  let paramMap: BehaviorSubject<Map<string, string>>;

  const course = COURSES[DEFAULT_COURSE_SLUG];
  /** Sem carga horaria definida, a pergunta sobre tempo sai do FAQ (Spec 022). */
  const faqSemCargaHoraria = course.faq.length - 1;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  const setup = async (slug: string) => {
    paramMap = new BehaviorSubject(new Map([['slug', slug]]));

    await TestBed.configureTestingModule({
      imports: [CourseDetail],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
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
      expect(faq.querySelectorAll('ui-accordion button').length).toBe(faqSemCargaHoraria);
      expect(faq.textContent).toContain(course.faq[0].question);
    });

    // Spec 022, decisao 18: com prazo e vagas ainda placeholder, a faixa de
    // escassez anunciaria uma escassez que nao existe.
    it('exibe o preço na seção de investimento, sem a faixa de escassez placeholder', () => {
      const oferta = el().querySelector('#investimento')!;
      expect(oferta.querySelector('ui-scarcity-banner')).toBeNull();
      expect(oferta.textContent).toContain(course.offer.price);
      expect(oferta.textContent).toContain(course.guarantees[0].title);
    });

    it('dá tratamento de pendente aos placeholders comerciais', () => {
      expect(el().querySelectorAll('ui-placeholder-text .border-dashed').length).toBeGreaterThan(0);
    });

    it('fecha a página com o rodapé', () => {
      expect(el().querySelector('ui-footer')).not.toBeNull();
    });

    it('emite os dados estruturados de Course e FAQPage', () => {
      // O JSON-LD depende do conteudo da propria pagina, entao continua sendo
      // responsabilidade do componente — ao contrario de title/description,
      // que na Spec 009 passaram para o resolver da rota.
      const blocks = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"]')
      ).map(node => JSON.parse(node.textContent ?? '{}'));

      const courseSchema = blocks.find(block => block['@type'] === 'Course');
      const faqSchema = blocks.find(block => block['@type'] === 'FAQPage');

      expect(courseSchema.name).toBe(course.name);
      // Preco fora do schema enquanto for placeholder: rich result nao pode
      // anunciar um valor que nao existe.
      expect(courseSchema.offers).toBeUndefined();
      expect(faqSchema.mainEntity.length).toBe(faqSemCargaHoraria);
      expect(faqSchema.mainEntity[0].name).toBe(course.faq[0].question);
    });

    it('recalcula a página quando o slug da rota muda', () => {
      paramMap.next(new Map([['slug', 'nao-existe']]));
      fixture.detectChanges();

      expect(text()).toContain('Esse curso não está no ar');
    });
  });

  /** Responde o resumo do curso: a leitura do build e a do navegador. */
  function responder(summary: CourseSummary): void {
    const backend = TestBed.inject(HttpTestingController);
    const url = `${environment.apiUrl}/courses/${DEFAULT_COURSE_SLUG}/summary`;

    for (let attempt = 0; attempt < 2; attempt++) {
      backend.match(url).forEach(request => request.flush(summary));
    }

    fixture.detectChanges();
  }

  const hero = () => el().querySelector('[data-testid="formato"]') as HTMLElement;
  /** "Rotulo valor" de cada cartao da hero. */
  const heroText = () =>
    Array.from(hero().querySelectorAll('dt'))
      .map(dt => `${dt.textContent!.trim()} ${dt.nextElementSibling!.textContent!.trim()}`)
      .join(' | ');
  const faqText = () => el().querySelector('#faq')!.textContent!;

  /** Spec 022, decisoes 13 e 14. */
  describe('hero com dados reais', () => {
    beforeEach(() => setup(DEFAULT_COURSE_SLUG));

    it('sem carga horária, não mostra o cartão nem a pergunta do FAQ', () => {
      responder({ workloadHours: null, accessMonths: 6 });

      expect(heroText()).not.toContain('Carga horária');
      expect(faqText()).not.toContain('Quanto tempo por semana');
    });

    it('com carga horária, mostra "N horas" no cartão e no FAQ', () => {
      responder({ workloadHours: 24, accessMonths: 6 });

      expect(heroText()).toContain('Carga horária 24 horas');
      expect(faqText()).toContain('Quanto tempo por semana');
      expect(faqText()).toContain('A carga horária total é de 24 horas');
    });

    it('troca o início da turma pela regra real de acesso, com os meses da API', () => {
      responder({ workloadHours: null, accessMonths: 9 });

      expect(heroText()).toContain('Acesso Imediato, por 9 meses');
      expect(heroText()).not.toContain('Início da turma');
      expect(faqText()).toContain('durante os 9 meses de acesso de cada módulo');
    });

    it('não tem nenhum placeholder pendente na hero', () => {
      responder({ workloadHours: null, accessMonths: 6 });

      expect(hero().querySelector('ui-placeholder-text')).toBeNull();
      expect(heroText()).not.toContain('[CARGA HORÁRIA]');
      expect(heroText()).not.toContain('[DATA DE INÍCIO]');
    });
  });

  /** Spec 022, decisao 15. */
  describe('depoimentos', () => {
    let original: CourseTestimonial[];

    beforeEach(() => (original = course.testimonials));
    afterEach(() => (course.testimonials = original));

    it('sem entradas, a seção não existe no DOM', async () => {
      course.testimonials = [];
      await setup(DEFAULT_COURSE_SLUG);

      expect(el().querySelector('#depoimentos')).toBeNull();
    });

    it('com uma entrada placeholder, também não', async () => {
      course.testimonials = [
        { name: '[DEPOIMENTO EM VÍDEO]', role: 'Aluna', quote: '[DEPOIMENTO EM VÍDEO]', videoUrl: '' },
      ];
      await setup(DEFAULT_COURSE_SLUG);

      expect(el().querySelector('#depoimentos')).toBeNull();
    });

    it('com uma entrada real, aparece', async () => {
      course.testimonials = [
        { name: 'Maria Souza', role: 'Analista de RH', quote: 'Mudou o meu jeito de trabalhar.', videoUrl: '' },
      ];
      await setup(DEFAULT_COURSE_SLUG);

      expect(el().querySelector('#depoimentos')?.textContent).toContain('Mudou o meu jeito de trabalhar.');
    });
  });

  /** Spec 022, decisao 18: a pagina nao promete o que o produto nao tem. */
  describe('sem promessas falsas', () => {
    beforeEach(async () => {
      await setup(DEFAULT_COURSE_SLUG);
      responder({ workloadHours: 24, accessMonths: 6 });
    });

    it('não fala em ao vivo, comunidade, mentoria em grupo ou turma, fora do texto alternativo das fotos', () => {
      const visivel = text().toLowerCase();

      for (const termo of ['ao vivo', 'comunidade', 'mentoria em grupo', 'turma']) {
        expect(visivel).withContext(termo).not.toContain(termo);
      }

      expect(el().querySelector('img')?.getAttribute('alt')).toContain('turma');
    });

    it('usa o CTA sem sugerir vaga limitada', () => {
      expect(text()).toContain('Quero começar agora');
      expect(text()).not.toContain('Garantir minha vaga');
    });

    it('esconde a linha do prazo do fechamento e o valor do bônus enquanto são placeholder', () => {
      expect(text()).not.toContain(PLACEHOLDER.deadline);
      expect(text()).not.toContain('Inscrições até');
      expect(el().querySelector('#bonus')!.textContent).not.toContain('Valor:');
    });

    it('mantém um bônus só, o kit de templates', () => {
      expect(course.bonuses.map(bonus => bonus.title)).toEqual(['Kit de templates do RH Estratégico']);
    });

    it('descreve o formato e a meta description como aulas gravadas', () => {
      expect(heroText()).toContain('Aulas gravadas, no seu ritmo');
      expect(course.metaDescription).toContain('Aulas gravadas, no seu ritmo');
      expect(course.metaDescription.toLowerCase()).not.toContain('ao vivo');
      expect(course.metaDescription.toLowerCase()).not.toContain('turma');
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
