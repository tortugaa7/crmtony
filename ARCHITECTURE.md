# Arquitetura e regras dos dados

## Persistência local

O CRM continua sendo uma aplicação estática. Os dados ficam no navegador atual:

| Chave local | Conteúdo |
| --- | --- |
| `tony_crm_clients_v2` | Clientes, etapas, valores, contratos, fechamento e histórico comercial. |
| `tony_crm_partners_v1` | Arquitetos, construtores e outros parceiros. |
| `tony_crm_ui_v1` | Preferência visual do menu lateral. |
| `tony_crm_notifications_v1` | Chaves dos avisos de área de trabalho já exibidos, para evitar repetição. |

O backup JSON exporta clientes e parceiros juntos.

## Regra de período

| Indicador | Data usada |
| --- | --- |
| Leads cadastrados | `createdAt` do cliente. |
| Vendas fechadas | `closedAt` do cliente. |
| Faturamento fechado | Soma do valor dos clientes com `closedAt` dentro do período. |
| Ticket médio | Faturamento fechado dividido pelas vendas fechadas do período. |

Uma venda mantém `closedAt` quando avança para medição, produção, instalação ou pós-venda. Se ela voltar ao comercial, a data é removida para não continuar sendo contabilizada como venda fechada.

## Urgências operacionais

- `followUp` gera atenção quando está vencido, é hoje ou está dentro de `returnNotificationDays`.
- `installationDate` representa instalação / entrega e gera alerta visual e entrada automática na aba **Urgências** quando está vencido, é hoje ou está dentro de `installationUrgencyDays`.
- O funil prioriza prazos críticos antes da prioridade manual; depois ordena Urgente, Alta, Média e Baixa.
- O navegador pode mostrar avisos de área de trabalho após o usuário conceder permissão. Sem servidor de push, eles dependem de o CRM continuar aberto em uma aba.

## Parceiros

Um cliente pode ter um `partnerId` opcional. O painel do parceiro consulta todos os clientes ligados a esse identificador e apresenta as indicações, etapas, contratos, fechamentos e valores.

## Limites intencionais

- Não há banco de dados compartilhado entre dispositivos.
- Link de contrato aponta para um local externo; arquivos de contrato não são guardados no navegador.
- Relatórios em PDF são criados no navegador, com dados da base local no momento do download.
