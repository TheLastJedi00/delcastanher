import { Injectable, NotFoundException } from '@nestjs/common';
import { ACCESS_MONTHS } from '../payments/access.service';
import { PrismaService } from '../prisma/prisma.service';

/** `GET /courses/:slug/summary`: o que a vitrine mostra na hero e no FAQ. */
export interface CourseSummary {
  /** Nulo e "a definir": a vitrine esconde o cartao (decisao 13). */
  workloadHours: number | null;
  /** A validade do acesso vendido, lida da constante que o concede (decisao 14). */
  accessMonths: number;
}

/** `GET /admin/courses/:slug`: o bloco "Dados do curso" do painel. */
export interface AdminCourseView {
  slug: string;
  title: string;
  workloadHours: number | null;
  /** Soma das aulas ja processadas pelo Mux. So referencia (decisao 12). */
  videoSeconds: number;
  videoLessons: number;
  totalLessons: number;
}

/**
 * Dados do curso para a vitrine e para o painel (Spec 022, decisoes 12 a 14).
 *
 * A carga horaria e **digitada**, e nao somada dos videos: carga horaria de
 * curso inclui apostila, exercicios e plano de acao, e o numero vai para
 * diploma. A soma aparece no painel so como referencia para quem preenche.
 */
@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(slug: string): Promise<CourseSummary> {
    const course = await this.find(slug);

    return { workloadHours: course.workloadHours, accessMonths: ACCESS_MONTHS };
  }

  async adminView(slug: string): Promise<AdminCourseView> {
    const course = await this.find(slug);
    const inCourse = { module: { courseId: course.id } };

    const [processed, totalLessons] = await Promise.all([
      this.prisma.lesson.aggregate({
        where: { ...inCourse, durationSeconds: { not: null } },
        _count: { _all: true },
        _sum: { durationSeconds: true },
      }),
      this.prisma.lesson.count({ where: inCourse }),
    ]);

    return {
      slug: course.slug,
      title: course.title,
      workloadHours: course.workloadHours,
      videoSeconds: processed._sum.durationSeconds ?? 0,
      videoLessons: processed._count._all,
      totalLessons,
    };
  }

  /**
   * Define a carga horaria, ou volta para "a definir" com nulo. Os
   * certificados leem o valor do curso na hora, entao os ja emitidos mudam
   * junto — e o painel avisa antes (decisao 12).
   */
  async updateWorkload(slug: string, workloadHours: number | null): Promise<AdminCourseView> {
    const course = await this.find(slug);

    await this.prisma.course.update({ where: { id: course.id }, data: { workloadHours } });

    return this.adminView(slug);
  }

  private async find(slug: string) {
    const course = await this.prisma.course.findUnique({ where: { slug } });

    if (!course) {
      throw new NotFoundException('Curso não encontrado.');
    }

    return course;
  }
}
