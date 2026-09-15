-- ============================================================================
-- chatfuel-apps · Inbox Analytics · migration 0030
--
-- The message history this deployment keeps for itself, because the Chatfuel
-- API has no export and no message analytics: a conversation can only be read
-- page by page, newest first, one contact at a time. So the app crawls the
-- inbox into these tables and every chart, every figure and every export is
-- a query over rows that live here — never a live question to Chatfuel.
--
--   cf_ia_messages       one row per message the crawler has seen
--   cf_ia_conversations  one row per contact, with where its scan got to
--   cf_ia_sync           one row per bot: the crawl's phase, cursor, counters
--   cf_ia_migrations     bookkeeping
--
-- Everything is prefixed cf_ia_ because this project also carries the auth
-- module's cf_ tables and possibly the deployer's own.
--
-- Contract (the same one every module's migration keeps):
--   * Idempotent — safe to re-run on the same project (create … if not exists,
--     create or replace).
--   * Tables are RPC-ONLY: RLS is on with no policies and grants are revoked;
--     the cf_ia_* SECURITY DEFINER functions below are the whole read/write
--     surface. Nothing reaches these rows through PostgREST's table endpoints.
--   * Every function: security definer, set search_path = '' (so only pg_catalog
--     resolves implicitly and every other name is written out in full), execute
--     REVOKED from public/anon/authenticated and granted to service_role only.
--     Supabase default-grants EXECUTE on new public functions to anon — do not
--     skip the revoke when adding a function.
--   * Errors: raise sqlstate 'PT4xx' with the machine code in HINT; PostgREST
--     maps PTnnn to HTTP nnn (409 conflict · 422 invalid). The proxy switches
--     on the hint (RPC_REFUSAL_CODES in vendor/chatfuel-proxy/supabaseRpc.ts).
--   * Every function takes the bot first and refuses an empty one: the routes
--     have already checked that the caller may name that bot, and a row is
--     never addressed without it.
--
-- WHAT A ROW IS. `message_key` is the platform's `clientId` — the one message
-- identifier that is non-null and stable across a message's status updates
-- (`id` is nullable in the schema). Direction is decided by the crawler from
-- `sender.__typename`, the only uniform signal: the contact spoke (in), the
-- operator, the automation or the platform's own app spoke (out), or the
-- platform said something about the conversation (system). System rows are
-- stored so the export is complete and excluded from every count.
-- ============================================================================

-- ---------------------------------------------------------------- tables
create table if not exists public.cf_ia_messages (
  bot_id           text not null,
  message_key      text not null,
  conversation_id  text not null,
  platform         text not null,
  sent_at          timestamptz not null,
  direction        text not null check (direction in ('in', 'out', 'system')),
  sender_type      text not null check (sender_type in ('contact', 'admin', 'automation', 'app', 'system')),
  sender_name      text,
  message_type     text not null,
  text             text,
  updated_at       timestamptz not null default now(),
  primary key (bot_id, message_key)
);
-- The series and the summary: everything in a window, by time.
create index if not exists cf_ia_messages_time_idx
  on public.cf_ia_messages (bot_id, sent_at);
-- The export and the per-conversation figures: a conversation's messages in order.
create index if not exists cf_ia_messages_conv_idx
  on public.cf_ia_messages (bot_id, conversation_id, sent_at, message_key);

-- One contact, and how far its conversation has been read.
--
-- `scan_state` and `scan_cursor` are the crawl's bookmark: `pending` has not
-- been opened in this run, `scanning` is part-way (the cursor says where),
-- `done` needs nothing more until the contact's `last_message_at` moves.
create table if not exists public.cf_ia_conversations (
  bot_id           text not null,
  conversation_id  text not null,
  platform         text not null,
  name             text not null default '',
  last_message_at  timestamptz,
  scan_state       text not null default 'pending' check (scan_state in ('pending', 'scanning', 'done')),
  scan_cursor      text,
  scanned_until    timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (bot_id, conversation_id)
);
create index if not exists cf_ia_conversations_scan_idx
  on public.cf_ia_conversations (bot_id, updated_at)
  where scan_state <> 'done';

-- The crawl itself, one row per bot.
--
-- `watermark` is the previous COMPLETED run's `started_at`: a contact whose
-- last message is older than it has nothing new, and a page whose oldest
-- message is older than it has been read before. `claimed_at` is the single-
-- run lock; a claim older than three minutes belongs to a chunk that never
-- came back and may be taken over.
create table if not exists public.cf_ia_sync (
  bot_id                text primary key,
  phase                 text not null default 'idle'
                        check (phase in ('idle', 'contacts', 'messages', 'done', 'cancelled', 'failed')),
  mode                  text not null default 'continue' check (mode in ('continue', 'restart')),
  watermark             timestamptz,
  started_at            timestamptz,
  finished_at           timestamptz,
  claimed_at            timestamptz,
  contacts_cursor       text,
  contacts_seen         int not null default 0,
  conversations_queued  int not null default 0,
  conversations_done    int not null default 0,
  messages_upserted     int not null default 0,
  requests_made         int not null default 0,
  error                 text,
  updated_at            timestamptz not null default now()
);

create table if not exists public.cf_ia_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);

