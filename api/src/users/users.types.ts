import { UserModel } from '../generated/prisma/models';

/**
 * Perfil persistido no Neon. Reexportado daqui para que o restante da API nao
 * dependa do caminho do client gerado pelo Prisma.
 */
export type UserProfile = UserModel;
