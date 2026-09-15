import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UpdateLessonProgressDto } from './dto/update-lesson-progress.dto';
import { ProgressService } from './progress.service';
import type { CourseProgress } from './progress.types';

/**
 * Progresso do proprio aluno. Como em `users`, nao existe rota para ler ou
 * alterar o progresso de outra pessoa: o usuario vem do token, nunca da URL.
 */
@Controller('progress')
@UseGuards(FirebaseAuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Trilha do aluno com percentual e proxima aula em aberto. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<CourseProgress> {
    return this.progress.findForUser(user);
  }

  /**
   * Marca ou desmarca uma **aula** e devolve o progresso ja recalculado, para
   * a tela nao precisar de uma segunda chamada so para atualizar a barra.
   *
   * Nao existe o equivalente por modulo desde a Spec 012 (decisao 5): a
   * conclusao do modulo e derivada das aulas, e um `PATCH` de modulo marcaria
   * em cascata videos que o aluno nao assistiu. O antigo
   * `PATCH /progress/me/modules/:moduleId` foi removido, nao redirecionado.
   */
  @Patch('me/lessons/:lessonId')
  updateLesson(
    @CurrentUser() user: AuthUser,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonProgressDto,
  ): Promise<CourseProgress> {
    return this.progress.setLessonCompletion(user, lessonId, dto.completed);
  }
}
