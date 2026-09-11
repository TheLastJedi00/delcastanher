/** Curso a que o progresso pertence. `workloadHours` nulo significa "a definir". */
export interface ProgressCourse {
  slug: string;
  title: string;
  workloadHours: number | null;
}

/** Modulo da trilha com o estado do aluno que pediu o progresso. */
export interface ProgressModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  completed: boolean;
  /** Se ha video publicado neste modulo (Spec 010). */
  hasVideo: boolean;
  /**
   * Se o video ja esta reproduzivel. Falso com `hasVideo` verdadeiro e video
   * em processamento ou com erro — a trilha precisa dos dois para nao abrir um
   * player que so falha.
   */
  videoReady: boolean;
}

/**
 * Progresso do aluno no curso. Traz percentual e proximo modulo ja calculados
 * para que dashboard e trilha nao repitam a mesma conta cada um do seu jeito.
 */
export interface CourseProgress {
  course: ProgressCourse;
  modules: ProgressModuleItem[];
  completedCount: number;
  totalCount: number;
  /** Inteiro de 0 a 100. */
  percentage: number;
  /** Primeiro modulo em aberto, ou nulo com a trilha inteira concluida. */
  nextModule: ProgressModuleItem | null;
  completed: boolean;
}
