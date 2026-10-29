-- Bêta fermée : liste d’attente avec parrainage.
-- À coller à la main dans l’éditeur SQL Supabase. Rien ici n’est appliqué tout seul.
-- Si une version précédente de ce fichier a déjà été collée, le script ajoute
-- confirmed_at, remplace les fonctions et pose le déclencheur. Il ne réécrit pas les lignes.
--
-- La table est fermée. RLS est activé, sans politique.
-- anon et authenticated n’ont aucun droit sur la table.
-- Seul service_role peut la lire ou l’écrire directement.
-- Le site public n’appelle que join_waitlist (security definer), avec la clé anon.
-- La fonction ne reçoit que l’e-mail et un code facultatif. Elle ne prend aucun compteur :
-- la place est calculée ici. Le client ne peut ni fixer un nombre de filleuls, ni confirmer.
--
-- Un filleul ne compte que lorsque son e-mail est confirmé (confirmed_at),
-- via confirm_waitlist, réservée à service_role. Tant que ce n’est pas fait,
-- l’inscription existe mais ne fait pas monter le parrain.
-- Au plus 10 filleuls confirmés comptent. Au-delà, la place ne bouge plus.
-- Pas d’auto-parrainage : un code ne peut pas pointer vers lui-même, ni vers la même adresse.
-- L’e-mail est unique une fois normalisé (minuscules, espaces retirés).
--
-- Place : chaque filleul confirmé (dans la limite de 10) fait avancer le parrain.
-- À nombre de filleuls égal, l’inscription la plus ancienne passe devant.
-- Une inscription non confirmée peut encore changer de parrain. Une fois confirmée, le lien est figé.

create table if not exists public.waitlist (
  email text primary key,
  referral_code text not null,
  referred_by text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_normalized check (email = lower(btrim(email))),
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

alter table public.waitlist add column if not exists confirmed_at timestamptz;

create unique index if not exists waitlist_email_lower_uidx
  on public.waitlist (lower(email));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'waitlist_email_normalized'
      and conrelid = 'public.waitlist'::regclass
  ) then
    alter table public.waitlist
      add constraint waitlist_email_normalized check (email = lower(btrim(email)));
  end if;
end $$;

create index if not exists waitlist_referred_by_idx
  on public.waitlist (referred_by)
  where referred_by is not null;

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from public, anon, authenticated;
grant select, insert, update, delete on table public.waitlist to service_role;

-- Filet : normalise l’e-mail et retire un auto-parrainage, même hors de join_waitlist.
create or replace function public.waitlist_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
begin
  new.email := lower(btrim(coalesce(new.email, '')));
  if new.referred_by is not null then
    new.referred_by := lower(btrim(new.referred_by));
    if new.referred_by = '' then
      new.referred_by := null;
    end if;
  end if;
  if new.referred_by is not null and new.referred_by is not distinct from new.referral_code then
    new.referred_by := null;
  end if;
  if new.referred_by is not null then
    select w.email into v_owner
    from public.waitlist w
    where w.referral_code = new.referred_by;
    if v_owner is not null and v_owner = new.email then
      new.referred_by := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists waitlist_before_write on public.waitlist;
create trigger waitlist_before_write
  before insert or update on public.waitlist
  for each row execute function public.waitlist_before_write();

revoke all on function public.waitlist_before_write() from public, anon, authenticated;

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
  v_stored text;
  v_pos integer;
  v_already boolean := false;
  v_referred boolean := false;
  v_cap constant integer := 10;
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  raw bytea;
  i integer;
  attempt integer;
