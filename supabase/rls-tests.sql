-- =============================================================================
-- Stay Informed News — security self-test for the Opinions database
--
-- WHAT THIS IS
--   A script that tries to break the rules in schema.sql the way a hacker or a
--   careless visitor would (post while signed out, post with an unconfirmed email,
--   edit someone else's piece, make yourself an admin, post too fast, and so on)
--   and checks that the database says NO every time, and YES to the things that
--   should be allowed.
--
-- HOW TO RUN IT (after running schema.sql)
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   The result table at the bottom should start with "ALL ... TESTS PASSED" and
--   every row should say PASS. If any row says FAIL, send the table to your
--   developer: it names the exact rule that is broken.
--
-- IS IT SAFE?
--   It creates a handful of fake test accounts (@rls-test.invalid addresses), does
--   its testing, then deletes them and everything they created. It does not touch
--   your real data. You may run it as often as you like. It leaves one small
--   table behind (public._rls_test_results); the last lines show how to delete it.
-- =============================================================================

drop table if exists public._rls_test_results;
create table public._rls_test_results (
  n      serial primary key,
  label  text not null,
  pass   boolean not null,
  detail text
);
revoke all on public._rls_test_results from anon, authenticated;

-- Runs one statement while pretending to be a given kind of visitor.
--   as_role : 'anon' (not signed in), 'authenticated' (signed in) or 'postgres' (the owner, for set-up)
--   as_user : which account is signed in (ignored for anon/postgres)
--   expect  : 'ok' (must succeed), 'fail' (must be refused), or 'rows:N' (must succeed and affect/return N rows)
create or replace function public._rls_t(label text, as_role text, as_user uuid, stmt text, expect text)
returns void language plpgsql as $$
declare
  worked boolean; err text := ''; nrows bigint := 0; good boolean;
begin
  if as_role <> 'postgres' then
    perform set_config('request.jwt.claims',
      case when as_role = 'anon' then '{"role":"anon"}'
           else json_build_object('sub', as_user, 'role', 'authenticated')::text end, true);
    execute 'set local role ' || quote_ident(as_role);
  end if;
  begin
    execute stmt;
    get diagnostics nrows = row_count;
    worked := true;
  exception when others then
    worked := false; err := sqlerrm;
  end;
  execute 'reset role';
  good := case
    when expect = 'ok'   then worked
    when expect = 'fail' then not worked
    when expect like 'rows:%' then worked and nrows = substr(expect, 6)::bigint
    else false end;
  insert into public._rls_test_results (label, pass, detail)
  values (label, good,
    case when good then null
         else 'expected ' || expect || '; ' || case when worked then 'it worked (rows=' || nrows || ')' else 'it failed with: ' || err end end);
end $$;

-- Test accounts: A and B are normal confirmed users, C never confirmed their email,
-- D is suspended, M is a moderator, X is an admin.
do $$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; b uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  c uuid := 'aaaaaaaa-0000-4000-8000-000000000003'; d uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  m uuid := 'aaaaaaaa-0000-4000-8000-000000000005'; x uuid := 'aaaaaaaa-0000-4000-8000-000000000006';
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (a, 'a@rls-test.invalid', now(), '{"username":"rls_a","display_name":"RLS Alice"}'),
    (b, 'b@rls-test.invalid', now(), '{"username":"rls_b","display_name":"RLS Bob"}'),
    (c, 'c@rls-test.invalid', null,  '{"username":"rls_c","display_name":"RLS Carol"}'),
    (d, 'd@rls-test.invalid', now(), '{"username":"rls_d","display_name":"RLS Dave"}'),
    (m, 'm@rls-test.invalid', now(), '{"username":"rls_m","display_name":"RLS Mod"}'),
    (x, 'x@rls-test.invalid', now(), '{"username":"rls_x","display_name":"RLS Admin"}');
  update public.profiles set is_banned = true where id = d;
  insert into public.user_roles (user_id, role) values (m, 'moderator'), (x, 'admin');
end $$;

do $$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001'; b uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  c uuid := 'aaaaaaaa-0000-4000-8000-000000000003'; d uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  m uuid := 'aaaaaaaa-0000-4000-8000-000000000005'; x uuid := 'aaaaaaaa-0000-4000-8000-000000000006';
  pa uuid := 'bbbbbbbb-0000-4000-8000-000000000001';   -- a post written by A
  pb uuid := 'bbbbbbbb-0000-4000-8000-000000000002';   -- a post written by B (used for moderator delete)
  ca uuid := 'cccccccc-0000-4000-8000-000000000001';   -- a comment written by B on A's post
  i int;
begin
  -- set-up rows created directly by the owner
  perform public._rls_t('setup: post by A', 'postgres', null, format('insert into public.posts (id, author_id, title, body) values (%L, %L, ''Setup post'', ''Hello'')', pa, a), 'ok');
  perform public._rls_t('setup: post by B', 'postgres', null, format('insert into public.posts (id, author_id, title, body) values (%L, %L, ''Setup post B'', ''Hello'')', pb, b), 'ok');
  perform public._rls_t('setup: comment by B', 'postgres', null, format('insert into public.comments (id, post_id, author_id, body) values (%L, %L, %L, ''Setup comment'')', ca, pa, b), 'ok');
  delete from public.rate_log;   -- set-up inserts do not count toward limits

  -- profiles and roles
  perform public._rls_t('sign-up metadata claiming admin does NOT create a role', 'postgres', null,
    $q$ with u as (insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('aaaaaaaa-0000-4000-8000-0000000000ff', 'evil@rls-test.invalid', now(), '{"username":"rls_evil","display_name":"rls alice","role":"admin","is_admin":true}') returning id)
        select 1 from u $q$, 'ok');
  perform public._rls_t('...and no role row exists for that user', 'postgres', null,
    $q$ select 1 from public.user_roles where user_id = 'aaaaaaaa-0000-4000-8000-0000000000ff' $q$, 'rows:0');
  perform public._rls_t('...and a clashing display name was made unique automatically', 'postgres', null,
    $q$ select 1 from public.profiles where lower(display_name) = 'rls alice' $q$, 'rows:1');
  perform public._rls_t('two profiles cannot share a display name (insert directly)', 'postgres', null,
    $q$ update public.profiles set display_name = 'RLS BOB' where username = 'rls_a' $q$, 'fail');

  -- reading
  perform public._rls_t('anyone (signed out) can read posts', 'anon', null, 'select 1 from public.posts', 'rows:2');
  perform public._rls_t('anyone (signed out) can read profiles', 'anon', null, 'select 1 from public.profiles', 'ok');
  perform public._rls_t('signed-out visitor cannot read user_roles', 'anon', null, 'select * from public.user_roles', 'fail');
  perform public._rls_t('signed-in user cannot read user_roles', 'authenticated', a, 'select * from public.user_roles', 'fail');
  perform public._rls_t('signed-in user cannot read the rate log', 'authenticated', a, 'select * from public.rate_log', 'fail');
  perform public._rls_t('signed-out visitor cannot read reports', 'anon', null, 'select * from public.reports', 'fail');

  -- the gate: who may write
  perform public._rls_t('signed-out visitor CANNOT publish', 'anon', null, $q$ insert into public.posts (title, body) values ('x', 'y') $q$, 'fail');
  perform public._rls_t('signed-in but UNCONFIRMED email CANNOT publish', 'authenticated', c, $q$ insert into public.posts (title, body) values ('x', 'y') $q$, 'fail');
  perform public._rls_t('suspended user CANNOT publish', 'authenticated', d, $q$ insert into public.posts (title, body) values ('x', 'y') $q$, 'fail');
  perform public._rls_t('confirmed user CAN publish', 'authenticated', a, $q$ insert into public.posts (title, body, tags) values ('My piece', 'Body text', array['housing','local news']) $q$, 'ok');
  perform public._rls_t('cannot publish in someone else''s name (author_id)', 'authenticated', a, format('insert into public.posts (author_id, title, body) values (%L, ''x'', ''y'')', b), 'fail');
  perform public._rls_t('cannot set like_count on a new post', 'authenticated', a, $q$ insert into public.posts (title, body, like_count) values ('x', 'y', 999) $q$, 'fail');
  perform public._rls_t('cannot set published_at on a new post', 'authenticated', a, $q$ insert into public.posts (title, body, published_at) values ('x', 'y', '2001-01-01') $q$, 'fail');

  -- editing and deleting
  perform public._rls_t('author CAN edit own post', 'authenticated', a, format('update public.posts set title = ''Edited'' where id = %L', pa), 'rows:1');
  perform public._rls_t('another user CANNOT edit it (0 rows)', 'authenticated', b, format('update public.posts set title = ''Hacked'' where id = %L', pa), 'rows:0');
  perform public._rls_t('another user CANNOT delete it (0 rows)', 'authenticated', b, format('delete from public.posts where id = %L', pa), 'rows:0');
  perform public._rls_t('signed-out visitor CANNOT edit', 'anon', null, format('update public.posts set title = ''Hacked'' where id = %L', pa), 'fail');
  perform public._rls_t('signed-out visitor CANNOT delete', 'anon', null, format('delete from public.posts where id = %L', pa), 'fail');
  perform public._rls_t('author cannot hand the post to someone else', 'authenticated', a, format('update public.posts set author_id = %L where id = %L', b, pa), 'fail');
  perform public._rls_t('author cannot fake the like count', 'authenticated', a, format('update public.posts set like_count = 500 where id = %L', pa), 'fail');
  perform public._rls_t('author cannot change the publish date', 'authenticated', a, format('update public.posts set published_at = now() - interval ''5 years'' where id = %L', pa), 'fail');

  -- length limits and content checks
  perform public._rls_t('title over 150 characters is refused', 'authenticated', b, format('insert into public.posts (title, body) values (%L, ''y'')', repeat('t', 151)), 'fail');
  perform public._rls_t('body over 50,000 characters is refused', 'authenticated', b, format('insert into public.posts (title, body) values (''x'', %L)', repeat('b', 50001)), 'fail');
  perform public._rls_t('empty (spaces only) title is refused', 'authenticated', b, $q$ insert into public.posts (title, body) values ('   ', 'y') $q$, 'fail');
  perform public._rls_t('empty (spaces only) body is refused', 'authenticated', b, $q$ insert into public.posts (title, body) values ('x', '   ') $q$, 'fail');
  perform public._rls_t('more than 5 tags is refused', 'authenticated', b, $q$ insert into public.posts (title, body, tags) values ('x', 'y', array['a','b','c','d','e','f']) $q$, 'fail');
  perform public._rls_t('tags with odd characters are refused', 'authenticated', b, $q$ insert into public.posts (title, body, tags) values ('x', 'y', array['<script>']) $q$, 'fail');
  perform public._rls_t('subtitle over 250 characters is refused', 'authenticated', b, format('insert into public.posts (title, body, subtitle) values (''x'', ''y'', %L)', repeat('s', 251)), 'fail');

  -- rate limit on posts (A has already published once above; the limit is 5 per hour)
  for i in 1..4 loop
    perform public._rls_t('rate limit: post #' || (i + 1) || ' of 5 allowed', 'authenticated', a, $q$ insert into public.posts (title, body) values ('Rate test', 'y') $q$, 'ok');
  end loop;
  perform public._rls_t('rate limit: 6th post within the hour is refused', 'authenticated', a, $q$ insert into public.posts (title, body) values ('Rate test', 'y') $q$, 'fail');
  perform public._rls_t('rate limit cannot be dodged by deleting posts first', 'authenticated', a, $q$ delete from public.posts where title = 'Rate test' $q$, 'ok');
  perform public._rls_t('...still refused after deleting', 'authenticated', a, $q$ insert into public.posts (title, body) values ('Rate test', 'y') $q$, 'fail');

  -- profiles
  perform public._rls_t('user CAN change own display name and bio', 'authenticated', b, format('update public.profiles set display_name = ''Bobby'', bio = ''hi'' where id = %L', b), 'rows:1');
  perform public._rls_t('user CANNOT take someone else''s display name', 'authenticated', b, format('update public.profiles set display_name = ''rls alice'' where id = %L', b), 'fail');
  perform public._rls_t('user CANNOT edit another profile (0 rows)', 'authenticated', b, format('update public.profiles set bio = ''hacked'' where id = %L', a), 'rows:0');
  perform public._rls_t('suspended user CANNOT lift own suspension', 'authenticated', d, format('update public.profiles set is_banned = false where id = %L', d), 'fail');
  perform public._rls_t('user CANNOT un-suspend by touching the column', 'authenticated', b, format('update public.profiles set is_banned = false where id = %L', b), 'fail');
  perform public._rls_t('user CANNOT change username', 'authenticated', b, format('update public.profiles set username = ''newname'' where id = %L', b), 'fail');
  perform public._rls_t('user CANNOT make themselves admin (user_roles insert)', 'authenticated', b, format('insert into public.user_roles (user_id, role) values (%L, ''admin'')', b), 'fail');
  perform public._rls_t('user CANNOT add an is_admin flag to their profile', 'authenticated', b, format('update public.profiles set is_admin = true where id = %L', b), 'fail');
  perform public._rls_t('user CANNOT create a profile row directly', 'authenticated', b, $q$ insert into public.profiles (id, username, display_name) values (gen_random_uuid(), 'fake_user', 'Fake') $q$, 'fail');

  -- comments
  perform public._rls_t('signed-out visitor CANNOT comment', 'anon', null, format('insert into public.comments (post_id, body) values (%L, ''hi'')', pa), 'fail');
  perform public._rls_t('unconfirmed email CANNOT comment', 'authenticated', c, format('insert into public.comments (post_id, body) values (%L, ''hi'')', pa), 'fail');
  perform public._rls_t('confirmed user CAN comment', 'authenticated', b, format('insert into public.comments (post_id, body) values (%L, ''Nice piece'')', pa), 'ok');
  perform public._rls_t('cannot comment in someone else''s name', 'authenticated', b, format('insert into public.comments (post_id, body, author_id) values (%L, ''hi'', %L)', pa, a), 'fail');
  perform public._rls_t('comment over 5,000 characters is refused', 'authenticated', b, format('insert into public.comments (post_id, body) values (%L, %L)', pa, repeat('c', 5001)), 'fail');
  perform public._rls_t('post author CANNOT delete someone else''s comment (0 rows)', 'authenticated', a, format('delete from public.comments where id = %L', ca), 'rows:0');
  perform public._rls_t('comment counter went up by itself', 'postgres', null, format('select 1 from public.posts where id = %L and comment_count = 2', pa), 'rows:1');

  -- likes
  perform public._rls_t('confirmed user CAN like', 'authenticated', b, format('insert into public.likes (post_id) values (%L)', pa), 'ok');
  perform public._rls_t('cannot like twice', 'authenticated', b, format('insert into public.likes (post_id) values (%L)', pa), 'fail');
  perform public._rls_t('cannot like as someone else', 'authenticated', b, format('insert into public.likes (post_id, user_id) values (%L, %L)', pb, a), 'fail');
  perform public._rls_t('unconfirmed email CANNOT like', 'authenticated', c, format('insert into public.likes (post_id) values (%L)', pa), 'fail');
  perform public._rls_t('signed-out visitor CANNOT like', 'anon', null, format('insert into public.likes (post_id) values (%L)', pa), 'fail');
  perform public._rls_t('users only see their own likes', 'authenticated', a, 'select 1 from public.likes', 'rows:0');

  -- reports and moderation
  perform public._rls_t('confirmed user CAN report', 'authenticated', b, format('insert into public.reports (target_type, target_id, reason) values (''post'', %L, ''spam'')', pa), 'ok');
  perform public._rls_t('reporting something that does not exist is refused', 'authenticated', b, $q$ insert into public.reports (target_type, target_id, reason) values ('post', gen_random_uuid(), 'spam') $q$, 'fail');
  perform public._rls_t('cannot report as resolved', 'authenticated', b, format('insert into public.reports (target_type, target_id, reason, status) values (''post'', %L, ''spam'', ''resolved'')', pa), 'fail');
  perform public._rls_t('normal user CANNOT read reports (0 rows)', 'authenticated', b, 'select 1 from public.reports', 'rows:0');
  perform public._rls_t('normal user CANNOT resolve reports (0 rows)', 'authenticated', b, 'update public.reports set status = ''resolved''', 'rows:0');
  perform public._rls_t('moderator CAN read reports', 'authenticated', m, 'select 1 from public.reports', 'rows:1');
  perform public._rls_t('moderator CAN resolve reports', 'authenticated', m, 'update public.reports set status = ''resolved''', 'rows:1');
  perform public._rls_t('moderator CANNOT rewrite the reason of a report', 'authenticated', m, 'update public.reports set reason = ''x''', 'fail');
  perform public._rls_t('normal user CANNOT suspend anyone', 'authenticated', b, format('select public.admin_set_ban(%L, true)', a), 'fail');
  perform public._rls_t('moderator CAN suspend a normal user', 'authenticated', m, format('select public.admin_set_ban(%L, true)', a), 'ok');
  perform public._rls_t('...and a suspended user CANNOT publish', 'authenticated', a, $q$ insert into public.posts (title, body) values ('x', 'y') $q$, 'fail');
  perform public._rls_t('moderator CAN lift a suspension', 'authenticated', m, format('select public.admin_set_ban(%L, false)', a), 'ok');
  perform public._rls_t('moderator CANNOT suspend an admin', 'authenticated', m, format('select public.admin_set_ban(%L, true)', x), 'fail');
  perform public._rls_t('admin CAN suspend a moderator', 'authenticated', x, format('select public.admin_set_ban(%L, true)', m), 'ok');
  perform public._rls_t('...and lift it again', 'authenticated', x, format('select public.admin_set_ban(%L, false)', m), 'ok');
  perform public._rls_t('nobody can suspend themselves', 'authenticated', x, format('select public.admin_set_ban(%L, true)', x), 'fail');
  perform public._rls_t('moderator CAN delete someone else''s comment', 'authenticated', m, format('delete from public.comments where id = %L', ca), 'rows:1');
  perform public._rls_t('moderator CAN delete someone else''s post', 'authenticated', m, format('delete from public.posts where id = %L', pb), 'rows:1');
  perform public._rls_t('anyone can ask what their own role is', 'authenticated', m, 'select public.my_role()', 'ok');
  perform public._rls_t('signed-out visitor cannot call the internal rate limiter', 'anon', null, $q$ select public.rate_check(gen_random_uuid(), 'x', 1, interval '1 hour', 'no') $q$, 'fail');
  perform public._rls_t('signed-in user cannot call the internal rate limiter', 'authenticated', a, $q$ select public.rate_check(gen_random_uuid(), 'x', 1, interval '1 hour', 'no') $q$, 'fail');
end $$;

-- Clean up every fake account and everything it created.
delete from public.rate_log where user_id::text like 'aaaaaaaa-0000-4000-8000-0000000000%';
delete from auth.users where id::text like 'aaaaaaaa-0000-4000-8000-0000000000%';
drop function public._rls_t(text, text, uuid, text, text);

-- THE RESULT (look at this table; the first row is the summary)
select 0 as n,
       case when count(*) filter (where not pass) = 0 then 'ALL ' || count(*) || ' TESTS PASSED'
            else count(*) filter (where not pass) || ' TEST(S) FAILED - see rows below' end as result,
       '' as detail
  from public._rls_test_results
union all
select n, case when pass then 'PASS - ' else 'FAIL - ' end || label, coalesce(detail, '')
  from public._rls_test_results
order by n;

-- Optional tidy-up afterwards (select this one line and run it):
-- drop table public._rls_test_results;
