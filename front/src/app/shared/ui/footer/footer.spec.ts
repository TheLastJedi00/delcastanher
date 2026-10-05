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

  it('mantem o telefone para quem prefere ligar', () => {
    const phone = render().querySelector('a[href^="tel:"]');

    expect(phone?.getAttribute('href')).toBe('tel:+5547992908953');
  });
});
