# Relatório de validação

Versão validada: estabilizada para publicação estática.

## Verificações executadas

- Sintaxe de `app.js` e `config.js` validada pelo Node.js.
- Referências de IDs entre HTML e JavaScript conferidas.
- Configuração conferida com as 9 etapas oficiais do CRM.
- Fluxo funcional validado em ambiente de DOM simulado:
  - cadastro de cliente;
  - persistência local;
  - edição de etapa e criação de histórico;
  - abertura do cliente pela lista;
  - geração de backup;
  - importação que substitui a base após confirmação;
  - atualização entre abas pelo evento de armazenamento.
- Validação adicional da versão de relatórios:
  - cadastro de parceiro e vínculo de indicação com o cliente;
  - contrato/pedido e data de fechamento;
  - venda de julho apresentada em julho, no trimestre e no ano correspondentes;
  - venda de julho ausente do resultado de agosto;
  - alerta para venda sem data de fechamento;
  - PDF do período e PDF individual do cliente, ambos validados como PDF A4 e renderizados para inspeção visual;
  - histórico do parceiro com indicação, contrato, data de fechamento e valor.
- Validação de urgência e notificações:
  - ordenação do funil com prioridade manual como regra principal (Urgente, Alta, Média e Baixa) e prazo crítico como desempate;
  - destaque visual para instalação / entrega vencida ou dentro da janela de alerta;
  - entrada automática desses clientes na aba **Urgências**;
  - contador e central de notificações;
  - solicitação de permissão e disparo controlado de avisos na área de trabalho em ambiente de DOM simulado.

## Limite conhecido

O CRM foi projetado para uma base local por navegador. A validação não substitui o uso de backups frequentes nem cria sincronização entre dispositivos.
