-- =============================================================================
-- Stay Informed News — Opinions database (Supabase / Postgres)
--
-- How to use: Supabase dashboard -> SQL Editor -> New query -> paste this whole
-- file -> Run. It is safe to run again later (it updates things in place).
--
-- Security model (the browser only holds the public "anon" key, so these rules,
-- not the web pages, are what actually protect the data)
--   * Row Level Security (RLS) is ON for every table.
--   * Anyone, even signed out, can READ posts, comments and profiles. Nothing else.
--   * To write anything (post, comment, like, report) a person must be signed in,
--     have a CONFIRMED email address, and not be suspended. This is checked in the
--     database by is_active_user(), against Supabase's own record of the email
--     confirmation (auth.users.email_confirmed_at), which users cannot edit.
--   * People can only create/edit/delete rows that belong to them (author_id must
--     equal their own auth.uid()). Nobody can change anyone else's rows.
--   * Column privileges + triggers mean nobody can set roles, bans, counts,
--     dates or author ids on themselves. Moderator/admin roles live in a separate
--     table (user_roles) that the API cannot read or write at all.
--   * Length limits are CHECK constraints; rate limits are enforced by triggers
--     that write to a private log (so deleting a post does not reset the limit).
--   * A profile (unique username AND unique display name) is created automatically
--     from every new sign-up. Roles are never taken from sign-up data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio          text not null default '' check (char_length(bio) <= 500),
  is_banned    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Roles live here, NOT on profiles. No API role has any privilege on this table.
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'moderator')),
  granted_at timestamptz not null default now()
);

-- Private log used for rate limits. No API role has any privilege on this table.
create table if not exists public.rate_log (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  kind    text not null,
  at      timestamptz not null default now()
);

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 150),
  subtitle      text not null default '' check (char_length(subtitle) <= 250),
  body          text not null check (char_length(body) between 1 and 50000),
  tags          text[] not null default '{}' check (coalesce(array_length(tags, 1), 0) <= 5),
  published_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  like_count    integer not null default 0,
  comment_count integer not null default 0
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  parent_id  uuid references public.comments (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 1 and 1000),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

-- Upgrade path from the first version of this file, which stored is_admin on
-- profiles: carry existing admins over to user_roles, then remove the column
-- (further down, once the functions that used it have been replaced).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin') then
    execute 'insert into public.user_roles (user_id, role) select id, ''admin'' from public.profiles where is_admin on conflict do nothing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_display_name_key on public.profiles (lower(display_name));
create index if not exists posts_published_idx      on public.posts (published_at desc);
create index if not exists posts_author_idx         on public.posts (author_id, published_at desc);
create index if not exists posts_top_idx            on public.posts (like_count desc, published_at desc);
create index if not exists posts_tags_idx           on public.posts using gin (tags);
create index if not exists comments_post_idx        on public.comments (post_id, created_at);
create index if not exists comments_author_idx      on public.comments (author_id, created_at desc);
create index if not exists comments_parent_idx      on public.comments (parent_id);
create index if not exists likes_user_idx           on public.likes (user_id);
create index if not exists reports_status_idx       on public.reports (status, created_at desc);
create index if not exists reports_target_idx       on public.reports (target_type, target_id);
create index if not exists reports_reporter_idx     on public.reports (reporter_id, created_at desc);
create index if not exists rate_log_user_idx        on public.rate_log (user_id, kind, at desc);
create index if not exists rate_log_at_idx          on public.rate_log (at);

-- ---------------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER so they can read private tables without
--    tripping over RLS; search_path pinned for safety)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select r.role from public.user_roles r where r.user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin');
$$;

-- admins and moderators
create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid());
$$;

-- is this user a moderator/admin? (public information: it drives the "Moderator" badge)
create or replace function public.is_staff(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r where r.user_id = uid);
$$;

-- The one gate for every write: signed in + email CONFIRMED + not suspended.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = auth.uid()
       and not p.is_banned
       and u.email_confirmed_at is not null
  );
$$;

