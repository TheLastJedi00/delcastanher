import { IsBoolean } from 'class-validator';

/**
 * Payload do `PATCH /progress/me/lessons/:lessonId`. Um unico campo, e ele e
 * explicito: a trilha tem como desmarcar uma aula concluida por engano, entao
 * a rota nao pode ser um "concluir" que so sabe ir em uma direcao.
 */
export class UpdateLessonProgressDto {
  @IsBoolean({ message: 'Informe `completed` como true ou false.' })
  completed!: boolean;
}
