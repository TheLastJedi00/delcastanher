import { IsBoolean } from 'class-validator';

/**
 * Payload do `PATCH /progress/me/modules/:moduleId`. Um unico campo, e ele e
 * explicito: a trilha tem como desmarcar um modulo concluido por engano, entao
 * a rota nao pode ser um "concluir" que so sabe ir em uma direcao.
 */
export class UpdateModuleProgressDto {
  @IsBoolean({ message: 'Informe `completed` como true ou false.' })
  completed!: boolean;
}
