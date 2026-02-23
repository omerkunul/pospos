-- Hotel Lobby + Bar/Restaurant POS MVP (Supabase/Postgres)
-- Demo policies are intentionally open for quick start.
-- Tighten RLS and move to Supabase Auth before production.

create extension if not exists pgcrypto;

create table if not exists public.outlets (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id bigint generated always as identity primary key,
  room_number text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.guests (
  id bigint generated always as identity primary key,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.stays (
  id bigint generated always as identity primary key,
  guest_id bigint not null constraint stays_guest_id_fkey references public.guests(id),
  room_id bigint not null constraint stays_room_id_fkey references public.rooms(id),
  check_in timestamptz not null default now(),
  check_out_plan timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  note text,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  outlet_id bigint not null constraint menu_items_outlet_id_fkey references public.outlets(id),
  category text not null default 'Genel',
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  stay_id bigint constraint orders_stay_id_fkey references public.stays(id),
  outlet_id bigint not null constraint orders_outlet_id_fkey references public.outlets(id),
  order_source text not null default 'pos',
  status text not null default 'closed' check (status in ('open', 'closed', 'cancelled')),
  note text,
  printed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null constraint order_items_order_id_fkey references public.orders(id) on delete cascade,
  menu_item_id bigint not null constraint order_items_menu_item_id_fkey references public.menu_items(id),
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  stay_id bigint not null constraint payments_stay_id_fkey references public.stays(id),
  method text not null,
  amount numeric(12,2) not null check (amount <> 0),
  entry_type text not null default 'payment' check (entry_type in ('payment', 'reversal', 'adjustment')),
  reference_payment_id bigint constraint payments_reference_payment_id_fkey references public.payments(id),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_audit_logs (
  id bigint generated always as identity primary key,
  stay_id bigint not null constraint payment_audit_logs_stay_id_fkey references public.stays(id),
  payment_id bigint constraint payment_audit_logs_payment_id_fkey references public.payments(id),
  action text not null check (action in ('cancel', 'edit')),
  old_amount numeric(12,2),
  new_amount numeric(12,2),
  old_method text,
  new_method text,
  reason text,
  actor_user_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_users (
  id bigint generated always as identity primary key,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('resepsiyon', 'servis', 'admin')),
  pin_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_stays_status on public.stays(status);
create index if not exists idx_orders_stay on public.orders(stay_id);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_payments_stay on public.payments(stay_id);
create index if not exists idx_payment_audit_logs_stay on public.payment_audit_logs(stay_id);
create index if not exists idx_payment_audit_logs_payment on public.payment_audit_logs(payment_id);
create index if not exists idx_staff_users_username on public.staff_users(username);
create unique index if not exists idx_menu_items_outlet_name on public.menu_items(outlet_id, name);

alter table if exists public.menu_items add column if not exists category text not null default 'Genel';
alter table if exists public.menu_items add column if not exists image_url text;
alter table if exists public.payments add column if not exists entry_type text not null default 'payment';
alter table if exists public.payments add column if not exists reference_payment_id bigint;
create index if not exists idx_payments_reference_payment on public.payments(reference_payment_id);

alter table if exists public.payments drop constraint if exists payments_amount_check;
alter table if exists public.payments add constraint payments_amount_check check (amount <> 0);
alter table if exists public.payments drop constraint if exists payments_entry_type_check;
alter table if exists public.payments
  add constraint payments_entry_type_check
  check (entry_type in ('payment', 'reversal', 'adjustment'));

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payments'
      and constraint_name = 'payments_reference_payment_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_reference_payment_id_fkey
      foreign key (reference_payment_id) references public.payments(id);
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payment_audit_logs'
      and constraint_name = 'payment_audit_logs_actor_user_id_fkey'
  ) then
    alter table public.payment_audit_logs
      add constraint payment_audit_logs_actor_user_id_fkey
      foreign key (actor_user_id) references public.staff_users(id);
  end if;
end $$;

insert into public.outlets(name)
values ('Restoran'), ('Bar')
on conflict (name) do nothing;

insert into public.staff_users(username, display_name, role, pin_code)
values
  ('resepsiyon', 'Resepsiyon Operatörü', 'resepsiyon', '1234'),
  ('servis', 'Servis Personeli', 'servis', '1234'),
  ('admin', 'Sistem Yöneticisi', 'admin', '1234')
on conflict (username) do update
set display_name = excluded.display_name,
    role = excluded.role,
    pin_code = excluded.pin_code,
    is_active = true;

create or replace view public.v_order_totals as
select
  o.id as order_id,
  o.stay_id,
  o.outlet_id,
  o.created_at,
  coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(12,2) as total
from public.orders o
left join public.order_items oi on oi.order_id = o.id
group by o.id;

create or replace view public.v_stay_balance as
select
  s.id as stay_id,
  s.status,
  coalesce(ch.charge_total, 0)::numeric(12,2) as charge_total,
  coalesce(py.payment_total, 0)::numeric(12,2) as payment_total,
  (coalesce(ch.charge_total, 0) - coalesce(py.payment_total, 0))::numeric(12,2) as balance
from public.stays s
left join (
  select stay_id, sum(total) as charge_total
  from public.v_order_totals
  where stay_id is not null
  group by stay_id
) ch on ch.stay_id = s.id
left join (
  select stay_id, sum(amount) as payment_total
  from public.payments
  group by stay_id
) py on py.stay_id = s.id;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant select on public.v_order_totals, public.v_stay_balance to anon, authenticated;

alter table public.outlets enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.stays enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_audit_logs enable row level security;
alter table public.staff_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'outlets' and policyname = 'demo_all_outlets'
  ) then
    create policy demo_all_outlets on public.outlets for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'demo_all_rooms'
  ) then
    create policy demo_all_rooms on public.rooms for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'guests' and policyname = 'demo_all_guests'
  ) then
    create policy demo_all_guests on public.guests for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'stays' and policyname = 'demo_all_stays'
  ) then
    create policy demo_all_stays on public.stays for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'menu_items' and policyname = 'demo_all_menu_items'
  ) then
    create policy demo_all_menu_items on public.menu_items for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'demo_all_orders'
  ) then
    create policy demo_all_orders on public.orders for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'order_items' and policyname = 'demo_all_order_items'
  ) then
    create policy demo_all_order_items on public.order_items for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'demo_all_payments'
  ) then
    create policy demo_all_payments on public.payments for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_audit_logs' and policyname = 'demo_all_payment_audit_logs'
  ) then
    create policy demo_all_payment_audit_logs on public.payment_audit_logs for all to anon, authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'staff_users' and policyname = 'demo_all_staff_users'
  ) then
    create policy demo_all_staff_users on public.staff_users for all to anon, authenticated using (true) with check (true);
  end if;
end $$;