-- Per-user rate limit. Counts rows in the private log, so deleting content does not
-- reset the limit. Raises an error (and the whole write is refused) when exceeded.
create or replace function public.rate_check(uid uuid, k text, max_n integer, win interval, msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is null then
    raise exception 'Please sign in first.';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || ':' || k));
  delete from public.rate_log where at < now() - interval '2 days' and kind = k and user_id = uid;
  if (select count(*) from public.rate_log
       where user_id = uid and kind = k and at > now() - win) >= max_n then
    raise exception '%', msg;
  end if;
  insert into public.rate_log (user_id, kind) values (uid, k);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Create a profile automatically when someone signs up.
--    Username and display name come from the sign-up form (user metadata), or from
--    the Google profile name. Display names are unique (case-insensitive): a clash
--    gets a number added. Roles and bans are NEVER taken from metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  dname text;
  base  text;
  tries integer := 0;
begin
  if uname !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where username = uname) then
    uname := 'user_' || left(replace(new.id::text, '-', ''), 10);
  end if;
  dname := btrim(regexp_replace(regexp_replace(
             coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name',
                      new.raw_user_meta_data ->> 'name', ''),
             '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'));
  if dname = '' then dname := uname; end if;
  dname := left(dname, 60);
  base  := left(dname, 50);
  while exists (select 1 from public.profiles where lower(display_name) = lower(dname)) loop
    tries := tries + 1;
    dname := base || ' ' || (1000 + floor(random() * 9000))::integer;
    if tries > 20 then dname := uname || '_' || left(replace(new.id::text, '-', ''), 6); exit; end if;
  end loop;
  insert into public.profiles (id, username, display_name) values (new.id, uname, dname);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Guards, validation, counts and rate limits
-- ---------------------------------------------------------------------------

-- Belt and braces: even if column privileges were changed by mistake, a normal
-- signed-in user can never change anything on their profile except display name and bio.
-- (Not security definer, so current_user is the API caller's role; admin_set_ban
-- below runs as the owner and is therefore allowed to change is_banned.)
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.is_banned  is distinct from old.is_banned or
       new.username   is distinct from old.username or
       new.created_at is distinct from old.created_at or
       new.id         is distinct from old.id) then
    raise exception 'You cannot change that field.';
  end if;
  new.display_name := btrim(regexp_replace(new.display_name, '[[:cntrl:]]', '', 'g'));
  if new.display_name = '' then raise exception 'Please enter a display name.'; end if;
  return new;
end $$;
drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- The first version stored admin flags on profiles. Now that nothing uses that
-- column any more, drop it. (No-op on a fresh project.)
alter table public.profiles drop column if exists is_admin;

-- Posts: content checks on insert and update, and author/dates/counts fixed on update.
-- Deliberately NOT security definer: current_user must be the caller's role here, so
-- the count triggers below (which run as the owner) can still update the counts.
create or replace function public.posts_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if btrim(new.title) = '' then raise exception 'Please add a title.'; end if;
  if btrim(new.body) = ''  then raise exception 'Your piece needs some text.'; end if;
  if exists (select 1 from unnest(new.tags) t where char_length(t) > 30 or t !~ '^[a-z0-9][a-z0-9 -]*$') then
    raise exception 'Tags may only use lowercase letters, numbers, spaces and hyphens (30 characters each).';
  end if;
  if tg_op = 'INSERT' then
    new.published_at  := now();
    new.updated_at    := now();
    new.like_count    := 0;
    new.comment_count := 0;
  else
    new.updated_at := now();
    if current_user in ('anon', 'authenticated') then
      new.author_id     := old.author_id;
      new.published_at  := old.published_at;
      new.like_count    := old.like_count;
      new.comment_count := old.comment_count;
    end if;
  end if;
  return new;
end $$;
-- Posts rate limits (5 per hour, 20 per day). Separate trigger because this one must be
-- SECURITY DEFINER (it writes to the private rate log) while the one above must not be.
create or replace function public.posts_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_check(new.author_id, 'post_hour', 5,  interval '1 hour', 'Rate limit: you can publish up to 5 pieces per hour. Please try again later.');
  perform public.rate_check(new.author_id, 'post_day',  20, interval '1 day',  'Rate limit: you can publish up to 20 pieces per day. Please try again tomorrow.');
  return new;
