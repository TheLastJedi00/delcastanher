import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AccessService } from '../payments/access.service';
import { ContentService } from './content.service';
import type { MaterialItem, PlaybackGrant } from './content.types';
import { VideoService } from './video.service';

/**
 * Conteudo como o aluno o consome.
 *
 * Ate a Spec 012 bastava a sessao autenticada (Spec 010, decisao 6): a
 * plataforma inteira era paga na porta de entrada. Com a venda por modulo
 * (Spec 014), o portao passa a ser o **acesso ativo ao modulo da aula**, e ele
 * mora aqui, no servidor — o cadeado que a trilha desenha e consequencia
 * disto, e nao a protecao (decisao 17).
 *
 * O portao fica no controller, e nao dentro de `ContentService`/`VideoService`:
 * o painel administrativo usa os mesmos servicos e nao pode ser barrado por
 * nao ter comprado o proprio curso.
 */
@Controller()
@UseGuards(FirebaseAuthGuard)
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly video: VideoService,
    private readonly access: AccessService,
  ) {}

  /**
   * Autorizacao de reproducao. 409 enquanto o video nao esta pronto: o aluno
   * precisa saber que a aula existe e o video ainda nao, e nao receber um
   * player que so falha (Spec 010, decisoes 5 e 6).
   *
   * O token e a chave do video no Mux: sem o portao antes dele, todo o resto
   * da protecao seria decorativo.
   */
  @Get('lessons/:lessonId/playback-token')
  async playbackToken(
    @CurrentUser() user: AuthUser,
    @Param('lessonId') lessonId: string,
  ): Promise<PlaybackGrant> {
    await this.access.requireForLesson(user.uid, lessonId);

    return this.video.createPlaybackToken(lessonId);
  }

  /** Materiais da aula, ja com a URL assinada de download. */
  @Get('lessons/:lessonId/materials')
  async listByLesson(
    @CurrentUser() user: AuthUser,
    @Param('lessonId') lessonId: string,
  ): Promise<MaterialItem[]> {
    await this.access.requireForLesson(user.uid, lessonId);

    return this.content.listForLesson(lessonId);
  }

  /**
   * Central de materiais. E a unica rota de conteudo que nao fala de uma aula
   * so, entao aqui o portao nao e 403: a resposta certa e **o que a pessoa
   * comprou**, e nao um erro para quem tem acesso a metade da trilha.
   *
   * O filtro vai para a consulta, e nao para um `filter` depois: assinar URL de
   * download de material que o aluno nao pode baixar seria trabalho jogado fora
   * no caminho quente.
   */
  @Get('materials')
  async listAll(@CurrentUser() user: AuthUser): Promise<MaterialItem[]> {
    const active = await this.access.activeMap(user.uid);

    return this.content.listForCourse([...active.keys()]);
  }
}
