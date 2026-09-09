import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { findCourseBySlug } from '../../core/mocks/courses.mock';
import { Button } from '../../shared/ui/button/button';
import { Footer } from '../../shared/ui/footer/footer';
import { NavHeader } from '../../shared/ui/nav-header/nav-header';

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NavHeader, Footer, Button],
  templateUrl: './course-detail.html',
})
export class CourseDetail {
  private readonly route = inject(ActivatedRoute);

  private readonly slug = toSignal(this.route.paramMap.pipe(map(params => params.get('slug'))), {
    initialValue: null,
  });

  /** null quando o slug nao existe no mock — o template cai no fallback. */
  protected readonly course = computed(() => findCourseBySlug(this.slug()));
}
