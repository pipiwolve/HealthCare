
-- TTS 生成音频存储桶
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-audio', 'generated-audio', true, 10485760, array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','application/octet-stream'])
on conflict (id) do nothing;

-- 公开读取策略
create policy "generated_audio_public_read" on storage.objects
  for select using (bucket_id = 'generated-audio');

-- 认证用户可上传
create policy "generated_audio_service_insert" on storage.objects
  for insert with check (bucket_id = 'generated-audio');
