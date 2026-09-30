-- Database functions for the standalone Notion widget file (vapor-widget.html).
-- The file is hosted by Notion, not by this app, so it can't reach /api/share.
-- Instead it calls these functions directly with the public anon key plus a
-- widget token; they check the token and act on the owner's behalf.
--
-- Accepts 'embed' and 'edit' share links (same access level).

create or replace function public.widget_owner(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.share_links
   where token = p_token
     and kind in ('embed', 'edit')
     and revoked_at is null
     and (expires_at is null or expires_at > now())
$$;

revoke all on function public.widget_owner(text) from public, anon, authenticated;

-- Keep only the columns a widget may write.
create or replace function public.widget_pick(p jsonb, allowed text[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(coalesce(p, '{}'::jsonb)) where key = any(allowed)
$$;

-- Everything the calendar needs for [p_from, p_to]: blocks in range (or edited
-- occurrences of that range), every series that has started by p_to, and all of
-- those series' sub-blocks. Plus the owner's categories.
create or replace function public.widget_load(p_token text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.widget_owner(p_token);
begin
  if v_owner is null then
    raise exception 'This widget link is invalid or has been turned off.' using errcode = '28000';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Invalid range';
  end if;

  return jsonb_build_object(
    'blocks', coalesce((
      with recursive picked as (
        select b.* from public.blocks b
         where b.user_id = v_owner
           and ((b.date between p_from and p_to)
             or (b.recurrence_date between p_from and p_to)
             or (b.repeat is not null and b.date <= p_to))
        union
        -- Sub-blocks, at any depth (series templates' live on the template's earlier date).
        select c.* from public.blocks c
          join picked p on c.parent_id = p.id
         where c.user_id = v_owner
      )
      select jsonb_agg(to_jsonb(x)) from (select distinct on (id) * from picked) x
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.position) from public.categories c where c.user_id = v_owner
    ), '[]'::jsonb)
  );
end;
$$;

-- All writes go through one function: p_op + a JSON payload.
create or replace function public.widget_write(p_token text, p_op text, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.widget_owner(p_token);
  block_cols constant text[] := array[
    'id', 'parent_id', 'title', 'date', 'start_time', 'end_time', 'category_id', 'status', 'notes',
    'repeat', 'repeat_exdates', 'recurrence_id', 'recurrence_date', 'bookable', 'all_day'];
  cat_cols constant text[] := array['id', 'name', 'color', 'position'];
  v_item jsonb;
  v_row public.blocks;
  v_cat public.categories;
  v_existing uuid;
  v_count int := 0;
begin
  if v_owner is null then
    raise exception 'This widget link is invalid or has been turned off.' using errcode = '28000';
  end if;

  if p_op in ('insert', 'upsert') then
    -- One row at a time, in order, so parents exist before their sub-blocks.
    for v_item in select * from jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb)) loop
      select user_id into v_existing from public.blocks where id = (v_item->>'id')::uuid;
      if found and v_existing <> v_owner then
        raise exception 'Not allowed';
      end if;

      if found then
        select * into v_row from public.blocks where id = (v_item->>'id')::uuid;
        v_row := jsonb_populate_record(v_row, public.widget_pick(v_item, block_cols) - 'id');
        update public.blocks set
          parent_id = v_row.parent_id, title = v_row.title, date = v_row.date,
          start_time = v_row.start_time, end_time = v_row.end_time, category_id = v_row.category_id,
          status = v_row.status, notes = v_row.notes, repeat = v_row.repeat,
          repeat_exdates = v_row.repeat_exdates, recurrence_id = v_row.recurrence_id,
          recurrence_date = v_row.recurrence_date, bookable = v_row.bookable, all_day = v_row.all_day
        where id = v_row.id and user_id = v_owner;
      else
        v_row := jsonb_populate_record(
          null::public.blocks,
          jsonb_build_object(
            'id', gen_random_uuid(), 'title', '', 'notes', '', 'status', 'planned',
            'repeat_exdates', '{}', 'bookable', false, 'all_day', false,
            'created_at', now(), 'updated_at', now()
          ) || public.widget_pick(v_item, block_cols) || jsonb_build_object('user_id', v_owner, 'source', 'shared')
        );
        insert into public.blocks select v_row.*;
      end if;
      v_count := v_count + 1;
    end loop;

  elsif p_op = 'update' then
    select * into v_row from public.blocks where id = (p_payload->>'id')::uuid and user_id = v_owner;
    if found then
      v_row := jsonb_populate_record(v_row, public.widget_pick(p_payload->'patch', block_cols) - 'id');
      update public.blocks set
        parent_id = v_row.parent_id, title = v_row.title, date = v_row.date,
        start_time = v_row.start_time, end_time = v_row.end_time, category_id = v_row.category_id,
        status = v_row.status, notes = v_row.notes, repeat = v_row.repeat,
        repeat_exdates = v_row.repeat_exdates, recurrence_id = v_row.recurrence_id,
        recurrence_date = v_row.recurrence_date, bookable = v_row.bookable, all_day = v_row.all_day
      where id = v_row.id and user_id = v_owner;
      v_count := 1;
    end if;

  elsif p_op = 'delete' then
    delete from public.blocks where id = (p_payload->>'id')::uuid and user_id = v_owner;
    get diagnostics v_count = row_count;

  elsif p_op = 'category.insert' then
    for v_item in select * from jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb)) loop
      v_cat := jsonb_populate_record(
        null::public.categories,
        jsonb_build_object('id', gen_random_uuid(), 'color', '#3b82f6', 'position', 0, 'created_at', now())
          || public.widget_pick(v_item, cat_cols) || jsonb_build_object('user_id', v_owner)
      );
      insert into public.categories select v_cat.*;
      v_count := v_count + 1;
    end loop;

  elsif p_op = 'category.update' then
    select * into v_cat from public.categories where id = (p_payload->>'id')::uuid and user_id = v_owner;
    if found then
      v_cat := jsonb_populate_record(v_cat, public.widget_pick(p_payload->'patch', cat_cols) - 'id');
      update public.categories set name = v_cat.name, color = v_cat.color, position = v_cat.position
       where id = v_cat.id and user_id = v_owner;
      v_count := 1;
    end if;

  elsif p_op = 'category.delete' then
    delete from public.categories where id = (p_payload->>'id')::uuid and user_id = v_owner;
    get diagnostics v_count = row_count;

  else
    raise exception 'Unknown op %', p_op;
  end if;

  return jsonb_build_object('count', v_count);
end;
$$;

revoke all on function public.widget_load(text, date, date) from public;
revoke all on function public.widget_write(text, text, jsonb) from public;
grant execute on function public.widget_load(text, date, date) to anon, authenticated;
grant execute on function public.widget_write(text, text, jsonb) to anon, authenticated;
