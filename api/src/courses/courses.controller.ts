import { Controller, Get, Param } from '@nestjs/common';
import { CourseSummary, CoursesService } from './courses.service';

/**
 * Leitura publica do curso (Spec 022, decisoes 13 e 14), **sem sessao**: a
 * pagina do curso e vitrine. Nada aqui depende de quem pede.
 */
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  /** Carga horaria e meses de acesso, para a hero e o FAQ. */
  @Get(':slug/summary')
  summary(@Param('slug') slug: string): Promise<CourseSummary> {
    return this.courses.summary(slug);
  }
}
