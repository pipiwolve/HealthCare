
-- 创建 chat-images 存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- chat-images 存储策略（已登录用户可上传自己的图片，所有人可读）
CREATE POLICY "chat_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat_images_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-images');

CREATE POLICY "chat_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
