# Checklist de publicação

## Antes de enviar ao GitHub

- [ ] Confirme que os arquivos desta pasta estão na raiz do repositório.
- [ ] Não envie backups reais (`.json`) de clientes para um repositório público.
- [ ] Abra `config.js` e confirme o nome, as origens e a mensagem do WhatsApp.
- [ ] Abra o CRM localmente, cadastre um cliente de teste e exporte um backup.

## Na Vercel

- [ ] Importe o repositório correto.
- [ ] Selecione **Other** como framework.
- [ ] Não defina Build Command nem Output Directory.
- [ ] Faça o deploy.
- [ ] Abra a URL final no computador e no celular.
- [ ] Faça um cadastro de teste, edite a etapa e confira o histórico.

## Depois da publicação

- [ ] Exporte um backup inicial.
- [ ] Defina uma rotina semanal de backup.
- [ ] Oriente a equipe que os dados não são compartilhados entre dispositivos nesta versão.
- [ ] Antes de qualquer importação, exporte o backup atual.

## Se algo parecer errado

1. Não limpe os dados do navegador.
2. Exporte um backup, se o CRM ainda abrir.
3. Verifique se o arquivo importado é um JSON criado pelo próprio CRM.
4. Faça uma cópia do backup antes de tentar importar novamente.