alter table public.cf_ia_messages      enable row level security;
alter table public.cf_ia_conversations enable row level security;
alter table public.cf_ia_sync          enable row level security;
alter table public.cf_ia_migrations    enable row level security;
revoke all on table public.cf_ia_messages, public.cf_ia_conversations, public.cf_ia_sync, public.cf_ia_migrations
  from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.cf_ia_require_bot(p_bot_id text)
returns void language plpgsql immutable security definer set search_path = '' as $$
begin
  if p_bot_id is null or trim(p_bot_id) = '' then
    raise sqlstate 'PT422' using message = 'A bot is required', hint = 'bad_bot_id';
  end if;
end $$;
revoke execute on function public.cf_ia_require_bot(text) from public, anon, authenticated;
grant execute on function public.cf_ia_require_bot(text) to service_role;

/* The sync row as the routes hand it to the browser. Idle when nothing has
   ever run — a bot with no row is a bot that has not synced, not an error. */
create or replace function public.cf_ia_sync_json(s public.cf_ia_sync)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'phase', s.phase,
    'mode', s.mode,
    'watermark', s.watermark,
    'contactsCursor', s.contacts_cursor,
    'startedAt', s.started_at,
    'finishedAt', s.finished_at,
    'contactsSeen', s.contacts_seen,
    'conversationsQueued', s.conversations_queued,
    'conversationsDone', s.conversations_done,
    'messagesUpserted', s.messages_upserted,
    'requestsMade', s.requests_made,
    'error', s.error,
    'running', s.claimed_at is not null and s.claimed_at > now() - interval '3 minutes'
  )
$$;
revoke execute on function public.cf_ia_sync_json(public.cf_ia_sync) from public, anon, authenticated;
grant execute on function public.cf_ia_sync_json(public.cf_ia_sync) to service_role;

