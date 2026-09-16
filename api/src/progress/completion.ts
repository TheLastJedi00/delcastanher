/**
 * O criterio de conclusao da Spec 012 (decisao 5), em um lugar so.
 *
 * "Modulo concluido" e **derivado** de "todas as aulas deste modulo
 * concluidas", calculado na leitura — nunca guardado. Quem precisa dessa
 * conta e o progresso do aluno (`ProgressService`) e a leitura administrativa
 * (`AdminUsersService`), e os dois nao podem ter cada um a sua versao: bastaria
 * uma divergir para o painel dizer que o aluno concluiu um modulo que a trilha
 * dele mostra em aberto.
 *
 * Sao funcoes puras, e nao um servico injetado, porque `ProgressModule` ja
 * importa `UsersModule`: injetar o `ProgressService` no `AdminUsersService`
 * fecharia um ciclo entre os dois modulos, que o Nest so resolve com
 * `forwardRef` — complexidade permanente para reaproveitar duas contas.
 */

/** Percentual inteiro de 0 a 100. Total zero e 0%, e nao NaN. */
export function percentageOf(completed: number, total: number): number {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

/**
 * Verdadeiro so quando **existe** conteudo e ele esta todo concluido.
 *
 * Um conjunto vazio nao esta concluido: modulo sem aula nenhuma — o caso do
 * modulo recem-criado no painel — nao pode contar como concluido, porque isso
 * liberaria um diploma de modulo sem uma unica aula assistida.
 */
export function isFullyCompleted(total: number, completed: number): boolean {
  return total > 0 && completed === total;
}
