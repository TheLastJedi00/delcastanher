# Acréscimos à Política de Privacidade (Spec 024, Task 3.5)

**O que é:** três parágrafos novos para o **fim da seção 15** ("Informações específicas desta plataforma") da Política de Privacidade publicada. Essa seção já é o complemento operacional redigido pela Delcastanher, fora do texto revisado pelo jurídico. Por isso os acréscimos entram nela, e as seções 1 a 14 ficam como estão.

**Por que:**
- Desde a Spec 023, o checkout grava o CPF e o endereço do comprador para a nota fiscal (decisão A3). Com a Spec 024.2, a nota passou a ser a **NFS-e**, que exige CPF e nome do tomador e leva o endereço quando completo.
- Desde a Spec 024, a plataforma envia o e-mail "Compra confirmada" (decisão D6).
- Desde a Spec 023, há e-mails de novidades para alunos, com descadastro (decisão B5).

A seção 3 já cita CPF e endereço, e a seção 4 já cita a emissão de documentos fiscais. Faltava dizer como isso acontece nesta plataforma.

**Como publicar (cliente):**
1. `/admin` → Políticas & Termos → Política de Privacidade → **Editar**.
2. Colar os três parágrafos abaixo no fim da seção 15, cada um separado por uma linha em branco.
3. Conferir a pré-visualização e **Publicar** como **nova versão**. Uma nova versão reabre o pedido de consentimento de cookies para todos, como a seção 15 já explica.

---

Para a emissão da nota fiscal de serviço eletrônica (NFS-e) de cada compra, a Delcastanher registra no pedido o CPF, o nome e o endereço do comprador (CEP, logradouro, número, complemento, bairro, cidade e estado). O CPF e o nome são exigidos pela legislação fiscal para identificar o tomador do serviço, e o endereço completa essa identificação. Esses dados são tratados com base no cumprimento de obrigação legal. Eles são enviados à empresa responsável pela emissão da nota fiscal, que atua como operadora, e ficam guardados junto com a nota pelo prazo exigido pela legislação fiscal. Esses dados não são usados para nenhuma outra finalidade e não aparecem em nenhuma área pública da plataforma.

Depois de cada compra aprovada, a Delcastanher envia ao e-mail da conta do comprador a confirmação da compra e, quando emitida, a nota fiscal com seus arquivos. São mensagens ligadas à execução do contrato e ao cumprimento de obrigação legal, e por isso continuam sendo enviadas mesmo para quem optou por não receber novidades. O envio é feito por um provedor de e-mail que atua como operador.

Alunos da plataforma podem receber por e-mail novidades sobre os cursos e conteúdos da Delcastanher, com base no legítimo interesse de manter contato com quem já é aluno. Todo e-mail de novidades traz um link para cancelar o recebimento em um clique, e a preferência também pode ser alterada a qualquer momento no perfil, pelo item "Receber novidades por e-mail".
