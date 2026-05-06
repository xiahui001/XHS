create extension if not exists "pgcrypto";

do $$ begin
  create type account_status as enum ('active', 'paused', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type hotspot_status as enum ('available', 'needs_review', 'discarded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type material_status as enum ('available', 'used', 'blocked', 'needs_license_review');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type draft_status as enum ('pending_review', 'selected', 'needs_edit', 'published', 'discarded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type generation_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type conversation_status as enum ('open', 'waiting_human', 'lead_created', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type lead_status as enum ('new', 'contacted', 'quoted', 'proposal', 'won', 'invalid');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type xhs_binding_state as enum ('unbound', 'binding', 'bound', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type audit_object_type as enum (
    'account',
    'hotspot_ref',
    'material',
    'generation_job',
    'draft',
    'conversation',
    'lead',
    'prompt'
  );
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists xhs_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  xhs_display_name text,
  positioning text not null,
  audience_profile text,
  content_angles text[] not null default '{}',
  default_tags text[] not null default '{}',
  daily_publish_target int not null default 3,
  daily_candidate_target int not null default 6,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hotspot_refs (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  industry text not null,
  source_type text not null,
  source_name text,
  source_url text,
  reference_title text not null,
  reference_summary text not null,
  hotness_note text,
  applicable_account_ids uuid[] not null default '{}',
  status hotspot_status not null default 'available',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_platform text not null,
  source_url text,
  storage_path text,
  thumbnail_path text,
  license_note text not null,
  allow_derivative boolean not null default false,
  allow_commercial_publish boolean not null default false,
  industry_tags text[] not null default '{}',
  used_count int not null default 0,
  status material_status not null default 'available',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  target_account_ids uuid[] not null default '{}',
  candidates_per_account int not null default 6,
  total_target_count int not null default 30,
  hotspot_ref_ids uuid[] default '{}',
  status generation_status not null default 'queued',
  error_message text,
  created_by uuid references profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid references generation_jobs(id) on delete set null,
  account_id uuid references xhs_accounts(id) on delete cascade,
  industry text not null,
  topic text not null,
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  cover_title_options text[] not null default '{}',
  image_structure jsonb not null default '[]'::jsonb,
  quality_score int,
  quality_notes jsonb,
  status draft_status not null default 'pending_review',
  selected_at timestamptz,
  published_at timestamptz,
  published_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_usages (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  account_id uuid not null references xhs_accounts(id) on delete cascade,
  draft_id uuid references drafts(id) on delete set null,
  usage_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists draft_images (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  sort_order int not null,
  role text not null,
  caption_note text,
  created_at timestamptz not null default now()
);

create table if not exists reply_intents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  required_fields text[] not null default '{}',
  reply_strategy text not null,
  handoff_required boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references xhs_accounts(id) on delete cascade,
  xhs_user_nickname text not null,
  source_note_url text,
  latest_intent_id uuid references reply_intents(id),
  status conversation_status not null default 'open',
  needs_human boolean not null default false,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null,
  content text not null,
  detected_intent_id uuid references reply_intents(id),
  missing_fields text[],
  suggested_reply text,
  risk_flags text[],
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  account_id uuid not null references xhs_accounts(id) on delete cascade,
  source_note_url text,
  customer_nickname text not null,
  phone text,
  city text,
  event_type text,
  event_date date,
  budget_range text,
  requirement_summary text,
  status lead_status not null default 'new',
  owner_name text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  content text not null,
  next_followup_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null,
  version int not null default 1,
  system_prompt text not null,
  user_prompt_template text not null,
  json_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  object_type audit_object_type not null,
  object_id uuid not null,
  action text not null,
  summary text not null,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hotspot_refs_keyword_idx on hotspot_refs(keyword);
create index if not exists hotspot_refs_industry_idx on hotspot_refs(industry);
create index if not exists hotspot_refs_status_idx on hotspot_refs(status);
create index if not exists materials_source_platform_idx on materials(source_platform);
create index if not exists materials_status_idx on materials(status);
create index if not exists drafts_status_idx on drafts(status);
create index if not exists drafts_account_idx on drafts(account_id);
create index if not exists leads_status_idx on leads(status);
create index if not exists audit_logs_object_idx on audit_logs(object_type, object_id);
create index if not exists keyword_presets_user_account_idx on keyword_presets(user_id, account_code);

alter table profiles enable row level security;
alter table xhs_accounts enable row level security;
alter table hotspot_refs enable row level security;
alter table materials enable row level security;
alter table material_usages enable row level security;
alter table generation_jobs enable row level security;
alter table drafts enable row level security;
alter table draft_images enable row level security;
alter table reply_intents enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table leads enable row level security;
alter table lead_followups enable row level security;
alter table prompt_templates enable row level security;
alter table user_workspace_states enable row level security;
alter table keyword_presets enable row level security;
alter table xhs_binding_states enable row level security;
alter table audit_logs enable row level security;

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'xhs_accounts',
    'hotspot_refs',
    'materials',
    'material_usages',
    'generation_jobs',
    'drafts',
    'draft_images',
    'reply_intents',
    'conversations',
    'messages',
    'leads',
    'lead_followups',
    'prompt_templates',
    'audit_logs'
  ] loop
    execute format('drop policy if exists "authenticated read write" on %I', table_name);
    execute format(
      'create policy "authenticated read write" on %I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end $$;

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

insert into xhs_accounts (code, name, positioning, audience_profile, content_angles, default_tags)
values
  ('A1', '美业大健康微商活动号', '美业大健康微商活动', '美业品牌、大健康品牌、微商品牌', array['招商会','品宣会','私域会销','沙龙','培训会'], array['美业活动','大健康活动','微商大会','招商会','活动策划']),
  ('A2', '校园活动号', '校园活动', '学校、社团、教育机构、校企部门', array['开学季','社团活动','毕业典礼','校园市集','校企活动'], array['校园活动','毕业典礼','社团活动','校园市集','活动执行']),
  ('A3', '建筑行业活动号', '建筑行业活动', '建筑公司、地产公司、工程企业', array['地产开放日','工地开放日','工程发布会','建筑展会'], array['建筑活动','地产活动','开放日','展会搭建','活动布置']),
  ('A4', '商超美陈号', '商超美陈', '商场、品牌门店、商业地产', array['节日美陈','快闪店','DP 点','商业空间布置'], array['商场美陈','快闪店','商业空间','节日装置','美陈布置']),
  ('A5', '企业年会团建号', '企业年会团建', '企业行政、市场部、HR', array['年会','团建','晚宴','答谢会','会议布置'], array['企业年会','团建活动','舞台搭建','会议布置','活动执行'])
on conflict (code) do update set
  name = excluded.name,
  positioning = excluded.positioning,
  audience_profile = excluded.audience_profile,
  content_angles = excluded.content_angles,
  default_tags = excluded.default_tags;

insert into reply_intents (name, description, required_fields, reply_strategy, handoff_required)
values
  ('报价', '客户询问价格或预算', array['城市','活动时间','活动类型','人数','预算范围'], '先收集需求，提示报价需人工确认', true),
  ('档期', '客户确认指定日期是否可做', array['城市','具体日期','活动类型'], '收集时间地点后转人工确认', true),
  ('城市', '客户询问服务城市', array['城市'], '确认城市并继续收集活动需求', false),
  ('活动类型', '客户描述或询问活动类型', array['活动类型'], '匹配案例方向并继续问关键需求', false),
  ('搭建周期', '客户询问多久能搭好', array['场地','规模','进场时间'], '说明需结合规模和场地确认', true),
  ('设备清单', '客户询问灯光音响 LED 等设备', array['活动类型','人数','场地'], '收集场景后建议配置方向', false),
  ('发票合同', '客户询问合同或发票', array['公司主体','项目需求'], '转人工处理合同发票', true),
  ('人工客服', '客户要求人工沟通', array[]::text[], '直接转人工', true),
  ('投诉或负面反馈', '投诉、差评、强烈负面情绪', array[]::text[], '安抚并转人工', true)
on conflict (name) do update set
  description = excluded.description,
  required_fields = excluded.required_fields,
  reply_strategy = excluded.reply_strategy,
  handoff_required = excluded.handoff_required;
