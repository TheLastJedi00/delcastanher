import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { filter } from 'rxjs';
import { AnalyticsService } from './core/services/analytics.service';
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
  private readonly title = inject(Title);

  constructor() {
    // Numa SPA a carga inicial e a unica navegacao que o navegador enxerga:
    // sem este disparo por rota, a medicao registraria so a primeira pagina de
    // cada sessao. O `track` decide sozinho entre enviar e enfileirar — aqui
    // nao se consulta consentimento.
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(event =>
        this.analytics.track('page_view', {
          page_path: event.urlAfterRedirects,
          page_title: this.title.getTitle(),
        })
      );
  }
}
