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

  // Spec 022, decisao 7: a versao e conferida contra o banco pelo servico; o
  // DTO so garante a forma, inclusive o sufixo da segunda versao do dia.
  it('aceita a versao da politica com e sem sufixo', async () => {
    for (const policyVersion of ['2026-09-13', '2026-09-28.2']) {
      await expect(errorsOf({ ...VALID, policyAccepted: true, policyVersion })).resolves.toEqual([]);
    }
  });

  it('exige a versao quando ha aceite, e recusa o que nao e versao', async () => {
    await expect(errorsOf({ ...VALID, policyAccepted: true })).resolves.toContain('policyVersion');

    for (const policyVersion of [42, 'qualquer coisa', '13/09/2026', '2026-09-13.x']) {
      await expect(errorsOf({ ...VALID, policyAccepted: true, policyVersion })).resolves.toContain(
        'policyVersion',
      );
    }
  });
});
