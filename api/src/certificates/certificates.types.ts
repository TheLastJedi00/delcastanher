/**
 * Diploma como o proprio aluno o ve. Nome, curso e carga horaria vem das
 * relacoes no momento da leitura — nao ha copia guardada no certificado.
 */
export interface StudentCertificate {
  code: string;
  hash: string;
  studentName: string;
  courseTitle: string;
  /** Nulo enquanto a carga horaria for placeholder no comercial. */
  workloadHours: number | null;
  issuedAt: Date;
  status: 'ACTIVE' | 'REVOKED';
}

/**
 * O que o portal publico pode mostrar a um terceiro. Deliberadamente sem
 * e-mail, telefone, uid do aluno ou id do certificado: quem verifica precisa
 * confirmar uma conclusao, nao receber os dados de contato do aluno.
 */
export interface PublicCertificate {
  code: string;
  studentName: string;
  courseTitle: string;
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
