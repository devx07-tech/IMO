-- Production hardening:
--  * shared rate-limit counters (in-memory limits don't hold across serverless instances)
--  * admin session revocation (tokens issued before sessions_valid_after are rejected)
--  * indexes for unindexed foreign keys flagged by the Supabase performance advisor

create table public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

create index idx_rate_limits_reset_at on public.rate_limits (reset_at);

alter table public.rate_limits enable row level security;

-- Atomically counts one hit for p_key inside a fixed window and reports whether
-- the caller is still under p_limit. Runs as the caller (service role only).
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
    reset_at = case when rl.reset_at <= now()
                    then now() + make_interval(secs => p_window_seconds)
                    else rl.reset_at end
  returning rl.count, rl.reset_at into v_count, v_reset;

  -- Opportunistic cleanup so the table stays small without a cron job.
  if random() < 0.01 then
    delete from public.rate_limits where reset_at < now() - interval '1 hour';
  end if;

  return query select v_count <= p_limit,
                      greatest(0, ceil(extract(epoch from (v_reset - now()))))::integer;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

alter table public.admins
  add column sessions_valid_after timestamptz not null default to_timestamp(0);

create index idx_audit_logs_admin_id on public.audit_logs (admin_id);
create index idx_orders_package_id on public.orders (package_id);
