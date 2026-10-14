-- Direct UPI payments to our own merchant UPI ID (no third-party gateway).
--  * Each open order gets a unique paise amount so an incoming payment maps to
--    exactly one order.
--  * An Android phone forwards "payment received" notifications to the site
--    (the payment bridge); every forwarded message is kept in upi_payment_events.
--  * Customers can submit their UPI reference (UTR) when automatic matching
--    hasn't confirmed the payment, for admin review.

alter table public.orders
  alter column payment_provider set default 'upi',
  add column expires_at timestamptz,
  add column customer_utr text,
  add column customer_utr_at timestamptz;

-- Two open UPI orders can never share an amount, so a payment of that exact
-- amount identifies a single order.
create unique index orders_open_upi_amount_key on public.orders (amount)
  where payment_provider = 'upi' and payment_status = 'pending';

-- A UPI reference number confirms at most one order.
create unique index orders_provider_payment_id_key on public.orders (provider_payment_id)
  where provider_payment_id is not null;

create index idx_orders_customer_utr on public.orders (customer_utr)
  where customer_utr is not null;

create table public.upi_payment_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null,
  raw_text text not null,
  amount numeric,
  utr text,
  payer text,
  status text not null check (status in ('matched','unmatched','duplicate','ignored','dismissed')),
  order_id uuid references public.orders(id),
  resolved_at timestamptz
);

-- The same payment forwarded twice (e.g. SMS and app notification) is stored once.
create unique index upi_payment_events_utr_key on public.upi_payment_events (utr)
  where utr is not null;
create index idx_upi_payment_events_received_at on public.upi_payment_events (received_at desc);
create index idx_upi_payment_events_status on public.upi_payment_events (status);
create index idx_upi_payment_events_order_id on public.upi_payment_events (order_id);

alter table public.upi_payment_events enable row level security;

-- Store the exact text sent so alerts without an order (e.g. an unmatched
-- payment) can be retried.
alter table public.notifications add column message text;
