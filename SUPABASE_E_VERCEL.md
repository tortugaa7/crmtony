# Colocar o Tony CRM online

## 1. Preparar o Supabase

1. Abra o projeto já criado no Supabase.
2. Em **SQL Editor**, crie uma nova consulta, cole todo o conteúdo de `supabase-setup.sql` e execute.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon** ou **publishable**. Não copie a chave `service_role`.
4. Em **Authentication → URL Configuration**, defina a URL final da Vercel em **Site URL** e adicione a mesma URL em **Redirect URLs**.
5. Em **Authentication → Providers → Email**, deixe o e-mail habilitado. Para entrada imediata, desative a confirmação de e-mail; para maior controle, mantenha-a ativa e cada pessoa confirma o próprio e-mail antes de entrar.

## 2. Ligar o CRM

No arquivo `config.js`, troque somente estas duas linhas:

```js
supabaseUrl: 'https://SEU-PROJETO.supabase.co',
supabaseAnonKey: 'SUA_CHAVE_PUBLICA_ANON_OU_PUBLISHABLE',
```

O `supabaseWorkspaceId` deve continuar como `tony-acabamentos`, a menos que você queira uma base totalmente separada.

## 3. Publicar pela Vercel

1. Envie todos os arquivos desta pasta para a raiz do repositório conectado ao GitHub.
2. Na Vercel, importe o repositório ou execute novo deploy. Use **Other**, sem comando de build e sem pasta de saída.
3. Abra o domínio gerado, clique em **Criar meu acesso** e cadastre e-mail e senha.
4. Cadastre um cliente de teste em um computador e abra o CRM com outra conta em outro navegador: o mesmo cliente deve aparecer.

## Regras importantes

- Qualquer pessoa que se cadastrar neste projeto Supabase terá acesso ao CRM compartilhado. Compartilhe o link apenas com a equipe.
- A chave anon/publishable é própria para o navegador quando as regras RLS estão ativas. A chave `service_role` jamais pode entrar no GitHub, Vercel ou `config.js`.
- O CRM mantém uma cópia local como contingência e sincroniza a base compartilhada automaticamente. Backups JSON continuam disponíveis.
- Se o realtime não conectar, o CRM verifica alterações automaticamente a cada 20 segundos.