-- ---------------------------------------------------------------- the sync row
create or replace function public.cf_ia_sync_get(p_bot_id text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_row public.cf_ia_sync%rowtype;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  select * into v_row from public.cf_ia_sync where bot_id = p_bot_id;
  if not found then
    v_row.bot_id := p_bot_id;
    v_row.phase := 'idle';
    v_row.mode := 'continue';
    v_row.contacts_seen := 0;
    v_row.conversations_queued := 0;
    v_row.conversations_done := 0;
    v_row.messages_upserted := 0;
    v_row.requests_made := 0;
  end if;
  return public.cf_ia_sync_json(v_row);
end $$;
revoke execute on function public.cf_ia_sync_get(text) from public, anon, authenticated;
grant execute on function public.cf_ia_sync_get(text) to service_role;

/* What is stored for a bot, beside the sync row: the status route's second half. */
create or replace function public.cf_ia_stored(p_bot_id text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'messages', (select count(*) from public.cf_ia_messages m where m.bot_id = p_bot_id and m.direction <> 'system'),
    'conversations', (select count(*) from public.cf_ia_conversations c where c.bot_id = p_bot_id),
    'oldestAt', (select min(m.sent_at) from public.cf_ia_messages m where m.bot_id = p_bot_id),
    'newestAt', (select max(m.sent_at) from public.cf_ia_messages m where m.bot_id = p_bot_id)
  )
$$;
revoke execute on function public.cf_ia_stored(text) from public, anon, authenticated;
grant execute on function public.cf_ia_stored(text) to service_role;

/* Take the run.
   A live claim (younger than three minutes) is somebody else's chunk → 409.
   `continue` picks up where the last chunk stopped when the previous run did
   not finish, and starts a fresh incremental run — watermarked at the previous
   completed run's start — when it did. `restart` forgets the watermark and
   every scan bookmark, so everything is read again; the messages already
   stored are kept and upserted over. */
create or replace function public.cf_ia_sync_claim(p_bot_id text, p_mode text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.cf_ia_sync%rowtype; v_mode text := coalesce(p_mode, 'continue');
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if v_mode not in ('continue', 'restart') then
    raise sqlstate 'PT422' using message = 'That is not a sync mode', hint = 'bad_mode';
  end if;
  insert into public.cf_ia_sync (bot_id) values (p_bot_id) on conflict (bot_id) do nothing;
  select * into v_row from public.cf_ia_sync where bot_id = p_bot_id for update;
  if v_row.claimed_at is not null and v_row.claimed_at > now() - interval '3 minutes' then
    raise sqlstate 'PT409' using message = 'A sync is already running for this bot', hint = 'sync_busy';
  end if;

  if v_mode = 'restart' then
    update public.cf_ia_conversations
       set scan_state = 'pending', scan_cursor = null, scanned_until = null, updated_at = now()
     where bot_id = p_bot_id;
    update public.cf_ia_sync
       set phase = 'contacts', mode = 'restart', watermark = null,
           started_at = now(), finished_at = null, claimed_at = now(),
           contacts_cursor = null, contacts_seen = 0, conversations_queued = 0,
           conversations_done = 0, messages_upserted = 0, requests_made = 0,
           error = null, updated_at = now()
     where bot_id = p_bot_id
     returning * into v_row;
  elsif v_row.phase in ('contacts', 'messages') then
    -- A run that stopped mid-way (the tab closed, a chunk timed out): resume it.
    update public.cf_ia_sync
       set claimed_at = now(), error = null, updated_at = now()
     where bot_id = p_bot_id
     returning * into v_row;
  else
    update public.cf_ia_sync
       set phase = 'contacts', mode = 'continue',
           watermark = case when v_row.phase = 'done' then v_row.started_at else v_row.watermark end,
           started_at = now(), finished_at = null, claimed_at = now(),
           contacts_cursor = null, contacts_seen = 0, conversations_queued = 0,
           conversations_done = 0, messages_upserted = 0, requests_made = 0,
           error = null, updated_at = now()
     where bot_id = p_bot_id
     returning * into v_row;
  end if;
  return public.cf_ia_sync_json(v_row);
end $$;
revoke execute on function public.cf_ia_sync_claim(text, text) from public, anon, authenticated;
grant execute on function public.cf_ia_sync_claim(text, text) to service_role;

/* A chunk reporting in. Counters are DELTAS and add up, except the queue
   size, which the conversation upsert answers whole; the cursor and the phase
   replace. The claim is refreshed so a long chunk keeps its lock — or dropped
   when the chunk says `release`, so the next chunk may take it at once — and
   the row comes back so the chunk sees a cancel that landed meanwhile. */
create or replace function public.cf_ia_sync_progress(p_bot_id text, p_patch jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.cf_ia_sync%rowtype;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  -- A chunk of an earlier run, reporting after a cancel and a fresh claim:
  -- its counters belong to nobody. Told so, and nothing written.
  if p_patch ? 'runStartedAt' then
    select * into v_row from public.cf_ia_sync where bot_id = p_bot_id;
    if not found then
      raise sqlstate 'PT404' using message = 'No sync for this bot', hint = 'sync_not_found';
    end if;
    if v_row.started_at is distinct from (p_patch ->> 'runStartedAt')::timestamptz then
      return (public.cf_ia_sync_json(v_row)::jsonb || '{"superseded": true}'::jsonb)::json;
    end if;
  end if;
  update public.cf_ia_sync
     set phase = case when phase = 'cancelled' then 'cancelled' else coalesce(p_patch ->> 'phase', phase) end,
         contacts_cursor = case when p_patch ? 'contactsCursor' then p_patch ->> 'contactsCursor' else contacts_cursor end,
         contacts_seen = contacts_seen + coalesce((p_patch ->> 'contactsSeen')::int, 0),
         conversations_queued = case when p_patch ? 'conversationsQueued' then (p_patch ->> 'conversationsQueued')::int else conversations_queued end,
         conversations_done = conversations_done + coalesce((p_patch ->> 'conversationsDone')::int, 0),
         messages_upserted = messages_upserted + coalesce((p_patch ->> 'messagesUpserted')::int, 0),
         requests_made = requests_made + coalesce((p_patch ->> 'requestsMade')::int, 0),
         claimed_at = case
           when phase = 'cancelled' or coalesce((p_patch ->> 'release')::boolean, false) then null
           else now() end,
         updated_at = now()
   where bot_id = p_bot_id
   returning * into v_row;
  if not found then
    raise sqlstate 'PT404' using message = 'No sync for this bot', hint = 'sync_not_found';
  end if;
  return public.cf_ia_sync_json(v_row);
end $$;
revoke execute on function public.cf_ia_sync_progress(text, jsonb) from public, anon, authenticated;
grant execute on function public.cf_ia_sync_progress(text, jsonb) to service_role;

/* The run's end, whichever way it ended. Releases the claim. */
create or replace function public.cf_ia_sync_finish(p_bot_id text, p_phase text, p_error text default null)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.cf_ia_sync%rowtype;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_phase not in ('done', 'failed', 'cancelled') then
    raise sqlstate 'PT422' using message = 'That is not an end state', hint = 'bad_phase';
  end if;
  update public.cf_ia_sync
     set phase = p_phase, finished_at = now(), claimed_at = null,
         error = left(p_error, 500), updated_at = now()
   where bot_id = p_bot_id
   returning * into v_row;
  if not found then
    raise sqlstate 'PT404' using message = 'No sync for this bot', hint = 'sync_not_found';
  end if;
  return public.cf_ia_sync_json(v_row);
end $$;
revoke execute on function public.cf_ia_sync_finish(text, text, text) from public, anon, authenticated;
grant execute on function public.cf_ia_sync_finish(text, text, text) to service_role;

/* Stop the run. The claim is released at once so the next press of Sync is
   not refused; a chunk still running sees the phase on its next progress
   write and stops — or, if a new run has been claimed meanwhile, learns from
   `runStartedAt` that it is superseded and stops without touching the row. */
create or replace function public.cf_ia_sync_cancel(p_bot_id text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_row public.cf_ia_sync%rowtype;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  update public.cf_ia_sync
     set phase = case when phase in ('contacts', 'messages') then 'cancelled' else phase end,
         claimed_at = null,
         finished_at = case when phase in ('contacts', 'messages') then now() else finished_at end,
         updated_at = now()
   where bot_id = p_bot_id
   returning * into v_row;
  if not found then
    return public.cf_ia_sync_get(p_bot_id);
  end if;
  return public.cf_ia_sync_json(v_row);
end $$;
revoke execute on function public.cf_ia_sync_cancel(text) from public, anon, authenticated;
grant execute on function public.cf_ia_sync_cancel(text) to service_role;

-- ---------------------------------------------------------------- conversations
/* Contacts off the chat list. A contact whose last message moved since it was
   last scanned goes back to `pending`; one that is new is pending by default.
   Returns how many rows are now waiting to be read. */
create or replace function public.cf_ia_conversations_upsert(p_bot_id text, p_rows jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_queued int;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise sqlstate 'PT422' using message = 'Rows must be a list', hint = 'bad_rows';
  end if;
  insert into public.cf_ia_conversations (bot_id, conversation_id, platform, name, last_message_at, scan_state)
  select p_bot_id,
         r ->> 'id',
         coalesce(r ->> 'platform', 'unknown'),
         coalesce(r ->> 'name', ''),
         nullif(r ->> 'lastMessageAt', '')::timestamptz,
         case when coalesce((r ->> 'empty')::boolean, false) then 'done' else 'pending' end
  from jsonb_array_elements(p_rows) r
  where coalesce(r ->> 'id', '') <> ''
  on conflict (bot_id, conversation_id) do update
    set platform = excluded.platform,
        name = excluded.name,
        last_message_at = excluded.last_message_at,
        scan_state = case
          when excluded.scan_state = 'done' then public.cf_ia_conversations.scan_state
          when public.cf_ia_conversations.scan_state = 'done'
               and excluded.last_message_at is not distinct from public.cf_ia_conversations.last_message_at
            then 'done'
          else 'pending' end,
        scan_cursor = case
          when public.cf_ia_conversations.scan_state = 'done'
               and excluded.last_message_at is not distinct from public.cf_ia_conversations.last_message_at
            then public.cf_ia_conversations.scan_cursor
          else null end,
        updated_at = now();
  select count(*) into v_queued
    from public.cf_ia_conversations c
   where c.bot_id = p_bot_id and c.scan_state <> 'done';
  return json_build_object('queued', v_queued);
end $$;
revoke execute on function public.cf_ia_conversations_upsert(text, jsonb) from public, anon, authenticated;
grant execute on function public.cf_ia_conversations_upsert(text, jsonb) to service_role;

/* The next conversations to read, with their bookmarks. */
create or replace function public.cf_ia_conversations_next(p_bot_id text, p_limit int)
returns json language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(json_build_object(
    'id', c.conversation_id,
    'platform', c.platform,
    'name', c.name,
    'lastMessageAt', c.last_message_at,
    'scanState', c.scan_state,
    'scanCursor', c.scan_cursor,
    'scannedUntil', c.scanned_until
  ) order by c.updated_at), '[]'::json)
  from (
    select * from public.cf_ia_conversations c
    where c.bot_id = p_bot_id and c.scan_state <> 'done'
    order by c.updated_at
    limit greatest(1, least(coalesce(p_limit, 5), 50))
  ) c
$$;
revoke execute on function public.cf_ia_conversations_next(text, int) from public, anon, authenticated;
grant execute on function public.cf_ia_conversations_next(text, int) to service_role;

/* One conversation's bookmark after a page. */
create or replace function public.cf_ia_conversation_scan(
  p_bot_id text, p_id text, p_state text, p_cursor text, p_until timestamptz
)
returns json language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_state not in ('pending', 'scanning', 'done') then
    raise sqlstate 'PT422' using message = 'That is not a scan state', hint = 'bad_state';
  end if;
  update public.cf_ia_conversations
     set scan_state = p_state,
         scan_cursor = case when p_state = 'done' then null else p_cursor end,
         scanned_until = coalesce(p_until, scanned_until),
         updated_at = now()
   where bot_id = p_bot_id and conversation_id = p_id;
  return json_build_object('ok', found);
end $$;
revoke execute on function public.cf_ia_conversation_scan(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.cf_ia_conversation_scan(text, text, text, text, timestamptz) to service_role;

-- ---------------------------------------------------------------- messages
/* A page of messages off the wire. Upserted on the message key: a status
   update re-sent by the platform replaces the row rather than doubling it. */
create or replace function public.cf_ia_messages_upsert(p_bot_id text, p_rows jsonb)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_inserted int := 0; v_updated int := 0;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise sqlstate 'PT422' using message = 'Rows must be a list', hint = 'bad_rows';
  end if;
  with incoming as (
    select p_bot_id as bot_id,
           r ->> 'key' as message_key,
           r ->> 'conversationId' as conversation_id,
           coalesce(r ->> 'platform', 'unknown') as platform,
           (r ->> 'sentAt')::timestamptz as sent_at,
           r ->> 'direction' as direction,
           r ->> 'senderType' as sender_type,
           r ->> 'senderName' as sender_name,
           coalesce(r ->> 'messageType', 'Unknown') as message_type,
           r ->> 'text' as text
    from jsonb_array_elements(p_rows) r
    where coalesce(r ->> 'key', '') <> ''
      and coalesce(r ->> 'conversationId', '') <> ''
      and (r ->> 'sentAt') is not null
      and (r ->> 'direction') in ('in', 'out', 'system')
      and (r ->> 'senderType') in ('contact', 'admin', 'automation', 'app', 'system')
  ), written as (
    insert into public.cf_ia_messages as m
      (bot_id, message_key, conversation_id, platform, sent_at, direction, sender_type, sender_name, message_type, text)
    select bot_id, message_key, conversation_id, platform, sent_at, direction, sender_type, sender_name, message_type, text
    from incoming
    on conflict (bot_id, message_key) do update
      set conversation_id = excluded.conversation_id,
          platform = excluded.platform,
          sent_at = excluded.sent_at,
          direction = excluded.direction,
          sender_type = excluded.sender_type,
          sender_name = excluded.sender_name,
          message_type = excluded.message_type,
          text = excluded.text,
          updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_inserted, v_updated
    from written;
  return json_build_object('inserted', v_inserted, 'updated', v_updated);
end $$;
revoke execute on function public.cf_ia_messages_upsert(text, jsonb) from public, anon, authenticated;
grant execute on function public.cf_ia_messages_upsert(text, jsonb) to service_role;

-- ---------------------------------------------------------------- reading
/* The time series: inbound and outbound counts per bucket, in the given zone,
   zero-filled so a quiet hour is a zero and not a gap. The window is [from, to).
   Capped at 2000 buckets — the client picks buckets so that a day of minutes
   (1440) fits and a month of minutes does not. */
create or replace function public.cf_ia_series(
  p_bot_id text, p_from timestamptz, p_to timestamptz, p_bucket text, p_tz text
)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_step interval; v_count numeric; v_tz text := coalesce(p_tz, 'UTC');
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_from is null or p_to is null or p_from >= p_to then
    raise sqlstate 'PT422' using message = 'The window must run from an earlier instant to a later one', hint = 'bad_range';
  end if;
  if p_bucket not in ('minute', 'hour', 'day', 'week', 'month') then
    raise sqlstate 'PT422' using message = 'That is not a bucket size', hint = 'bad_bucket';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise sqlstate 'PT422' using message = 'That is not a time zone', hint = 'bad_tz';
  end if;
  v_step := ('1 ' || p_bucket)::interval;
  v_count := extract(epoch from (p_to - p_from)) / greatest(extract(epoch from v_step), 60);
  if v_count > 2000 then
    raise sqlstate 'PT422' using message = 'That window has too many buckets for this size', hint = 'range_too_wide';
  end if;

  return (
    with counted as (
      select date_trunc(p_bucket, m.sent_at at time zone v_tz) as b,
             count(*) filter (where m.direction = 'in') as n_in,
             count(*) filter (where m.direction = 'out') as n_out
      from public.cf_ia_messages m
      where m.bot_id = p_bot_id and m.sent_at >= p_from and m.sent_at < p_to and m.direction <> 'system'
      group by 1
    ), buckets as (
      select generate_series(
        date_trunc(p_bucket, p_from at time zone v_tz),
        date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone v_tz),
        v_step
      ) as b
    )
    select json_build_object(
      'points', coalesce((
        select json_agg(json_build_object(
          't', to_char(bk.b, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'in', coalesce(c.n_in, 0),
          'out', coalesce(c.n_out, 0)
        ) order by bk.b)
        from buckets bk left join counted c on c.b = bk.b
      ), '[]'::json),
      'total', json_build_object(
        'in', coalesce((select sum(n_in) from counted), 0),
        'out', coalesce((select sum(n_out) from counted), 0)
      )
    )
  );
end $$;
revoke execute on function public.cf_ia_series(text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.cf_ia_series(text, timestamptz, timestamptz, text, text) to service_role;

/* The figures over one window. Definitions, so the tiles and the docs cannot
   drift:
   - total / in / out / system: counts by direction; the tiles show in + out.
   - activeConversations: distinct conversations with a non-system message.
   - newConversations: conversations whose first-ever stored non-system
     message falls inside the window.
   - firstResponse: per conversation, the first inbound message in the window
     and the first outbound after it; the median of those gaps, capped at a
     day so a conversation answered next week does not dominate. Null when
     nothing was answered — "0" would claim an instant reply.
   - response: the same over every inbound run (consecutive inbound messages
     count once, from the first) followed by an outbound.
   - byHour / byWeekday: message counts by the hour and weekday of sending in
     the display zone. Weekday 0 is Sunday, as Postgres counts.
   - byPlatform, outboundBySender, topConversations: plain counts. */
create or replace function public.cf_ia_summary(p_bot_id text, p_from timestamptz, p_to timestamptz, p_tz text)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_tz text := coalesce(p_tz, 'UTC'); v_result json;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_from is null or p_to is null or p_from >= p_to then
    raise sqlstate 'PT422' using message = 'The window must run from an earlier instant to a later one', hint = 'bad_range';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise sqlstate 'PT422' using message = 'That is not a time zone', hint = 'bad_tz';
  end if;

  with w as (
    select m.* from public.cf_ia_messages m
    where m.bot_id = p_bot_id and m.sent_at >= p_from and m.sent_at < p_to
  ), live as (
    select * from w where direction <> 'system'
  ), firsts as (
    -- First-ever non-system message per conversation, over everything stored.
    select m.conversation_id, min(m.sent_at) as first_at
    from public.cf_ia_messages m
    where m.bot_id = p_bot_id and m.direction <> 'system'
      and m.conversation_id in (select conversation_id from live)
    group by m.conversation_id
  ), runs as (
    -- Every inbound message that starts a run (previous live message was not inbound).
    select l.conversation_id, l.sent_at,
           lag(l.direction) over (partition by l.conversation_id order by l.sent_at, l.message_key) as prev_dir,
           l.direction
    from live l
  ), run_starts as (
    select conversation_id, sent_at from runs where direction = 'in' and prev_dir is distinct from 'in'
  ), answered as (
    select r.conversation_id, r.sent_at,
           (select min(o.sent_at) from live o
             where o.conversation_id = r.conversation_id and o.direction = 'out' and o.sent_at > r.sent_at) as answered_at
    from run_starts r
  ), gaps as (
    select conversation_id, sent_at,
           least(extract(epoch from (answered_at - sent_at)) * 1000, 86400000)::bigint as gap_ms
    from answered where answered_at is not null
  ), first_gaps as (
    select distinct on (conversation_id) conversation_id, gap_ms
    from gaps order by conversation_id, sent_at
  )
  select json_build_object(
    'total', (select count(*) from live),
    'in', (select count(*) from live where direction = 'in'),
    'out', (select count(*) from live where direction = 'out'),
    'system', (select count(*) from w where direction = 'system'),
    'activeConversations', (select count(distinct conversation_id) from live),
    'newConversations', (select count(*) from firsts where first_at >= p_from and first_at < p_to),
    'outboundBySender', json_build_object(
      'automation', (select count(*) from live where direction = 'out' and sender_type = 'automation'),
      'admin', (select count(*) from live where direction = 'out' and sender_type = 'admin'),
      'app', (select count(*) from live where direction = 'out' and sender_type = 'app')
    ),
    'medianFirstResponseMs', (select percentile_cont(0.5) within group (order by gap_ms) from first_gaps),
    'firstResponseSample', (select count(*) from first_gaps),
    'medianResponseMs', (select percentile_cont(0.5) within group (order by gap_ms) from gaps),
    'responseSample', (select count(*) from gaps),
    'byHour', (
      select json_agg(coalesce(c.n, 0) order by h.h)
      from generate_series(0, 23) h(h)
      left join (
        select extract(hour from sent_at at time zone v_tz)::int as h, count(*) as n
        from live group by 1
      ) c on c.h = h.h
    ),
    'byWeekday', (
      select json_agg(coalesce(c.n, 0) order by d.d)
      from generate_series(0, 6) d(d)
      left join (
        select extract(dow from sent_at at time zone v_tz)::int as d, count(*) as n
        from live group by 1
      ) c on c.d = d.d
    ),
    'byPlatform', coalesce((
      select json_agg(json_build_object('platform', p.platform, 'in', p.n_in, 'out', p.n_out) order by (p.n_in + p.n_out) desc, p.platform)
      from (
        select platform,
               count(*) filter (where direction = 'in') as n_in,
               count(*) filter (where direction = 'out') as n_out
        from live group by platform
      ) p
    ), '[]'::json),
    'topConversations', coalesce((
      select json_agg(json_build_object(
        'id', t.conversation_id, 'platform', t.platform, 'name', coalesce(c.name, ''),
        'in', t.n_in, 'out', t.n_out, 'lastMessageAt', t.last_at
      ) order by (t.n_in + t.n_out) desc, t.last_at desc)
      from (
        select conversation_id, platform,
               count(*) filter (where direction = 'in') as n_in,
               count(*) filter (where direction = 'out') as n_out,
               max(sent_at) as last_at
        from live group by conversation_id, platform
        order by (count(*)) desc, max(sent_at) desc
        limit 10
      ) t
      left join public.cf_ia_conversations c on c.bot_id = p_bot_id and c.conversation_id = t.conversation_id
    ), '[]'::json),
    'coverage', json_build_object(
      'from', p_from, 'to', p_to, 'tz', v_tz,
      'storedNewestAt', (select max(m.sent_at) from public.cf_ia_messages m where m.bot_id = p_bot_id),
      'lastSyncFinishedAt', (select s.finished_at from public.cf_ia_sync s where s.bot_id = p_bot_id and s.phase = 'done')
    )
  ) into v_result;
  return v_result;
end $$;
revoke execute on function public.cf_ia_summary(text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.cf_ia_summary(text, timestamptz, timestamptz, text) to service_role;

/* The export's pages: messages in a window, ordered so a conversation's rows
   are contiguous, keyset-paged on (conversation, sent_at, key). */
create or replace function public.cf_ia_messages_page(
  p_bot_id text, p_from timestamptz, p_to timestamptz,
  p_after_conversation text, p_after_sent timestamptz, p_after_key text, p_limit int
)
returns json language plpgsql stable security definer set search_path = '' as $$
declare v_limit int := greatest(1, least(coalesce(p_limit, 1000), 1000)); v_rows json; v_next json;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_from is null or p_to is null or p_from >= p_to then
    raise sqlstate 'PT422' using message = 'The window must run from an earlier instant to a later one', hint = 'bad_range';
  end if;
  with page as (
    select m.* from public.cf_ia_messages m
    where m.bot_id = p_bot_id and m.sent_at >= p_from and m.sent_at < p_to
      and (p_after_conversation is null
           or (m.conversation_id, m.sent_at, m.message_key) > (p_after_conversation, p_after_sent, p_after_key))
    order by m.conversation_id, m.sent_at, m.message_key
    limit v_limit + 1
  ), rows_out as (
    select * from page order by conversation_id, sent_at, message_key limit v_limit
  )
  select
    coalesce((select json_agg(json_build_object(
      'key', r.message_key, 'conversationId', r.conversation_id, 'platform', r.platform,
      'sentAt', r.sent_at, 'direction', r.direction, 'senderType', r.sender_type,
      'senderName', r.sender_name, 'messageType', r.message_type, 'text', r.text
    ) order by r.conversation_id, r.sent_at, r.message_key) from rows_out r), '[]'::json),
    case when (select count(*) from page) > v_limit then (
      select json_build_object('conversationId', r.conversation_id, 'sentAt', r.sent_at, 'key', r.message_key)
      from rows_out r order by r.conversation_id desc, r.sent_at desc, r.message_key desc limit 1
    ) else null end
  into v_rows, v_next;
  return json_build_object('messages', v_rows, 'next', v_next);
end $$;
revoke execute on function public.cf_ia_messages_page(text, timestamptz, timestamptz, text, timestamptz, text, int) from public, anon, authenticated;
grant execute on function public.cf_ia_messages_page(text, timestamptz, timestamptz, text, timestamptz, text, int) to service_role;

/* The conversations touched in a window, for the export's index. */
create or replace function public.cf_ia_conversations_list(p_bot_id text, p_from timestamptz, p_to timestamptz)
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cf_ia_require_bot(p_bot_id);
  if p_from is null or p_to is null or p_from >= p_to then
    raise sqlstate 'PT422' using message = 'The window must run from an earlier instant to a later one', hint = 'bad_range';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'id', t.conversation_id, 'platform', t.platform, 'name', coalesce(c.name, ''),
      'messageCount', t.n, 'firstMessageAt', t.first_at, 'lastMessageAt', t.last_at
    ) order by t.last_at desc)
    from (
      select conversation_id, platform, count(*) as n, min(sent_at) as first_at, max(sent_at) as last_at
      from public.cf_ia_messages m
      where m.bot_id = p_bot_id and m.sent_at >= p_from and m.sent_at < p_to
      group by conversation_id, platform
      limit 20000
    ) t
    left join public.cf_ia_conversations c on c.bot_id = p_bot_id and c.conversation_id = t.conversation_id
  ), '[]'::json);
end $$;
revoke execute on function public.cf_ia_conversations_list(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cf_ia_conversations_list(text, timestamptz, timestamptz) to service_role;

/* Forget everything stored for a bot. The next sync starts from nothing. */
create or replace function public.cf_ia_purge(p_bot_id text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_messages int; v_conversations int;
begin
  perform public.cf_ia_require_bot(p_bot_id);
  delete from public.cf_ia_messages where bot_id = p_bot_id;
  get diagnostics v_messages = row_count;
  delete from public.cf_ia_conversations where bot_id = p_bot_id;
  get diagnostics v_conversations = row_count;
  delete from public.cf_ia_sync where bot_id = p_bot_id;
  return json_build_object('messages', v_messages, 'conversations', v_conversations);
end $$;
revoke execute on function public.cf_ia_purge(text) from public, anon, authenticated;
grant execute on function public.cf_ia_purge(text) to service_role;

-- ---------------------------------------------------------------- bookkeeping
insert into public.cf_ia_migrations (name) values ('0030_inbox_analytics') on conflict (name) do nothing;
notify pgrst, 'reload schema';
