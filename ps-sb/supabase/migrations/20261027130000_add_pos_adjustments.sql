create table if not exists public.pos_transaction_adjustments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.pos_transactions(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('refund', 'void')),
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint pos_transaction_adjustments_approval_check
    check (
      (status = 'approved' and approved_by is not null and reviewed_at is not null)
      or (status <> 'approved' and approved_by is null and reviewed_at is null)
    )
);

create index if not exists pos_transaction_adjustments_transaction_idx
  on public.pos_transaction_adjustments (transaction_id, created_at desc);

create index if not exists pos_transaction_adjustments_pending_idx
  on public.pos_transaction_adjustments (status, created_at)
  where status = 'pending';

create unique index if not exists pos_transaction_one_pending_adjustment_idx
  on public.pos_transaction_adjustments (transaction_id)
  where status = 'pending';

alter table public.pos_transaction_adjustments
  drop constraint if exists pos_transaction_adjustments_approval_check;
alter table public.pos_transaction_adjustments
  add constraint pos_transaction_adjustments_approval_check
  check (
    (status = 'pending' and approved_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and approved_by is not null and reviewed_at is not null)
  );

alter table public.pos_transaction_adjustments enable row level security;
