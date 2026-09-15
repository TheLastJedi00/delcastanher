/**
 * Chave de `data` que marca uma rota como "tela de altura cheia".
 *
 * O shell do AVA serve dois modelos de conteudo incompativeis: a trilha e uma
 * tela de dois paineis que ocupa exatamente a altura util e rola por dentro,
 * enquanto o hub, os materiais, o perfil, o certificado e os artigos sao
 * paginas de fluxo normal, que crescem com o conteudo e rolam por fora.
 *
 * Sem esta marcacao o shell fica preso ao primeiro modelo, e toda pagina mais
 * alta que a area util vaza para fora da propria caixa — passando por cima do
 * rodape de links legais, que fica encalhado no meio do conteudo.
 *
 * Segue o mesmo padrao de `SEO_DATA_KEY`: a rota declara o que precisa, e o
 * shell le a rota ativa mais profunda.
 */
export const FULL_HEIGHT_DATA_KEY = 'fullHeight';
