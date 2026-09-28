import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminCourseView, CoursesService } from './courses.service';
import { UpdateCourseDto } from './dto/update-course.dto';

/**
 * Dados do curso no painel (Spec 022, decisao 12). Por `slug`, como os lotes
 * (Spec 019): o painel so conhece o slug do curso.
 *
 * Guards na classe, como em todo controller administrativo.
 */
@Controller('admin/courses')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCoursesController {
  constructor(private readonly courses: CoursesService) {}

  /** Carga horaria e a soma dos videos processados, como referencia. */
  @Get(':slug')
  view(@Param('slug') slug: string): Promise<AdminCourseView> {
    return this.courses.adminView(slug);
  }

  /** Define a carga horaria, ou volta para "a definir" com nulo. */
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateCourseDto): Promise<AdminCourseView> {
    return this.courses.updateWorkload(slug, dto.workloadHours);
  }
}
