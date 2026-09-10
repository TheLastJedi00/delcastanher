import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UpdateModuleProgressDto } from './dto/update-module-progress.dto';
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

  /** Trilha do aluno com percentual e proximo modulo em aberto. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<CourseProgress> {
    return this.progress.findForUser(user);
  }

  /**
   * Marca ou desmarca um modulo e devolve o progresso ja recalculado, para a
   * tela nao precisar de uma segunda chamada so para atualizar a barra.
   */
  @Patch('me/modules/:moduleId')
  updateModule(
    @CurrentUser() user: AuthUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateModuleProgressDto,
  ): Promise<CourseProgress> {
    return this.progress.setModuleCompletion(user, moduleId, dto.completed);
  }
}
