-- Notion widget links: like edit links (full access to your calendar through
-- /api/share), but created from Integrations and used by /embed.
alter table public.share_links drop constraint if exists share_links_kind_check;
alter table public.share_links add constraint share_links_kind_check
  check (kind in ('edit', 'booking', 'embed'));
