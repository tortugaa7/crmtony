# Changelog

## Estabilização

- Atualizada a persistência local para a versão 2, mantendo migração automática dos dados anteriores.
- Adicionada validação e normalização de clientes, datas, valores, IDs e backups importados.
- Adicionado histórico de criação e mudanças de etapa.
- Reforçadas busca, retorno de WhatsApp, mensagens de erro e recuperação diante de falha do armazenamento local.
- Adicionados retornos vencidos e de hoje no dashboard.
- Melhoradas responsividade, foco por teclado, fechamento de modal e acessibilidade básica.
- Seletores de origem e prioridade agora usam as configurações de `config.js`.
- Incluídas instruções de deploy, rotina de backup e relatório de validação.

## Relatórios e parceiros

- Adicionados filtros mensal, trimestral e anual no dashboard e na aba de relatórios.
- Vendas e faturamento agora usam a data de fechamento, preservada após o cliente avançar para produção, instalação ou pós-venda.
- Adicionados alertas para vendas sem data de fechamento, evitando atribuição incorreta a um mês.
- Criados PDFs diretos do período e de cada cliente, sem biblioteca externa ou backend.
- Adicionados parceiros por tipo, vínculo de indicação no cliente e histórico de indicações, vendas, contratos e valores por parceiro.
- Adicionados campos de contrato/pedido e link externo de contrato ao cadastro do cliente.
