import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Landing } from './landing';

describe('Landing', () => {
  let fixture: ComponentFixture<Landing>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Landing],
      providers: [provideRouter([])],
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

    it('entra no menu logo depois de A Mentora', () => {
      const hrefs = fixture.componentInstance.navLinks.map(link => link.href);

      expect(hrefs).toContain('#midia');
      expect(hrefs.indexOf('#midia')).toBe(hrefs.indexOf('#mentora') + 1);
    });
  });
});
