import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AdminLessonItem, AdminModuleItem } from './content.types';
import { CreateLessonDto, ReorderDto, UpdateLessonDto } from './dto/lesson.dto';
import { CreateModuleDto, UpdateModuleDto } from './dto/module.dto';
import { LessonsService } from './lessons.service';

/**
 * Estrutura da grade pelo administrador: modulos e aulas.
 *
 * Separado do `AdminContentController`, que cuida do arquivo (bucket, Mux):
 * aqui se decide **o que existe** na trilha, la **o que toca** em cada aula.
 * Os guards valem para a classe inteira, como no controller irmao.
 *
 * Nao existe `DELETE` de modulo (decisao 15): `Certificate.moduleId` esta em
 * `onDelete: Restrict`, e apagar um modulo que ja certificou alguem apagaria
 * diplomas emitidos. A rota de ordem dos modulos e `course/modules/order`, e
 * nao `modules/order`, para nao disputar o casamento de `modules/:moduleId`.
 */
@Controller('admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminLessonsController {
  constructor(private readonly lessons: LessonsService) {}

  /** Grade do curso, com contagem de aulas e de diplomas por modulo. */
  @Get('modules')
  listModules(): Promise<AdminModuleItem[]> {
    return this.lessons.listModules();
  }

  @Post('modules')
  createModule(@Body() dto: CreateModuleDto): Promise<AdminModuleItem> {
    return this.lessons.createModule(dto);
  }

  @Patch('course/modules/order')
  @HttpCode(204)
  reorderModules(@Body() dto: ReorderDto): Promise<void> {
    return this.lessons.reorderModules(dto.ids);
  }

  @Patch('modules/:moduleId')
  updateModule(
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateModuleDto,
  ): Promise<AdminModuleItem> {
    return this.lessons.updateModule(moduleId, dto);
  }

  /** Aulas do modulo, com estado do video e os numeros da remocao. */
  @Get('modules/:moduleId/lessons')
  listLessons(@Param('moduleId') moduleId: string): Promise<AdminLessonItem[]> {
    return this.lessons.listForModule(moduleId);
  }

  @Post('modules/:moduleId/lessons')
  createLesson(
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateLessonDto,
  ): Promise<AdminLessonItem> {
    return this.lessons.createLesson(moduleId, dto);
  }

  /** Lista completa de ids na ordem desejada, gravada em transacao (decisao 17). */
  @Patch('modules/:moduleId/lessons/order')
  @HttpCode(204)
  reorderLessons(@Param('moduleId') moduleId: string, @Body() dto: ReorderDto): Promise<void> {
    return this.lessons.reorderLessons(moduleId, dto.ids);
  }

  @Patch('lessons/:lessonId')
  updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
  ): Promise<AdminLessonItem> {
    return this.lessons.updateLesson(lessonId, dto);
  }

  /** Remove a aula com o video, os materiais e as conclusoes dela (decisao 16). */
  @Delete('lessons/:lessonId')
  @HttpCode(204)
  removeLesson(@Param('lessonId') lessonId: string): Promise<void> {
    return this.lessons.removeLesson(lessonId);
  }
}
