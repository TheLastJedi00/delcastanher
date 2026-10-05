import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Footer } from './footer';

describe('Footer', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ imports: [Footer], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Footer);
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  // Spec 024, Task 2.2: a cliente valida "WhatsApp e redes sociais" no rodape.
  it('tem o WhatsApp abrindo em nova aba, com o mesmo numero do /planos', () => {
    const whatsapp = Array.from(render().querySelectorAll('a')).find(
      link => link.textContent?.trim() === 'WhatsApp',
    );

    expect(whatsapp?.getAttribute('href')).toBe('https://wa.me/5547992908953');
    expect(whatsapp?.getAttribute('target')).toBe('_blank');
    expect(whatsapp?.getAttribute('rel')).toContain('noopener');
  });

  it('LinkedIn e Instagram apontam para os perfis da Lidiane, em nova aba e sem rastreamento', () => {
    const links = Array.from(render().querySelectorAll('a'));
    const linkOf = (label: string) => links.find(link => link.textContent?.trim() === label);

    expect(linkOf('LinkedIn')?.getAttribute('href')).toBe(
      'https://www.linkedin.com/in/lidiane-delcastanher-5b2861153/',
    );
    expect(linkOf('Instagram')?.getAttribute('href')).toBe(
      'https://www.instagram.com/lidianedelcastanher/',
    );

    for (const label of ['LinkedIn', 'Instagram']) {
      expect(linkOf(label)?.getAttribute('target')).toBe('_blank');
      expect(linkOf(label)?.getAttribute('rel')).toContain('noopener');
      expect(linkOf(label)?.getAttribute('href')).not.toMatch(/utm_|stkn/);
    }
  });

  // A varredura da Task 5.2 achou os dois "#" do rodape em toda pagina publica.
  it('nao tem nenhum link "#" no rodape', () => {
    expect(render().querySelectorAll('a[href="#"]').length).toBe(0);
  });

  it('mantem o telefone para quem prefere ligar', () => {
    const phone = render().querySelector('a[href^="tel:"]');

    expect(phone?.getAttribute('href')).toBe('tel:+5547992908953');
  });
});
