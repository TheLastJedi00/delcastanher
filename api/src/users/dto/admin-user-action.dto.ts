import { IsBoolean, IsIn } from 'class-validator';

/**
 * Troca do papel de uma conta. O papel vai no corpo, e nao na rota, porque
 * promover e rebaixar sao a mesma operacao com valores diferentes — duas rotas
 * gemeas so dobrariam o caminho de teste.
 */
export class UpdateUserRoleDto {
  @IsIn(['aluno', 'admin'], { message: 'O papel precisa ser aluno ou admin.' })
  role!: 'aluno' | 'admin';
}

/**
 * Bloqueio e desbloqueio de uma conta, pelo mesmo motivo: um booleano, e nao
 * um `POST /block` e um `DELETE /block`.
 */
export class UpdateUserStatusDto {
  @IsBoolean({ message: 'Informe se a conta deve ficar bloqueada.' })
  blocked!: boolean;
}
