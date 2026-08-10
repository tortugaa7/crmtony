-- Tony CRM: execute uma única vez no SQL Editor do Supabase.
-- Todos os usuários autenticados do projeto compartilham o mesmo CRM.

create table if not exists public.crm_workspace_state (
  workspace_id text primary key,
  clients jsonb not null default '[]'::jsonb,
  partners jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.crm_workspace_state enable row level security;

drop policy if exists "crm authenticated shared access" on public.crm_workspace_state;
create policy "crm authenticated shared access"
on public.crm_workspace_state
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.crm_workspace_state to authenticated;

create or replace function public.touch_crm_workspace_state()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_crm_workspace_state_updated_at on public.crm_workspace_state;
create trigger set_crm_workspace_state_updated_at
before update on public.crm_workspace_state
for each row execute function public.touch_crm_workspace_state();

-- Sincronização em tempo real. Caso o SQL Editor informe que a tabela já existe
-- na publicação, pode ignorar somente esta última linha.
alter publication supabase_realtime add table public.crm_workspace_state;
