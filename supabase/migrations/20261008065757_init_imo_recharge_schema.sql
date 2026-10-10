-- Reconstructed from the live "IMO" Supabase project (ref rcerznakintsxzyquqsf).
-- RLS is enabled with no policies: only the service-role key (server) can access data.

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  credits integer not null check (credits > 0),
  price numeric not null check (price > 0),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  imo_profile_id text not null,
  package_id uuid references public.packages(id),
  credits integer not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric not null,
  amount numeric not null,
  payment_provider text not null default 'cashfree',
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),
  provider_order_id text,
  provider_payment_id text,
  recharge_status text not null default 'waiting'
    check (recharge_status in ('waiting','processing','completed','failed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  channel text not null,
  event text not null,
  recipient text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_response text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index idx_notifications_order_id on public.notifications (order_id);
create index idx_notifications_status on public.notifications (status);
create index idx_orders_created_at on public.orders (created_at desc);
create index idx_orders_imo_profile_id on public.orders (imo_profile_id);
create index idx_orders_order_number on public.orders (order_number);
create index idx_orders_payment_status on public.orders (payment_status);
create index idx_orders_recharge_status on public.orders (recharge_status);

alter table public.admins enable row level security;
alter table public.packages enable row level security;
alter table public.orders enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
