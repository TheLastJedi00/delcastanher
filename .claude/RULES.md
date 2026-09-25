# Caso comando: Revisar (Ou caso não dê comando)
- Avaliar padrão atual de projeto por specs anteriores
- Rever spec atual
- Encontrar incoerências no context.md e tasks.md
- Corrigir incoerências óbvias
- Perguntar caso incorência seja mais complexa
- Corrigir no context.md e task.md
# Caso comando: Executar
- comece a executar as fases sendo uma branch feat/<> por fase e um commit por task dessa fase
- Faça perguntas se necssário
- No backend use TDD criando a suite de testes antes da aplicação no código
- ao fim das fases faça o merge das feats em uma branch release/<nome-da-spec>
- suba a branch em localhost 4200 caso front e 3000 caso backend
- Abra o chrome e faça testes nas funcionalidades adiciondas, removidas ou alteradas
# Caso encontrar discrepância no context.md ou nas tasks.md
- Executar caminho lógico focado em manutenção fácil e escalabilidade
- Destacar decisões tomadas no topo do PR aberto
# Caso de Fix.md
- Ler fix.md atual
- Caso spec encerrado e mergede na main, abrir branch fix/<bug-name> e abrir PR contra a main
- Caso PR ainda aberto contra a main, salvar correção em um commit fix na branch dona do PR aberto
- Iniciar  correção
- Caso encontrar incoerências no fix.md corrigir as incoerências e destacar as alterações tomadas no PR
# Caso comando: Formatar
- reescreva o context.md de toda a spec pra que se mantenha o mesmo porém escrito seguindo a linguagem markdown
- Pergunte se necessário pra que o context seja específico e objetivo
# Caso comando: Spec
- Crie a nova pasta da nova spec em [Specs](../.specs)
- Entenda o que os requesitos no prompt afetam
- Escreva o context.md de toda a spec pra que se mantenha o mesmo porém escrito seguindo a linguagem markdown
- Pergunte se necessário pra que o context seja específico e objetivo