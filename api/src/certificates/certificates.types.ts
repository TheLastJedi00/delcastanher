/**
 * A que a conclusao se refere. `course` e o diploma da trilha inteira (Spec
 * 008); `module` e o diploma de um modulo (Spec 010, decisao 11). Os dois
 * convivem no mesmo model: a diferenca e `moduleId` nulo ou preenchido.
 */
export type CertificateScope = 'course' | 'module';

/**
 * Diploma como o proprio aluno o ve. Nome, curso e carga horaria vem das
 * relacoes no momento da leitura — nao ha copia guardada no certificado.
 */
export interface StudentCertificate {
  code: string;
  hash: string;
  scope: CertificateScope;
  studentName: string;
  courseTitle: string;
  /** Nulo no diploma do curso; o titulo do modulo no diploma de modulo. */
  moduleTitle: string | null;
  /** Id do modulo certificado, para a trilha ligar o diploma ao modulo. */
  moduleId: string | null;
  /** Nulo enquanto a carga horaria for placeholder no comercial. */
  workloadHours: number | null;
  issuedAt: Date;
  status: 'ACTIVE' | 'REVOKED';
}

/**
 * O que o portal publico pode mostrar a um terceiro. Deliberadamente sem
 * e-mail, telefone, uid do aluno, id do certificado ou id do modulo: quem
 * verifica precisa confirmar uma conclusao, nao receber os dados de contato do
 * aluno nem as chaves internas da plataforma (decisao 12).
 */
export interface PublicCertificate {
  code: string;
  scope: CertificateScope;
  studentName: string;
  courseTitle: string;
  moduleTitle: string | null;
  workloadHours: number | null;
  issuedAt: Date;
}

/** Por que um certificado existente nao vale. */
export type InvalidReason = 'revoked' | 'tampered';

/**
 * Resposta da verificacao publica. "not_found" e codigo inexistente;
 * "invalid" e certificado que existe mas nao vale (Spec 008, decisao 8).
 */
export type CertificateVerification =
  | { status: 'valid'; certificate: PublicCertificate }
  | { status: 'invalid'; reason: InvalidReason }
  | { status: 'not_found' };
