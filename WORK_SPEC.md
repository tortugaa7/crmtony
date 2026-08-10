# Especificação do CRM para futuras edições no ChatGPT Work

Objetivo: manter um CRM interno simples, rápido e operacional, sem transformar o projeto em um ERP complexo.

## Fluxo oficial
Comercial: WhatsApp → Propenso a fechar → Aguardando orçamento → Fechado.
Operação: Aguardando medição → Em produção → Produção finalizada/aguardando instalação → Em instalação → Pós-venda.

## Regras para futuras alterações
1. Preservar o fluxo acima, salvo pedido explícito.
2. Não adicionar bibliotecas ou frameworks sem necessidade.
3. Manter publicação estática compatível com Vercel sempre que possível.
4. Centralizar textos e etapas em `config.js`.
5. Manter responsividade para desktop e celular.
6. Manter exportação/importação de backup com validação e confirmação antes de substituir a base.
7. Preservar histórico automático de criação e mudanças de etapa.
8. Preservar a data de fechamento como fonte dos relatórios mensal, trimestral e anual.
9. Preservar parceiros/indicações, contrato/pedido e relatórios em PDF sem dependência externa.
10. Não criar segurança fictícia: login e multiusuário só quando houver banco/autenticação reais.
11. Manter no funil a ordenação de urgência: prazos críticos, depois Urgente, Alta, Média e Baixa.
12. Manter a aba de urgências automática para retornos e instalações / entregas próximas ou vencidas.

## Dados e estabilidade

- Os dados locais usam a chave `tony_crm_clients_v2`; a versão antiga é migrada automaticamente no mesmo navegador.
- Parceiros usam a chave `tony_crm_partners_v1` e são incluídos no mesmo backup dos clientes.
- A importação valida clientes e parceiros, descartando registros malformados antes de substituir a base.
- Fechamentos sem `closedAt` devem ficar fora dos resultados por período até a data real ser registrada.
- `installationDate` é a data de instalação / entrega e deve disparar urgência quando estiver vencida ou dentro da janela configurada.
- Avisos de área de trabalho dependem de permissão do navegador e só funcionam enquanto o CRM está aberto em uma aba.
- Antes de alterar `config.js`, exportar um backup.
- Não adicionar dependências, build, backend ou integrações simuladas sem uma necessidade explícita.

## Evolução recomendada para uso em equipe
Conectar Supabase/Postgres e autenticação para sincronizar dados entre dispositivos. Para entrada automática de leads do WhatsApp, usar WhatsApp Business Platform/API + webhook/backend; não simular essa integração no frontend.