end $$;
drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit before insert on public.posts
  for each row execute function public.posts_rate_limit();

drop trigger if exists posts_before_write on public.posts;
create trigger posts_before_write before insert or update on public.posts
  for each row execute function public.posts_before_write();

-- Comments: rate limit (5 per minute, 60 per hour); replies are one level deep.
create or replace function public.comments_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare par record;
begin
  if btrim(new.body) = '' then raise exception 'Write something first.'; end if;
  perform public.rate_check(new.author_id, 'comment_min',  5, interval '1 minute', 'Rate limit: please wait a minute before commenting again.');
  perform public.rate_check(new.author_id, 'comment_hour', 60, interval '1 hour',  'Rate limit: you have reached 60 comments this hour.');
  if new.parent_id is not null then
    select id, post_id, parent_id into par from public.comments where id = new.parent_id;
    if not found or par.post_id <> new.post_id then
      raise exception 'The comment you are replying to was not found on this piece.';
    end if;
    if par.parent_id is not null then
      new.parent_id := par.parent_id;   -- reply to a reply -> attach to the top-level comment
    end if;
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists comments_before_insert on public.comments;
create trigger comments_before_insert before insert on public.comments
  for each row execute function public.comments_before_insert();

-- Likes: rate limit (120 per hour) so likes cannot be machine-gunned.
create or replace function public.likes_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_check(new.user_id, 'like_hour', 120, interval '1 hour', 'Rate limit: too many likes this hour.');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists likes_before_insert on public.likes;
create trigger likes_before_insert before insert on public.likes
  for each row execute function public.likes_before_insert();

-- Reports: rate limit (20 per hour); the thing reported must exist; moderation fields are server-set.
create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rate_check(new.reporter_id, 'report_hour', 20, interval '1 hour', 'Rate limit: too many reports this hour.');
  if (new.target_type = 'post'    and not exists (select 1 from public.posts    where id = new.target_id))
  or (new.target_type = 'comment' and not exists (select 1 from public.comments where id = new.target_id)) then
    raise exception 'That item no longer exists.';
  end if;
  new.status := 'open';
  new.created_at := now();
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end $$;
drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

-- Only status/resolved_* may change on a report, and only by staff; stamp who resolved it.
create or replace function public.reports_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.reporter_id := old.reporter_id;
  new.target_type := old.target_type;
  new.target_id   := old.target_id;
  new.reason      := old.reason;
  new.created_at  := old.created_at;
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
    new.resolved_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists reports_before_update on public.reports;
create trigger reports_before_update before update on public.reports
  for each row execute function public.reports_before_update();

-- Comment and like counts stored on posts (fast "Top" sorting).
create or replace function public.bump_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_comment_count();

create or replace function public.bump_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes
  for each row execute function public.bump_like_count();

