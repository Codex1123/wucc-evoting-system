insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-photos',
  'candidate-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads candidate photos" on storage.objects;
create policy "public reads candidate photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'candidate-photos');

drop policy if exists "public uploads candidate photos" on storage.objects;
create policy "public uploads candidate photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'candidate-photos'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);
