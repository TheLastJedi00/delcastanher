import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { StoreService, TestProduct, formatPrice } from '../../core/services/store.service';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { PageContainer } from '../../shared/ui/page-container/page-container';

/**
 * Pagina do link secreto do modulo de teste (Spec 030, decisao 8).
 *
 * So admin com a chave ve o modulo de teste. Aluno, chave errada e teste
 * desligado recebem o mesmo "pagina nao encontrada" da API, e a tela nao diz
 * qual dos tres foi. O pagamento e a tela de sempre, com o modulo de teste
 * como unico item.
 */
@Component({
  selector: 'app-loja-teste',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, Card, Button, RouterLink],
  template: `
    <ui-page-container>
      @if (loading()) {
        <p class="text-slate-500" role="status">Carregando…</p>
      } @else if (product(); as item) {
        <ui-card padding="lg">
          <p class="text-xs font-bold uppercase tracking-widest text-state-warning">Teste de pagamento</p>
          <h1 class="mt-2 text-3xl font-semibold text-brand-navy">{{ item.title }}</h1>
          <p class="mt-3 max-w-2xl text-slate-700">{{ item.summary }}</p>
          <p class="mt-6 text-3xl font-semibold text-brand-navy" data-testid="preco-teste">{{ price() }}</p>
          <div class="mt-6">
            <ui-button variant="primary" (click)="pay(item)">Pagar {{ price() }}</ui-button>
          </div>
        </ui-card>
      } @else {
        <ui-card padding="lg" data-testid="teste-nao-encontrado">
          <h1 class="text-2xl font-semibold text-brand-navy">Página não encontrada</h1>
          <p class="mt-3 text-slate-700">O endereço que você abriu não existe ou não está mais disponível.</p>
          <div class="mt-6">
            <a routerLink="/loja"><ui-button variant="outline">Ir para a loja</ui-button></a>
          </div>
        </ui-card>
      }
    </ui-page-container>
  `,
})
export class LojaTeste implements OnInit {
  private readonly store = inject(StoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly product = signal<TestProduct | null>(null);
  protected readonly loading = signal(true);
  protected readonly price = computed(() => formatPrice(this.product()?.priceCents ?? 0));

  private key = '';

  ngOnInit(): void {
    this.key = this.route.snapshot.paramMap.get('chave') ?? '';

    this.store.loadTestProduct(this.key).subscribe({
      next: product => {
        this.product.set(product);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected pay(product: TestProduct): void {
    this.store.selectTest(this.key, product);
    this.router.navigate(['/loja/pagamento']);
  }
}