-- Moderator action: suspend or restore a user. Moderators cannot touch other staff;
-- only an admin can suspend a moderator. Nobody can suspend themselves.
create or replace function public.admin_set_ban(target uuid, banned boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can do that.';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot suspend yourself.';
  end if;
  if public.is_staff(target) and not public.is_admin() then
    raise exception 'Only an admin can suspend a moderator.';
  end if;
  update public.profiles set is_banned = banned where id = target;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Privileges: what each role may touch (RLS then decides which rows)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.posts, public.comments, public.likes, public.reports,
              public.user_roles, public.rate_log from anon, authenticated;

grant select on public.profiles, public.posts, public.comments to anon, authenticated;
grant select on public.likes, public.reports to authenticated;

grant update (display_name, bio)                    on public.profiles to authenticated;
grant insert (title, subtitle, body, tags)          on public.posts    to authenticated;
grant update (title, subtitle, body, tags)          on public.posts    to authenticated;
grant delete                                        on public.posts    to authenticated;
grant insert (post_id, parent_id, body)             on public.comments to authenticated;
grant delete                                        on public.comments to authenticated;
grant insert (post_id)                              on public.likes    to authenticated;
grant delete                                        on public.likes    to authenticated;
grant insert (target_type, target_id, reason)       on public.reports  to authenticated;
grant update (status)                               on public.reports  to authenticated;

revoke execute on function public.admin_set_ban(uuid, boolean)                   from public, anon;
grant  execute on function public.admin_set_ban(uuid, boolean)                   to authenticated;
grant  execute on function public.my_role(), public.is_admin(), public.is_moderator(),
                           public.is_staff(uuid), public.is_active_user()        to anon, authenticated;
revoke execute on function public.rate_check(uuid, text, integer, interval, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user()                              from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security policies
-- ---------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.posts      enable row level security;
alter table public.comments   enable row level security;
alter table public.likes      enable row level security;
alter table public.reports    enable row level security;
alter table public.user_roles enable row level security;   -- no policies = nobody but the owner can touch it
alter table public.rate_log   enable row level security;   -- no policies = nobody but the owner can touch it

-- profiles: everyone can read; you can edit only your own display name and bio
-- (column privileges + trigger above); nobody can insert or delete through the API.
drop policy if exists "profiles: anyone can read"      on public.profiles;
drop policy if exists "profiles: owner can update"     on public.profiles;
create policy "profiles: anyone can read"  on public.profiles for select using (true);
create policy "profiles: owner can update" on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_active_user()) with check (id = auth.uid());

-- posts: every post is public the moment it is published (drafts stay in the
-- writer's browser). Writing needs a confirmed, non-suspended account and ownership.
drop policy if exists "posts: anyone can read"              on public.posts;
drop policy if exists "posts: active users create own"      on public.posts;
drop policy if exists "posts: authors update own"           on public.posts;
drop policy if exists "posts: authors or admins delete"     on public.posts;
create policy "posts: anyone can read" on public.posts for select using (true);
create policy "posts: active users create own" on public.posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_user());
create policy "posts: authors update own" on public.posts for update to authenticated
  using (author_id = auth.uid() and public.is_active_user())
  with check (author_id = auth.uid() and public.is_active_user());
create policy "posts: authors or admins delete" on public.posts for delete to authenticated
  using ((author_id = auth.uid() and public.is_active_user()) or public.is_moderator());

-- comments
drop policy if exists "comments: anyone can read"           on public.comments;
drop policy if exists "comments: active users create own"   on public.comments;
drop policy if exists "comments: authors or admins delete"  on public.comments;
create policy "comments: anyone can read" on public.comments for select using (true);
create policy "comments: active users create own" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_user());
create policy "comments: authors or admins delete" on public.comments for delete to authenticated
  using ((author_id = auth.uid() and public.is_active_user()) or public.is_moderator());

-- likes (each user sees only their own likes; totals are on posts.like_count)
drop policy if exists "likes: read own"                     on public.likes;
drop policy if exists "likes: active users like"            on public.likes;
drop policy if exists "likes: remove own"                   on public.likes;
create policy "likes: read own" on public.likes for select to authenticated
  using (user_id = auth.uid());
create policy "likes: active users like" on public.likes for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy "likes: remove own" on public.likes for delete to authenticated
  using (user_id = auth.uid());

-- reports (any active user can file one; only staff can see and handle them)
drop policy if exists "reports: active users file"          on public.reports;
drop policy if exists "reports: admins read"                on public.reports;
drop policy if exists "reports: admins update"              on public.reports;
drop policy if exists "reports: admins delete"              on public.reports;
drop policy if exists "reports: staff read"                 on public.reports;
drop policy if exists "reports: staff update"               on public.reports;
create policy "reports: active users file" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.is_active_user());
create policy "reports: staff read" on public.reports for select to authenticated
  using (public.is_moderator());
create policy "reports: staff update" on public.reports for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- 8. Make yourself an admin. Sign up on the website and CONFIRM your email first,
--    then replace your_username below with the username you chose and run just
--    this statement (remove the two dashes at the start of each line first).
--    Use 'moderator' instead of 'admin' for helpers who should not be able to
--    suspend other moderators.
-- ---------------------------------------------------------------------------
-- insert into public.user_roles (user_id, role)
--   select id, 'admin' from public.profiles where username = 'your_username'
--   on conflict (user_id) do update set role = excluded.role;
