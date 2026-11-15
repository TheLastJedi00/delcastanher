import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Landing } from './landing';

describe('Landing', () => {
  let fixture: ComponentFixture<Landing>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Landing);
    fixture.detectChanges();
    el = fixture.nativeElement;
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('hero (Spec 018, decisao 11)', () => {
    it('renderiza a foto em todos os tamanhos, com prioridade e alt descritivo', () => {
      const photo = el.querySelector<HTMLImageElement>('header img')!;

      expect(photo.getAttribute('fetchpriority')).toBe('high');
      expect(photo.getAttribute('alt')).toBe('Lidiane Delcastanher palestrando para uma turma');
      expect(photo.closest('.hidden')).toBeNull();
    });

    it('mantem um unico h1 na pagina', () => {
      expect(el.querySelectorAll('h1').length).toBe(1);
    });

    // A pagina do curso abre com uma hero quase igual a esta: quem clicava
    // achava que o botao nao levava a lugar nenhum. Inscrever-se e criar conta.
    it('"Quero me Inscrever Agora" leva a criacao de conta', () => {
      const cta = Array.from(el.querySelectorAll<HTMLAnchorElement>('header a')).find(a =>
        a.textContent?.includes('Quero me Inscrever Agora'),
      );

      expect(cta?.getAttribute('href')).toBe('/login?criar=1');
    });
  });

  describe('secao Na midia (Spec 018)', () => {
    const section = () => el.querySelector<HTMLElement>('section#midia')!;

    it('entra com h2 e um card por aparicao', () => {
      expect(section().querySelector('h2')).not.toBeNull();
      expect(section().querySelectorAll('ui-media-card').length).toBe(
        fixture.componentInstance.media.length
      );
      expect(section().querySelectorAll('ui-media-card h3').length).toBe(
        fixture.componentInstance.media.length
      );
    });

    it('fica entre a citacao e o Metodo', () => {
      const sections = Array.from(el.querySelectorAll('section'));
      const midia = sections.indexOf(section());

      expect(sections[midia + 1].id).toBe('metodo');
      expect(sections[midia - 1].textContent).toContain('Liderança não é cargo');
    });

    it('abre todo link externo em nova aba com noopener', () => {
      const links = Array.from(section().querySelectorAll('a'));

      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    });

    it('nao gera link para item sem url', () => {
      // Componente novo, com a lista trocada antes da primeira renderizacao:
      // `media` e readonly, entao o item pendente entra pelo proprio array.
      const pending = TestBed.createComponent(Landing);
      const media = pending.componentInstance.media;
      media.splice(0, media.length, { ...media[0], url: undefined });
      pending.detectChanges();

      const card = (pending.nativeElement as HTMLElement).querySelector('section#midia ui-media-card')!;
      expect(card.querySelector('a')).toBeNull();
    });

    it('declara o Person com revista e podcasts em subjectOf, sem o livro (decisao 8)', () => {
      const blocks = Array.from(
        document.head.querySelectorAll('script[type="application/ld+json"][data-json-ld]')
      ).map(node => JSON.parse(node.textContent ?? '{}'));
      const person = blocks.find(block => block['@type'] === 'Person');

      expect(person).toBeDefined();
      expect(person.name).toBe('Lidiane Delcastanher');
      expect(person.sameAs).toBeUndefined();
      expect(person.subjectOf.map((item: { '@type': string }) => item['@type'])).toEqual([
        'Article',
        'VideoObject',
        'VideoObject',
      ]);
      expect(person.subjectOf.map((item: { url: string }) => item.url)).toEqual([
        'https://prosperebrasil.com.br/lidiane-delcastanher/',
        'https://www.youtube.com/watch?v=Qvm2UtJkxA0',
        'https://www.instagram.com/conexaocont/reel/DLpl5hNO-XS/',
      ]);
      for (const video of person.subjectOf.slice(1)) {
        expect(video.uploadDate).toBeTruthy();
        expect(video.thumbnailUrl).toMatch(/^https?:\/\/.+\/assets\/midia\/.+\.webp$/);
      }
    });

    it('entra no menu logo depois de A Mentora', () => {
      const hrefs = fixture.componentInstance.navLinks.map(link => link.href);

      expect(hrefs).toContain('#midia');
      expect(hrefs.indexOf('#midia')).toBe(hrefs.indexOf('#mentora') + 1);
    });
  });

  describe('trilha de aprendizado', () => {
    // A grade da landing e a lista fixa do curso, sem consulta ao banco: nao
    // ha contagem de aulas a mostrar, e "Sem aulas publicadas" seria falso.
    it('lista os módulos sem a linha de aulas', () => {
      const trilha = el.querySelector('#trilha')!;

      expect(trilha.querySelectorAll('ui-module-card').length).toBeGreaterThan(0);
      expect(trilha.textContent).not.toContain('Sem aulas publicadas');
      expect(trilha.textContent).not.toContain('aula');
    });
  });

  /** Spec 032: textos da mentora definidos pelo usuario em 15/11/2026. */
  describe('secao Quem sera sua Mentora', () => {
    const bio = () => (el.querySelector('[data-testid="mentora-bio"]')?.textContent ?? '').replace(/\s+/g, ' ');

    it('traz os quatro paragrafos novos', () => {
      expect(el.querySelectorAll('[data-testid="mentora-bio"] p').length).toBe(4);
      expect(bio()).toContain('atua de forma multissetorial nos segmentos de Indústria, Tecnologia e Setor Público');
      expect(bio()).toContain('é CEO da Delcastanher Serviços Administrativos e Treinamentos');
      expect(bio()).toContain('também integra uma publicação em formato de revista');
      expect(bio()).toContain('Sua atuação conecta estratégia, pessoas e resultados');
    });

    it('mantem os negritos e o livro em italico', () => {
      const strong = Array.from(el.querySelectorAll('[data-testid="mentora-bio"] strong')).map(node =>
        (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );

      expect(strong).toEqual([
        'mais de 20 anos de experiência',
        'Delcastanher Serviços Administrativos e Treinamentos',
        'imersões, programas e experiências de desenvolvimento em Liderança e Recursos Humanos',
      ]);
      expect(el.querySelector('[data-testid="mentora-bio"] i')?.textContent).toContain(
        'Trajetória e Cotidiano dos Líderes do Brasil',
      );
    });

    it('os quatro cards do print, em 2x2, sem Empresas nem Setores', () => {
      const cards = Array.from(el.querySelectorAll('[data-testid="mentora-cards"] ui-glass-card')).map(node =>
        Array.from(node.querySelectorAll('p'))
          .map(p => (p.textContent ?? '').trim())
          .join(' '),
      );

      expect(cards).toEqual([
        '+20 Anos de experiência',
        'Mentora e Instrutora',
        '01 Livro como coautora',
        'RH & Liderança Imersões e desenvolvimento',
      ]);
      expect(el.querySelector('[data-testid="mentora-cards"]')?.className).not.toContain('md:grid-cols-4');
      expect(cards.join(' ')).not.toMatch(/Empresas|Setores/);
    });
  });
});
