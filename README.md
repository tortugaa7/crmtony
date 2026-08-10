# Tony CRM

CRM interno da Tony Acabamentos para acompanhar o cliente desde o primeiro contato no WhatsApp até o pós-venda.

É uma aplicação sem framework e sem etapa de compilação. Esta versão usa **Supabase** para login e dados compartilhados: basta configurar a URL e a chave pública, executar o SQL fornecido e subir a pasta para o GitHub/Vercel.

## O que esta versão entrega

- Funil com as 9 etapas oficiais do comercial, produção e instalação.
- Dashboard com resultados fechados, visão operacional atual e retornos que exigem atenção.
- Dashboard mensal, trimestral e anual com resultados separados pelo período escolhido.
- Vendas contabilizadas pela data de fechamento, sem misturar faturamento de meses diferentes.
- Kanban com arrastar e soltar, ordenado automaticamente pela urgência em cada coluna.
- Aba **Urgências** para retornos próximos/vencidos, instalações e entregas próximas do prazo.
- Central de notificações com aviso na área de trabalho quando permitido no navegador.
- Cadastro, edição e exclusão de clientes.
- Histórico automático de criação, mudanças de etapa e data de fechamento.
- Data de fechamento, número/link de contrato e parceiro de indicação por cliente.
- Aba de parceiros para arquitetos, construtores e outros, com histórico das indicações, contratos, vendas e valores fechados.
- Busca ampla por nome, contato, cidade, endereço, serviço, responsável, origem e observações.
- Atalho seguro para o WhatsApp quando há um número válido.
- Dados validados antes de salvar ou importar.
- Relatório do período em PDF e relatório individual de cada cliente em PDF, baixados diretamente pelo navegador.
- Backup em JSON, incluindo parceiros, importação com confirmação e migração automática da versão anterior do CRM.
- Atualização da tela quando outra aba do mesmo navegador alterar os dados.
- Login por e-mail e senha, com cadastro simples de novos usuários.
- Base compartilhada entre computadores e celulares, com sincronização em tempo real e conferência automática de alterações.
- Layout responsivo para computador e celular, com suporte a teclado e redução de movimento.

## Fluxo oficial

1. Chegou no WhatsApp
2. Propenso a fechar
3. Aguardando orçamento
4. Fechou com a gente
5. Aguardando medição
6. Em produção
7. Produção finalizada / aguardando instalação
8. Em instalação
9. Pós-venda

## Urgências, prazos e notificações

- Dentro de cada coluna do **Funil**, a prioridade é a regra principal: **Urgente → Alta → Média → Baixa**. Em clientes com a mesma prioridade, os prazos críticos vêm primeiro.
- Clientes com **Data da instalação / entrega** vencida ou dentro dos próximos **3 dias** piscam no funil e entram automaticamente na aba **Urgências**.
- Retornos vencidos, de hoje ou dos próximos 3 dias também entram na central e na aba de urgências.
- Clique no sino no topo e escolha **Ativar avisos na área de trabalho** para receber notificações do navegador enquanto o CRM estiver aberto em uma aba. A permissão pode ser alterada depois nas configurações do navegador.

O período de 3 dias pode ser ajustado em `config.js` por `installationUrgencyDays` e `returnNotificationDays`.

## Como os resultados por período funcionam

A regra usada no dashboard e nos PDFs é simples e segura:

- **Leads cadastrados:** entram pela data de cadastro do cliente.
- **Vendas fechadas e faturamento:** entram exclusivamente pela **Data de fechamento** do cliente.
- Um cliente fechado em julho continua aparecendo em produção ou pós-venda normalmente, mas o faturamento dele fica somente em julho, no 3º trimestre e no ano correspondente.
- Se uma venda antiga não tiver data de fechamento, ela não é colocada em um mês por adivinhação. O CRM mostra um aviso para a data ser preenchida corretamente.

Ao mover um cliente do comercial para “Fechou com a gente”, a data de hoje é sugerida automaticamente. Para vendas antigas ou situações especiais, altere essa data no cadastro do cliente antes de salvar.

## Relatórios em PDF

- Na aba **Relatórios**, escolha o recorte **Mensal**, **Trimestral** ou **Anual** e clique em **Baixar relatório em PDF**.
- O PDF do período traz os indicadores e a relação das vendas fechadas nele.
- Para baixar o PDF de uma pessoa específica, abra o cliente e clique em **Relatório PDF**. Ele inclui situação, serviço, valor, contrato, parceiro, observações e histórico comercial.

Os PDFs são criados no próprio navegador e não dependem de serviço externo.

## Parceiros e indicações

Na aba **Parceiros**, cadastre arquitetos, construtores e outros parceiros. Depois, ao criar ou editar um cliente, selecione o parceiro no campo **Parceiro / indicação**.

Ao abrir um parceiro, você vê todas as indicações vinculadas, a etapa de cada cliente, contrato/pedido, data de fechamento e valor. O contrato pode ser identificado por número e, se estiver em Drive ou outro local, por um link externo no cliente.

## Publicar no GitHub, Supabase e Vercel

Siga o guia [SUPABASE_E_VERCEL.md](./SUPABASE_E_VERCEL.md). Em resumo: execute `supabase-setup.sql` no SQL Editor, copie a URL e a chave **anon/publishable** para `config.js`, envie esta pasta à raiz do repositório e deixe a Vercel fazer o deploy. Use **Other**, sem build e sem pasta de saída.

## Onde os dados ficam

Os dados ficam no Supabase e são compartilhados por todos os usuários autenticados do CRM. Uma cópia local é mantida apenas como contingência e para ajudar em caso de falha momentânea de internet.

- Faça backup JSON periodicamente, principalmente antes de grandes importações.
- O backup inclui clientes, parceiros, contratos cadastrados e históricos; ele não baixa arquivos anexados em links externos.
- Todo usuário que criar acesso no mesmo projeto Supabase verá a base compartilhada. Compartilhe o link do CRM somente com a equipe.
- A chave `service_role` nunca pode ser usada no navegador, GitHub, Vercel ou `config.js`.
- Avisos na área de trabalho funcionam enquanto o CRM permanece aberto em uma aba; para avisos com o navegador totalmente fechado seria necessário um serviço de notificações com servidor.

## Configurações rápidas

Use somente o arquivo [config.js](./config.js) para alterar:

- Nome da empresa e nome curto.
- Mensagem inicial do WhatsApp.
- Origens de lead.
- Prioridades.
- Quantidade de dias para alertas de retorno e instalação / entrega.
- Nomes, ordem e grupos das etapas.
- Tipos de parceiros.

Ao alterar etapas que já possuem clientes, faça um backup primeiro. O CRM mantém uma etapa válida caso encontre um nome de etapa removido, mas o ideal é planejar essa alteração.

## Rotina recomendada

1. Cadastre cada novo atendimento assim que ele chegar.
2. Preencha próximo retorno sempre que houver uma pendência.
3. Use o dashboard no começo do dia para tratar retornos vencidos e do dia.
4. Mova o cliente pelo funil à medida que a venda e a produção evoluírem.
5. Exporte um backup pelo menos uma vez por semana e antes de importar outro arquivo.
6. Antes de fechar um relatório, confira se as vendas recentes têm a data de fechamento correta.

Veja também [ARCHITECTURE.md](./ARCHITECTURE.md), [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md), [TEST_REPORT.md](./TEST_REPORT.md) e [CHANGELOG.md](./CHANGELOG.md).
