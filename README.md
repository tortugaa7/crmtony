# Tony CRM

CRM interno da Tony Acabamentos para acompanhar o cliente desde o primeiro contato no WhatsApp até o pós-venda.

É uma aplicação estática: não usa framework, banco de dados, conta externa ou etapa de compilação. Basta subir os arquivos desta pasta para um repositório no GitHub e importar esse repositório na Vercel.

## O que esta versão entrega

- Funil com as 9 etapas oficiais do comercial, produção e instalação.
- Dashboard com resultados fechados, visão operacional atual e retornos que exigem atenção.
- Dashboard mensal, trimestral e anual com resultados separados pelo período escolhido.
- Vendas contabilizadas pela data de fechamento, sem misturar faturamento de meses diferentes.
- Kanban com arrastar e soltar para avançar clientes de etapa.
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

## Publicar no GitHub e Vercel

1. Crie um repositório vazio no GitHub.
2. Envie **o conteúdo desta pasta** para a raiz do repositório. Os arquivos `index.html`, `styles.css`, `app.js`, `pdf-generator.js`, `config.js` e `vercel.json` devem ficar visíveis logo na raiz.
3. Na Vercel, clique em **Add New → Project**, importe o repositório e confirme o deploy.
4. Deixe o framework como **Other**. Não informe comando de build nem pasta de saída.
5. Depois do deploy, abra o link, faça um cadastro de teste e exporte um backup antes de começar a usar no dia a dia.

Não são necessárias variáveis de ambiente nem chaves de API.

## Onde os dados ficam

Os dados ficam no `localStorage` do navegador. Na prática, cada navegador/dispositivo mantém a sua própria base.

Isso torna o CRM simples de subir e usar sozinho, mas também significa que:

- Vercel não sincroniza clientes entre computadores ou celulares.
- Limpar os dados do navegador pode apagar a base local.
- Use **Exportar backup** frequentemente e guarde o arquivo JSON fora do navegador.
- O backup inclui clientes, parceiros, contratos cadastrados e históricos; ele não baixa arquivos anexados em links externos.
- Não use aba anônima para operar o CRM.

Para uso simultâneo por uma equipe, a evolução correta é adicionar banco de dados e login reais, por exemplo com Supabase/Postgres. Não há login “de aparência” nesta versão.

## Configurações rápidas

Use somente o arquivo [config.js](./config.js) para alterar:

- Nome da empresa e nome curto.
- Mensagem inicial do WhatsApp.
- Origens de lead.
- Prioridades.
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
