import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

const VALID = {
  name: 'Aluno Completo',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
};

async function errorsOf(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateUserDto, payload));

  return errors.map(error => error.property);
}

describe('UpdateUserDto', () => {
  it('aceita o payload minimo do onboarding, sem linkedin', async () => {
    await expect(errorsOf(VALID)).resolves.toEqual([]);
  });

  it('exige nome, bio e telefone', async () => {
    await expect(errorsOf({})).resolves.toEqual(expect.arrayContaining(['name', 'bio', 'phone']));
  });

  it('rejeita obrigatorio preenchido apenas com espacos', async () => {
    await expect(errorsOf({ ...VALID, name: '   ' })).resolves.toContain('name');
  });

  it('rejeita um linkedin que nao seja URL', async () => {
    await expect(errorsOf({ ...VALID, linkedin: 'nao e uma url' })).resolves.toContain('linkedin');
  });

  it('aceita o linkedin informado sem protocolo', async () => {
    await expect(errorsOf({ ...VALID, linkedin: 'linkedin.com/in/aluno' })).resolves.toEqual([]);
  });
});
