import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { AnalyticsService } from './core/services/analytics.service';
import { JsonLdService } from './core/services/json-ld.service';
import { DEFAULT_SEO, SEO_DATA_KEY } from './core/services/seo-route';
import { SeoMetadata, SeoService } from './core/services/seo.service';
import { CookieBanner } from './shared/ui/cookie-banner/cookie-banner';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, CookieBanner],
  // O banner vive fora do outlet de proposito: montado por rota, ele
  // desapareceria e reapareceria a cada navegacao antes de o visitante decidir.
  template: `
    <router-outlet />
    <ui-cookie-banner />
  `,
})
export class App {
  private readonly analytics = inject(AnalyticsService);
  private readonly seo = inject(SeoService);
  private readonly jsonLd = inject(JsonLdService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    // Os dados estruturados saem de cena antes de a proxima rota montar: sem
    // isto o schema de `Course` seguiria no head da pagina de planos,
    // descrevendo um produto que nao esta ali. Quem precisa de JSON-LD o
    // declara durante a propria ativacao, logo depois disto.
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => this.jsonLd.clear());

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(event => {
        const metadata = this.resolveSeo();

        // Ponto unico de escrita dos metadados: rota nova nasce com title,
        // description, Open Graph e canonical sem o componente lembrar disso.
        this.seo.apply(metadata, event.urlAfterRedirects);

        // Numa SPA a carga inicial e a unica navegacao que o navegador enxerga:
        // sem este disparo por rota, a medicao registraria so a primeira pagina
        // de cada sessao. O `track` decide sozinho entre enviar e enfileirar.
        this.analytics.track('page_view', {
          page_path: event.urlAfterRedirects,
          page_title: metadata.title,
        });
      });
  }

  /** Le o `seo` da rota mais profunda ativa — `data` estatico ou `resolve`. */
  private resolveSeo(): SeoMetadata {
    let current = this.route;

    while (current.firstChild) {
      current = current.firstChild;
    }

    return (current.snapshot.data[SEO_DATA_KEY] as SeoMetadata | undefined) ?? DEFAULT_SEO;
  }
}
