import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/** Marca os blocos gerenciados por este servico, para nao remover outros. */
const OWNED_ATTRIBUTE = 'data-json-ld';

/**
 * Injeta dados estruturados Schema.org no `<head>` (Spec 009, decisoes 7 e 12).
 *
 * Sem lib: um `<script type="application/ld+json">` e texto dentro de uma tag,
 * e o prerender ja o entrega pronto ao Googlebot, que e o unico motivo de o
 * JSON-LD desta plataforma valer alguma coisa (decisao 1).
 */
@Injectable({ providedIn: 'root' })
export class JsonLdService {
  private readonly document = inject(DOCUMENT);

  /** Substitui os blocos da rota anterior pelos desta. */
  set(schemas: Record<string, unknown>[]): void {
    this.clear();

    for (const schema of schemas) {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute(OWNED_ATTRIBUTE, '');
      script.textContent = JSON.stringify(schema);
      this.document.head.appendChild(script);
    }
  }

  /**
   * Remove o que ficou da rota anterior. Chamado na saida de cada navegacao:
   * sem isso, o schema de `Course` continuaria no head da pagina de planos,
   * descrevendo um produto que nao esta ali.
   */
  clear(): void {
    const owned = this.document.head.querySelectorAll(`script[${OWNED_ATTRIBUTE}]`);

    owned.forEach(node => node.remove());
  }
}
