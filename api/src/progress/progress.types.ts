/** Curso a que o progresso pertence. `workloadHours` nulo significa "a definir". */
export interface ProgressCourse {
  slug: string;
  title: string;
  workloadHours: number | null;
}

/**
 * Aula com o estado do aluno que pediu o progresso. Desde a Spec 012 e aqui
 * que vive o conteudo: um modulo tem varias aulas, e cada uma tem o seu video.
 */
export interface ProgressLessonItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  completed: boolean;
  /** Se ha video publicado nesta aula. */
  hasVideo: boolean;
  /**
   * Se o video ja esta reproduzivel. Falso com `hasVideo` verdadeiro e video
   * em processamento ou com erro — a trilha precisa dos dois para nao abrir um
   * player que so falha.
   */
  videoReady: boolean;
  /** Duracao vinda do Mux; nula enquanto o video nao processou (decisao 18). */
  durationSeconds: number | null;
}

/**
 * Modulo da trilha, agora um container. `completed` e **derivado**: ele e
 * verdadeiro quando todas as aulas do modulo estao concluidas, e nunca sai de
 * uma tabela propria (decisao 5).
 *
 * `completedCount`/`totalCount` vem prontos para que o `aside`, o card do Hub
 * e a trilha horizontal mostrem "3 de 5 aulas" sem cada tela refazer a conta.
 */
/**
 * Estado de compra do modulo (Spec 014, decisao 17).
 *
 * A trilha continua devolvendo **todos** os modulos: o aluno precisa ver o que
 * existe para decidir comprar, e esconder o que ele nao tem transformaria a
 * trilha em uma mentira sobre o tamanho do curso. O que muda com `unlocked`
 * falso e o que a tela oferece — cadeado e preco no lugar do player.
 *
 * `expiresAt` nulo com `unlocked` falso cobre os dois casos que a tela trata
 * igual: nunca comprado e ja vencido. `priceCents` nulo e o modulo "em breve",
 * sem preco definido (decisao 1).
 */
export interface ProgressModuleAccess {
  unlocked: boolean;
  expiresAt: string | null;
  priceCents: number | null;
}

export interface ProgressModuleItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  completed: boolean;
  access: ProgressModuleAccess;
  lessons: ProgressLessonItem[];
  completedCount: number;
  totalCount: number;
  /** Primeira aula em aberto **deste** modulo, ou nula se nao houver. */
  nextLesson: ProgressLessonItem | null;
}

/**
 * Progresso do aluno no curso. Traz percentual e proxima aula ja calculados
 * para que dashboard e trilha nao repitam a mesma conta cada um do seu jeito.
 *
 * Os contadores de topo sao de **aula** desde a Spec 012 (decisao 6): e a aula
 * que o aluno conclui, e um curso de 12 modulos com 5 aulas cada nao avanca de
 * 8% em 8%.
 */
export interface CourseProgress {
  course: ProgressCourse;
  modules: ProgressModuleItem[];
  /** Aulas concluidas e aulas publicadas no curso inteiro. */
  completedCount: number;
  totalCount: number;
  /** Inteiro de 0 a 100. */
  percentage: number;
  /** Modulo da proxima aula em aberto, ou nulo com a trilha inteira concluida. */
  nextModule: ProgressModuleItem | null;
  /** Primeira aula em aberto do curso — o destino do "Retomar" e do "Próxima aula". */
  nextLesson: ProgressLessonItem | null;
  completed: boolean;
}
