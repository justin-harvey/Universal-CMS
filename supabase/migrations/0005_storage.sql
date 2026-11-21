-- mail-first-cms — storage buckets (M1/M4)
--
-- Two buckets, deliberately different visibility:
--
--  media      PUBLIC-read. Hero images and inline figures the baked static site
--             references by public URL. Editor-only write. (ebneo's model.)
--
--  documents  PRIVATE. Uploaded PDFs/files are NOT public objects. The site
--             links to a stable local route /documents/file/<slug> which 302s to
--             a short-lived signed URL (PRD §2: permanent URLs + no serverless
--             egress bottleneck + the file can't be scraped by guessing paths).
--             Editor + service-role write (the email pipeline uploads here).

begin;

-- ── media (public) ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects
  for select to public using (bucket_id = 'media');

drop policy if exists media_editor_write on storage.objects;
create policy media_editor_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_editor());

drop policy if exists media_editor_update on storage.objects;
create policy media_editor_update on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_editor())
  with check (bucket_id = 'media' and public.is_editor());

drop policy if exists media_editor_delete on storage.objects;
create policy media_editor_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_editor());

-- ── documents (private) ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- No public select policy: reads happen via a server-side signed URL minted by
-- the redirect route with the service role. Editors may write from the Studio.
drop policy if exists documents_editor_write on storage.objects;
create policy documents_editor_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.is_editor());

drop policy if exists documents_editor_update on storage.objects;
create policy documents_editor_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.is_editor())
  with check (bucket_id = 'documents' and public.is_editor());

drop policy if exists documents_editor_delete on storage.objects;
create policy documents_editor_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_editor());

commit;
