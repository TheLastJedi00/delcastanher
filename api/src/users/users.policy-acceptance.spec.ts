import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CURRENT_POLICY_VERSION } from './policy-versions';
import { UsersService } from './users.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno do Firebase',
  role: 'aluno',
};

/** Perfil completo: e o que o onboarding envia ao concluir. */
const ONBOARDING: UpdateUserDto = {
  name: 'Aluno Completo',
  bio: 'Analista de RH ha 8 anos.',
  phone: '(11) 90000-0000',
  policyAccepted: true,
  policyVersion: CURRENT_POLICY_VERSION,
};

async function build(current: Record<string, unknown> | null) {
  const upsert = jest.fn().mockResolvedValue({ id: USER.uid });
  const findUnique = jest.fn().mockResolvedValue(current);

  const moduleRef = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: PrismaService, useValue: { user: { upsert, findUnique } } },
    ],
  }).compile();

  return { service: moduleRef.get(UsersService), upsert, findUnique };
}

/** Dados gravados na chamada de upsert (update e create carregam o mesmo). */
function gravado(upsert: jest.Mock): Record<string, unknown> {
  return upsert.mock.calls[0][0].update as Record<string, unknown>;
}

/**
 * Aceite da Politica de Privacidade no onboarding (Spec 015, decisoes 7 a 9).
 *
 * O aceite mora aqui, e nao no cadastro, porque o cadastro da plataforma e um
 * modal que so pede e-mail e dispara o link do Firebase: nao ha sessao nem
 * registro onde gravar. O onboarding e o primeiro passo autenticado, ja e
 * obrigatorio para todos e ja escreve o perfil — o aceite viaja na mesma
 * requisicao, porque um aceite em requisicao propria poderia falhar sozinho e
 * deixar perfil completo sem aceite.
 *
 * A regra tem uma sutileza que estes testes existem para fixar: `update` atende
 * o onboarding **e** a tela "Meu Perfil", e a conclusao do onboarding e
 * derivada dos campos, nao declarada pelo cliente. Exigir aceite sempre que o
 * perfil chega completo prenderia o aluno legado — que ja concluiu o onboarding
 * antes desta spec — na propria tela de perfil, sem conseguir trocar o
 * telefone. A exigencia incide sobre **concluir** o onboarding, e nao sobre
 * toda atualizacao.
 */
describe('UsersService — aceite da politica', () => {
  describe('conclusao do onboarding', () => {
    it('recusa concluir o onboarding sem o aceite', async () => {
      const { service, upsert } = await build(null);

      const { policyAccepted, policyVersion, ...semAceite } = ONBOARDING;

      await expect(service.update(USER, semAceite as UpdateUserDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // E recusa antes de gravar: perfil salvo com aceite recusado seria o
      // pior dos dois mundos.
      expect(upsert).not.toHaveBeenCalled();
    });

    it('grava a data e a versao aceita quando o aceite vem marcado', async () => {
      const { service, upsert } = await build(null);

      await service.update(USER, ONBOARDING);

      expect(gravado(upsert)).toEqual(
        expect.objectContaining({
          onboardingCompleted: true,
          policyAcceptedAt: expect.any(Date),
          policyAcceptedVersion: CURRENT_POLICY_VERSION,
        }),
      );
    });
  });

  describe('aluno anterior a esta spec', () => {
    // Decisao 9: quem ja concluiu o onboarding nunca viu o checkbox. Barra-lo
    // aqui seria prende-lo na tela de perfil por uma caixa que nao existia.
    it('deixa quem já concluiu o onboarding editar o perfil sem reenviar aceite', async () => {
      const { service, upsert } = await build({
        id: USER.uid,
        onboardingCompleted: true,
        policyAcceptedAt: null,
        policyAcceptedVersion: null,
      });

      const { policyAccepted, policyVersion, ...semAceite } = ONBOARDING;

      await expect(service.update(USER, semAceite as UpdateUserDto)).resolves.toBeDefined();
      expect(upsert).toHaveBeenCalled();
    });

    it('não inventa aceite para quem não marcou nada', async () => {
      const { service, upsert } = await build({
        id: USER.uid,
        onboardingCompleted: true,
        policyAcceptedAt: null,
        policyAcceptedVersion: null,
      });

      const { policyAccepted, policyVersion, ...semAceite } = ONBOARDING;

      await service.update(USER, semAceite as UpdateUserDto);

      // Nulo significa "conta anterior a esta spec", e nunca "recusou"
      // (decisao 8) — mas tambem nao vira aceite por tabela.
      expect(gravado(upsert)).not.toEqual(
        expect.objectContaining({ policyAcceptedAt: expect.anything() }),
      );
    });

    it('registra o aceite quando o aluno legado marca o checkbox', async () => {
      const { service, upsert } = await build({
        id: USER.uid,
        onboardingCompleted: true,
        policyAcceptedAt: null,
        policyAcceptedVersion: null,
      });

      await service.update(USER, ONBOARDING);

      expect(gravado(upsert)).toEqual(
        expect.objectContaining({ policyAcceptedVersion: CURRENT_POLICY_VERSION }),
      );
    });
  });

  describe('aceite ja registrado', () => {
    it('não sobrescreve a data de um aceite anterior a cada edição de perfil', async () => {
      const antes = new Date('2026-09-15T10:00:00.000Z');

      const { service, upsert } = await build({
        id: USER.uid,
        onboardingCompleted: true,
        policyAcceptedAt: antes,
        policyAcceptedVersion: CURRENT_POLICY_VERSION,
      });

      await service.update(USER, ONBOARDING);

      // A prova e de quando o titular aceitou, nao de quando editou a bio pela
      // ultima vez. Reescrever a data a cada PATCH apagaria o que ela prova.
      expect(gravado(upsert)).not.toEqual(
        expect.objectContaining({ policyAcceptedAt: expect.anything() }),
      );
      expect(gravado(upsert)).not.toEqual(
        expect.objectContaining({ policyAcceptedVersion: expect.anything() }),
      );
    });
  });

  describe('perfil incompleto', () => {
    // Enquanto o perfil nao fecha, o onboarding nao concluiu: nao ha o que
    // exigir, e um rascunho salvo pela metade nao pode ser barrado por aceite.
    it('não exige aceite de quem ainda não preencheu o perfil inteiro', async () => {
      const { service } = await build(null);

      await expect(
        service.update(USER, { name: 'Meio', bio: '', phone: '' } as UpdateUserDto),
      ).resolves.toBeDefined();
    });
  });
});
