-- 允许 anon 角色也可向 chat-images bucket 上传图片
-- 微信小程序 auth 初始化需要时间，上传时 session 可能尚未就绪
CREATE POLICY "chat_images_anon_insert"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'chat-images');