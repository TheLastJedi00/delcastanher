import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnimateOnScroll } from '../../../shared/directives/animate-on-scroll';
import { ArticleCard } from '../../../shared/ui/article-card/article-card';
import { BackLink } from '../../../shared/ui/back-link/back-link';
import { PageContainer } from '../../../shared/ui/page-container/page-container';
import { SectionHeader } from '../../../shared/ui/section-header/section-header';

interface Article {
  title: string;
  summary: string;
  imageUrl: string;
  readTime: string;
}

@Component({
  selector: 'app-artigos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageContainer, BackLink, SectionHeader, ArticleCard, AnimateOnScroll],
  template: `
    <ui-page-container maxWidth="lg">
      <div class="mb-6">
        <ui-back-link />
      </div>

      <div class="mb-6">
        <ui-section-header
          overline="Conteúdo complementar"
          title="Artigos e Leituras Recomendadas" />
      </div>

      <div class="grid grid-cols-1 gap-6">
        @for (article of articles; track article.title; let i = $index) {
          <div animateOnScroll="animate-fade-in-up" [animateDelay]="i * 100">
            <ui-article-card
              [title]="article.title"
              [summary]="article.summary"
              [imageUrl]="article.imageUrl"
              [readTime]="article.readTime" />
          </div>
        }
      </div>
    </ui-page-container>
  `,
})
export class Artigos {
  readonly articles: Article[] = [
    {
      title: 'Como estruturar um plano de cargos e salários sem engessar a empresa',
      summary:
        'Descubra os passos fundamentais para criar uma matriz salarial que motive os colaboradores e respeite o caixa da empresa.',
      imageUrl: 'assets/aula2.jpeg',
      readTime: '5 min',
    },
    {
      title: 'People Analytics: Onde começar?',
      summary:
        'Aprenda a analisar os dados do seu RH para prever turnover e identificar potenciais líderes na sua organização.',
      imageUrl: 'assets/aula3.jpeg',
      readTime: '8 min',
    },
  ];
}