begin
  -- Aucun paramètre de compteur : la place est toujours recalculée ci-dessous.
  if v_email = ''
     or char_length(v_email) > 254
     or v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    return jsonb_build_object('error', 'email');
  end if;

  if v_ref = '' or v_ref !~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$' then
    v_ref := null;
  elsif not exists (select 1 from public.waitlist where referral_code = v_ref) then
    v_ref := null;
  elsif exists (
    select 1 from public.waitlist
    where referral_code = v_ref and email = v_email
  ) then
    -- Même adresse : ce n’est pas un filleul.
    v_ref := null;
  end if;

  select w.referral_code
    into v_code
  from public.waitlist w
  where w.email = v_email;

  if found then
    v_already := true;
  else
    for attempt in 1..8 loop
      raw := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      v_code := '';
      for i in 0..7 loop
        v_code := v_code || substr(alphabet, 1 + (get_byte(raw, i) % char_length(alphabet)), 1);
      end loop;
      if v_ref is not null and v_ref = v_code then
        v_code := null;
        continue;
      end if;
      begin
        insert into public.waitlist (email, referral_code, referred_by)
        values (v_email, v_code, v_ref);
        exit;
      exception
        when unique_violation then
          if exists (select 1 from public.waitlist where email = v_email) then
            v_already := true;
            exit;
          end if;
          v_code := null;
        when foreign_key_violation then
          v_ref := null;
          begin
            insert into public.waitlist (email, referral_code, referred_by)
            values (v_email, v_code, null);
            exit;
          exception
            when unique_violation then
              if exists (select 1 from public.waitlist where email = v_email) then
                v_already := true;
                exit;
              end if;
              v_code := null;
          end;
      end;
    end loop;

    if not v_already and v_code is null then
      return jsonb_build_object('error', 'retry');
    end if;
  end if;

  -- Confirmé : le parrain est figé. Non confirmé : la personne peut encore
  -- indiquer un code, y compris si une préinscription avait choisi le sien.
  if v_already and v_ref is not null then
    update public.waitlist
       set referred_by = v_ref
     where email = v_email
       and confirmed_at is null
       and referral_code is distinct from v_ref;
  end if;

  select w.referral_code, w.referred_by
    into v_code, v_stored
  from public.waitlist w
  where w.email = v_email;

  if v_code is null then
    return jsonb_build_object('error', 'retry');
  end if;

  -- Le code demandé n’est compté comme parrainage que s’il est vraiment enregistré,
  -- et jamais comme auto-parrainage. La confirmation reste un autre geste (service_role).
  v_referred := v_ref is not null and v_stored is not distinct from v_ref and v_stored is distinct from v_code;

  with counts as (
    select
      w.email,
      w.created_at,
      least((
        select count(*)::int
        from public.waitlist r
        where r.referred_by = w.referral_code
          and r.confirmed_at is not null
          and r.email <> w.email
      ), v_cap) as refs
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
    'position', coalesce(v_pos, 1),
    'referral_code', v_code,
    'already', v_already,
    'referred', v_referred
  );
end;
$$;

revoke all on function public.join_waitlist(text, text) from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text) to anon, authenticated, service_role;

-- Validation d’un e-mail. Seul service_role peut l’appeler : la clé anon ne confirme rien,
-- et ne peut donc pas gonfler le classement.
create or replace function public.confirm_waitlist(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_n integer;
begin
  if v_email = ''
     or char_length(v_email) > 254
     or v_email !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    return jsonb_build_object('error', 'email');
  end if;

  update public.waitlist
     set confirmed_at = now()
   where email = v_email
     and confirmed_at is null;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    return jsonb_build_object('ok', true, 'already', false);
  end if;
  if exists (select 1 from public.waitlist where email = v_email and confirmed_at is not null) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  return jsonb_build_object('error', 'email');
end;
$$;

revoke all on function public.confirm_waitlist(text) from public, anon, authenticated;
grant execute on function public.confirm_waitlist(text) to service_role;

comment on table public.waitlist is
  'Bêta fermée. Fermée au public. Écriture anon uniquement via join_waitlist. Confirmation via confirm_waitlist (service_role).';

comment on column public.waitlist.confirmed_at is
  'Renseigné seulement par confirm_waitlist (service_role). Tant qu’il est vide, cette ligne ne compte pas comme filleul.';

comment on function public.join_waitlist(text, text) is
  'Inscription bêta. Place calculée côté serveur : au plus 10 filleuls dont l’e-mail est confirmé. Pas d’auto-parrainage, e-mail unique normalisé. Ne renvoie que la place et le code de cet e-mail.';

comment on function public.confirm_waitlist(text) is
  'Confirme un e-mail de la bêta. Réservé à service_role. C’est à partir de là que le parrainage compte.';
