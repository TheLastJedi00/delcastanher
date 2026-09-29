import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCoursesController } from './admin-courses.controller';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

/**
 * O curso como produto (Spec 022): o resumo publico da vitrine e a carga
 * horaria no painel. Modulos e aulas continuam no `ContentModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [CoursesController, AdminCoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
