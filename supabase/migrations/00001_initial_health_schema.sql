
-- 用户角色枚举
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

-- 血型枚举
CREATE TYPE public.blood_type AS ENUM ('A', 'B', 'AB', 'O', 'other');

-- 性别枚举
CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'unknown');

-- profiles 用户基础信息表
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  openid TEXT,
  nickname TEXT,
  avatar_url TEXT,
  role public.user_role DEFAULT 'user'::user_role,
  has_seen_disclaimer BOOLEAN DEFAULT FALSE,
  has_seen_guide BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 家庭成员表（主用户也是成员之一）
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL DEFAULT '主用户',
  avatar_url TEXT,
  gender public.gender_type DEFAULT 'unknown',
  age INTEGER,
  height DECIMAL(5,1), -- cm
  weight DECIMAL(5,1), -- kg
  birthday DATE,
  blood_type public.blood_type,
  chronic_diseases TEXT[] DEFAULT '{}',
  allergens TEXT[] DEFAULT '{}',
  medications TEXT,
  daily_calorie_goal INTEGER,
  daily_protein_goal DECIMAL(6,1),
  daily_fat_goal DECIMAL(6,1),
  daily_carb_goal DECIMAL(6,1),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 当前选中的家庭成员（每个用户同时只有一个激活的成员）
CREATE TABLE public.user_active_member (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 绑定的设备表
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL, -- BLE device id
  device_name TEXT NOT NULL DEFAULT '我的营养秤',
  device_model TEXT,
  service_uuid TEXT,
  is_connected BOOLEAN DEFAULT FALSE,
  battery_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

-- 称重历史记录表
CREATE TABLE public.weighing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  ingredients JSONB NOT NULL DEFAULT '[]', -- [{name, weight, unit}]
  person_count INTEGER DEFAULT 1,
  analysis_result TEXT, -- markdown content
  total_calories DECIMAL(8,1),
  protein DECIMAL(6,1),
  fat DECIMAL(6,1),
  carbs DECIMAL(6,1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI对话历史会话表
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  title TEXT DEFAULT '新对话',
  context_data JSONB DEFAULT '{}', -- 携带的食材/分析结果上下文
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI对话消息表
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 提醒设置表
CREATE TABLE public.reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  breakfast_enabled BOOLEAN DEFAULT FALSE,
  breakfast_time TEXT DEFAULT '07:30',
  lunch_enabled BOOLEAN DEFAULT FALSE,
  lunch_time TEXT DEFAULT '12:00',
  dinner_enabled BOOLEAN DEFAULT FALSE,
  dinner_time TEXT DEFAULT '18:30',
  water_enabled BOOLEAN DEFAULT FALSE,
  water_time TEXT DEFAULT '09:00',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 开启 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.weighing_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- RLS 启用
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_active_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weighing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

-- 安全助手函数
CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS user_role
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- profiles RLS
CREATE POLICY "用户可查看自己的资料" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "管理员有完整权限" ON public.profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);
CREATE POLICY "用户可更新自己的资料" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

-- family_members RLS
CREATE POLICY "用户可操作自己的家庭成员" ON public.family_members
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- user_active_member RLS
CREATE POLICY "用户可操作自己的激活成员" ON public.user_active_member
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- devices RLS
CREATE POLICY "用户可操作自己的设备" ON public.devices
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- weighing_records RLS
CREATE POLICY "用户可操作自己的称重记录" ON public.weighing_records
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- chat_sessions RLS
CREATE POLICY "用户可操作自己的对话会话" ON public.chat_sessions
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- chat_messages RLS（通过session关联）
CREATE POLICY "用户可查看自己会话的消息" ON public.chat_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
  );
CREATE POLICY "用户可插入自己会话的消息" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
  );
CREATE POLICY "用户可删除自己会话的消息" ON public.chat_messages
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = session_id AND user_id = auth.uid())
  );

-- reminder_settings RLS
CREATE POLICY "用户可操作自己的提醒设置" ON public.reminder_settings
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- 新用户注册触发器
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nickname TEXT;
BEGIN
  v_nickname := COALESCE(
    (NEW.raw_user_meta_data->>'nickname')::text,
    (NEW.raw_user_meta_data->>'username')::text,
    '用户'
  );
  INSERT INTO public.profiles (id, username, openid, nickname, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'username')::text,
    (NEW.raw_user_meta_data->>'openid')::text,
    v_nickname,
    'user'::public.user_role
  );
  -- 自动创建主用户家庭成员
  INSERT INTO public.family_members (user_id, nickname, is_primary)
  VALUES (NEW.id, v_nickname, TRUE);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER family_members_updated_at BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER chat_sessions_updated_at BEFORE UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
