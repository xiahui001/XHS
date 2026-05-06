do $$ begin
  create type xhs_binding_state as enum ('unbound', 'binding', 'bound', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists user_workspace_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  text_remix_prompt text not null,
  image_remix_prompt text not null,
  last_account_code text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists keyword_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_code text not null,
  raw_text text not null,
  keywords text[] not null default '{}',
  categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists xhs_binding_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_code text,
  state xhs_binding_state not null default 'unbound',
  detail text not null default '等待绑定小红书账号',
  last_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists keyword_presets_user_account_idx on keyword_presets(user_id, account_code);

alter table user_workspace_states enable row level security;
alter table keyword_presets enable row level security;
alter table xhs_binding_states enable row level security;

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'user_workspace_states',
    'keyword_presets',
    'xhs_binding_states'
  ] loop
    execute format('drop policy if exists "owner read write" on %I', table_name);
    execute format(
      'create policy "owner read write" on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name
    );
  end loop;
end $$;
