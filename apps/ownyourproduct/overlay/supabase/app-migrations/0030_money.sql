-- OwnYourProduct app migration: money. Expenses and supply purchases per salon,
-- next to the wizard's auth schema. Bookings themselves live in Chatfuel; the
-- Money screen reads them through the API and keeps only what Chatfuel does not
-- have: what the salon spent. Managers (owner, admin) read and write; a
-- specialist sees none of it. Rows are never deleted, only marked.

create or replace function public.cf_oyp_is_manager(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cf_members m
    where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  )
$$;
revoke execute on function public.cf_oyp_is_manager(uuid) from public, anon;
grant execute on function public.cf_oyp_is_manager(uuid) to authenticated;

create table if not exists public.cf_oyp_expenses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.cf_tenants (id) on delete cascade,
  bot_id      text not null,
  occurred_on date not null,
  concept     text not null check (char_length(btrim(concept)) between 1 and 200),
  amount      numeric(14, 2) not null check (amount >= 0),
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  note        text check (note is null or char_length(note) <= 1000),
  created_by  uuid references public.cf_profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists cf_oyp_expenses_tenant_day on public.cf_oyp_expenses (tenant_id, occurred_on desc) where deleted_at is null;

create table if not exists public.cf_oyp_supplies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.cf_tenants (id) on delete cascade,
  bot_id      text not null,
  occurred_on date not null,
  item        text not null check (char_length(btrim(item)) between 1 and 200),
  quantity    numeric(12, 2) not null check (quantity > 0),
  cost        numeric(14, 2) not null check (cost >= 0),
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  created_by  uuid references public.cf_profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists cf_oyp_supplies_tenant_day on public.cf_oyp_supplies (tenant_id, occurred_on desc) where deleted_at is null;

alter table public.cf_oyp_expenses enable row level security;
alter table public.cf_oyp_supplies enable row level security;

drop policy if exists cf_oyp_expenses_manager_select on public.cf_oyp_expenses;
create policy cf_oyp_expenses_manager_select on public.cf_oyp_expenses
  for select to authenticated using (public.cf_oyp_is_manager(tenant_id));
drop policy if exists cf_oyp_expenses_manager_insert on public.cf_oyp_expenses;
create policy cf_oyp_expenses_manager_insert on public.cf_oyp_expenses
  for insert to authenticated with check (public.cf_oyp_is_manager(tenant_id) and created_by = auth.uid());
drop policy if exists cf_oyp_expenses_manager_update on public.cf_oyp_expenses;
create policy cf_oyp_expenses_manager_update on public.cf_oyp_expenses
  for update to authenticated using (public.cf_oyp_is_manager(tenant_id)) with check (public.cf_oyp_is_manager(tenant_id));

drop policy if exists cf_oyp_supplies_manager_select on public.cf_oyp_supplies;
create policy cf_oyp_supplies_manager_select on public.cf_oyp_supplies
  for select to authenticated using (public.cf_oyp_is_manager(tenant_id));
drop policy if exists cf_oyp_supplies_manager_insert on public.cf_oyp_supplies;
create policy cf_oyp_supplies_manager_insert on public.cf_oyp_supplies
  for insert to authenticated with check (public.cf_oyp_is_manager(tenant_id) and created_by = auth.uid());
drop policy if exists cf_oyp_supplies_manager_update on public.cf_oyp_supplies;
create policy cf_oyp_supplies_manager_update on public.cf_oyp_supplies
  for update to authenticated using (public.cf_oyp_is_manager(tenant_id)) with check (public.cf_oyp_is_manager(tenant_id));

grant select, insert, update on public.cf_oyp_expenses to authenticated;
grant select, insert, update on public.cf_oyp_supplies to authenticated;
