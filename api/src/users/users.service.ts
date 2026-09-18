import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfile } from './users.types';

/** Campos que o onboarding exige para considerar o perfil preenchido. */
interface ProfileData {
  name: string;
  bio: string;
  phone: string;
  linkedin: string | null;
}

/**
 * O DTO aceita o LinkedIn sem protocolo, por ser como as pessoas costumam
 * copiar o endereco. Guardar sempre com https:// deixa o link utilizavel em um
 * href direto, sem que cada tela precise se lembrar disso.
 */
function normalizeLink(value?: string): string | null {
  const link = value?.trim();

  if (!link) {
    return null;
  }

  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function isComplete(profile: ProfileData): boolean {
  return Boolean(profile.name && profile.bio && profile.phone);
}

/**
 * Perfil do usuario no Neon. O Firebase continua dono da identidade: aqui o
 * `id` e o proprio UID, e todo acesso parte do usuario ja autenticado.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registro do usuario logado, criado na hora se ainda nao existir. O upsert
   * e o que faz contas anteriores ao banco (criadas so no Firebase) entrarem
   * na base — com `onboardingCompleted` falso, como qualquer conta nova.
   *
   * E tambem o ponto de entrada da plataforma, chamado uma vez pelo
   * `ensureProfile()` do front: e por isso que o papel e o carimbo de ultimo
   * acesso sao gravados aqui, e em nenhum outro lugar do caminho autenticado
   * (Spec 013, decisoes 4 e 5).
   */
  findOrCreate(user: AuthUser): Promise<UserProfile> {
    // O papel e o e-mail vivem no Firebase; o banco apenas os espelha, e o
    // espelho converge sozinho quando o claim muda fora do painel.
    const mirror = { email: user.email, role: user.role, lastSeenAt: new Date() };

    return this.prisma.user.upsert({
      where: { id: user.uid },
      update: mirror,
      create: { id: user.uid, name: user.name, ...mirror },
    });
  }

  /**
   * Atualiza o perfil. Tambem e a rota do onboarding: a conclusao nao vem do
   * cliente, e derivada dos campos obrigatorios que chegaram preenchidos.
   *
   * Desde a Spec 015 e tambem onde o aceite da Politica de Privacidade e
   * registrado. O aceite viaja na mesma requisicao do perfil de proposito: em
   * requisicao propria, ele poderia falhar sozinho e deixar perfil completo sem
   * aceite (decisao 7).
   */
  async update(user: AuthUser, dto: UpdateUserDto): Promise<UserProfile> {
    const profile: ProfileData = {
      name: dto.name?.trim() ?? '',
      bio: dto.bio?.trim() ?? '',
      phone: dto.phone?.trim() ?? '',
      linkedin: normalizeLink(dto.linkedin),
    };

    const current = await this.prisma.user.findUnique({ where: { id: user.uid } });

    const completing = isComplete(profile);
    const alreadyOnboarded = current?.onboardingCompleted === true;
    const alreadyAccepted = Boolean(current?.policyAcceptedAt);

    // A exigencia incide sobre **concluir** o onboarding, e nao sobre toda
    // atualizacao de perfil. Como a conclusao e derivada dos campos, exigir o
    // aceite sempre que o perfil chega completo prenderia na tela "Meu Perfil"
    // o aluno que concluiu antes desta spec — barrado, para sempre, por uma
    // caixa que nao existia quando ele entrou (decisao 9).
    if (completing && !alreadyOnboarded && !alreadyAccepted && dto.policyAccepted !== true) {
      throw new BadRequestException(
        'Para concluir o cadastro e necessario aceitar a Politica de Privacidade.',
      );
    }

    // Gravado uma vez so: a data prova quando o titular aceitou, e reescreve-la
    // a cada PATCH apagaria justamente o que ela prova.
    const acceptance =
      !alreadyAccepted && dto.policyAccepted === true
        ? { policyAcceptedAt: new Date(), policyAcceptedVersion: dto.policyVersion }
        : {};

    const data = { ...profile, onboardingCompleted: completing, ...acceptance };

    return this.prisma.user.upsert({
      where: { id: user.uid },
      update: data,
      create: { id: user.uid, email: user.email, ...data },
    });
  }
}
