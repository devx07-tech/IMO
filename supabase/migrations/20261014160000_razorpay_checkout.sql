-- Razorpay checkout replaces direct UPI payments.
--  * provider_order_id holds the Razorpay order id, provider_payment_id the
--    Razorpay payment id (already unique).
--  * customer_phone is the customer's WhatsApp number, used for the admin's
--    WhatsApp message and for the customer's purchase history lookup.

alter table public.orders
  alter column payment_provider set default 'razorpay',
  add column customer_phone text;

create index idx_orders_customer_phone on public.orders (customer_phone)
  where customer_phone is not null;

create unique index orders_provider_order_id_key on public.orders (provider_order_id)
  where provider_order_id is not null;
