import { Test } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const PROFILE = {
  id: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  bio: null,
  phone: null,
  linkedin: null,
  onboardingCompleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

async function build(users: Partial<Record<keyof UsersService, jest.Mock>>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [
      { provide: UsersService, useValue: users },
      { provide: AuthService, useValue: { verify: jest.fn() } },
      FirebaseAuthGuard,
    ],
  }).compile();

  return moduleRef.get(UsersController);
}

describe('UsersController', () => {
  it('protege as rotas com o FirebaseAuthGuard', () => {
    const guards = Reflect.getMetadata('__guards__', UsersController) as unknown[];

    expect(guards).toContain(FirebaseAuthGuard);
  });

  describe('GET /users/me', () => {
    it('devolve o registro do banco do usuario autenticado', async () => {
      const findOrCreate = jest.fn().mockResolvedValue(PROFILE);
      const controller = await build({ findOrCreate });

      await expect(controller.me(USER)).resolves.toEqual(PROFILE);
      expect(findOrCreate).toHaveBeenCalledWith(USER);
    });
  });

  describe('PATCH /users/me', () => {
    it('repassa o payload validado e devolve o perfil atualizado', async () => {
      const updated = { ...PROFILE, name: 'Novo Nome', onboardingCompleted: true };
      const update = jest.fn().mockResolvedValue(updated);
      const controller = await build({ update });
      const dto: UpdateUserDto = {
        name: 'Novo Nome',
        bio: 'Bio nova.',
        phone: '(11) 90000-0000',
      };

      await expect(controller.updateMe(USER, dto)).resolves.toEqual(updated);
      expect(update).toHaveBeenCalledWith(USER, dto);
    });
  });
});
