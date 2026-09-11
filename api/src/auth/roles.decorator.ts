import { SetMetadata } from '@nestjs/common';
import { Role } from './auth.types';

/** Chave dos metadados lidos pelo `RolesGuard`. */
export const ROLES_KEY = 'roles';

/**
 * Restringe uma rota (ou um controller inteiro) aos papeis listados.
 *
 * Ate a Spec 010 o claim `role` existia no token desde a Spec 004 mas nenhum
 * guard o lia: qualquer aluno autenticado alcancaria os endpoints de upload.
 * O decorator e opt-in de proposito — rota sem ele continua valendo para
 * qualquer sessao valida, como as de progresso e certificado.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
