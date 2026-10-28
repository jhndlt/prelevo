-- Bêta fermée : liste d’attente avec parrainage.
-- À coller à la main dans l’éditeur SQL Supabase. Rien ici n’est appliqué tout seul.
--
-- La table est fermée. RLS est activé, sans politique.
-- anon et authenticated n’ont aucun droit sur la table.
-- Seul service_role peut la lire ou l’écrire directement.
-- Le site public n’appelle que join_waitlist (security definer), avec la clé anon.
-- La fonction ne renvoie que la place et le code de la personne qui s’inscrit.
--
-- Place : chaque filleul (referred_by = le code du parrain) fait avancer le parrain.
-- À nombre de filleuls égal, l’inscription la plus ancienne passe devant.

create table if not exists public.waitlist (
  email text primary key,
  referral_code text not null,
  referred_by text,
  created_at timestamptz not null default now(),
  constraint waitlist_email_unique unique (email),
  constraint waitlist_referral_code_unique unique (referral_code),
  constraint waitlist_email_format check (
    char_length(email) <= 254
    and email ~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
  ),
  constraint waitlist_code_format check (
    referral_code ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$'
  ),
  constraint waitlist_referred_by_format check (
    referred_by is null
    or referred_by ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$'
  ),
  constraint waitlist_not_self check (referred_by is distinct from referral_code),
  constraint waitlist_referred_by_fkey
    foreign key (referred_by) references public.waitlist (referral_code) on delete set null
);

create index if not exists waitlist_referred_by_idx on public.waitlist (referred_by);

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from public, anon, authenticated;
grant select, insert, update, delete on table public.waitlist to service_role;

create or replace function public.join_waitlist(p_email text, p_referred_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ref text := lower(btrim(coalesce(p_referred_by, '')));
  v_code text;
  v_pos integer;
  v_already boolean := false;
  v_referred boolean := false;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  raw bytea;
  i integer;
  attempt integer;
begin
  if v_email = ''
     or char_length(v_email) > 254
     or v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    return jsonb_build_object('error', 'email');
  end if;

  if exists (select 1 from public.waitlist where email = v_email) then
    v_already := true;
  else
    if v_ref ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$'
       and exists (select 1 from public.waitlist where referral_code = v_ref) then
      v_referred := true;
    else
      v_ref := null;
    end if;

    for attempt in 1..8 loop
      raw := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      v_code := '';
      for i in 0..7 loop
        v_code := v_code || substr(alphabet, 1 + (get_byte(raw, i) % char_length(alphabet)), 1);
      end loop;
      begin
        insert into public.waitlist (email, referral_code, referred_by)
        values (v_email, v_code, v_ref);
        exit;
      exception
        when unique_violation then
          if exists (select 1 from public.waitlist where email = v_email) then
            v_already := true;
            v_referred := false;
            exit;
          end if;
          v_code := null;
      end;
    end loop;

    if not v_already and v_code is null then
      return jsonb_build_object('error', 'retry');
    end if;
  end if;

  select w.referral_code into v_code
  from public.waitlist w
  where w.email = v_email;

  with counts as (
    select
      w.email,
      w.created_at,
      (select count(*) from public.waitlist r where r.referred_by = w.referral_code) as refs
    from public.waitlist w
  ),
  me as (
    select refs, created_at, email from counts where email = v_email
  )
  select (1 + count(*))::int into v_pos
  from counts c
  cross join me
  where c.email <> me.email
    and (
      c.refs > me.refs
      or (
        c.refs = me.refs
        and (
          c.created_at < me.created_at
          or (c.created_at = me.created_at and c.email < me.email)
        )
      )
    );

  return jsonb_build_object(
    'position', v_pos,
    'referral_code', v_code,
    'already', v_already,
    'referred', v_referred
  );
end;
$$;

revoke all on function public.join_waitlist(text, text) from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text) to anon, authenticated, service_role;

comment on table public.waitlist is
  'Bêta fermée. Fermée au public. Écriture uniquement via join_waitlist.';

comment on function public.join_waitlist(text, text) is
  'Inscription bêta. Retourne la place et le code de parrainage de cet e-mail, rien d’autre.';
