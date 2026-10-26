-- ============================================================
-- 数字化衣柜 · Supabase 数据库结构
-- 在 Supabase 控制台 → SQL Editor 中粘贴执行
-- ============================================================

-- 1. 衣服表：存储每件衣服的元数据（图片存 Storage，这里存 URL）
create table if not exists public.clothes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '未命名衣服',
  category text not null default '上装',          -- 上装/下装/外套/连衣裙/鞋/配饰
  colors text[] not null default '{}',             -- 颜色标签数组
  materials text[] not null default '{}',          -- 材质标签数组
  styles text[] not null default '{}',             -- 风格标签数组
  custom_tags text[] not null default '{}',        -- 自定义标签数组
  image_url text not null,                         -- Storage 图片 URL
  storage_path text,                               -- Storage 路径（便于删除）
  created_at timestamptz not null default now()
);

-- 2. 搭配记录表：保存历史搭配（可选，便于回顾）
create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text,                                     -- 用户提示词
  weather text,                                    -- 天气
  style text,                                      -- 风格
  item_ids uuid[] not null default '{}',           -- 搭配的衣服 id 数组
  reason text,                                     -- AI 搭配理由
  created_at timestamptz not null default now()
);

-- 3. Row Level Security：每个用户只能读写自己的数据
alter table public.clothes enable row level security;
alter table public.outfits enable row level security;

create policy "用户可读自己的衣服" on public.clothes
  for select using (auth.uid() = user_id);
create policy "用户可插入自己的衣服" on public.clothes
  for insert with check (auth.uid() = user_id);
create policy "用户可更新自己的衣服" on public.clothes
  for update using (auth.uid() = user_id);
create policy "用户可删除自己的衣服" on public.clothes
  for delete using (auth.uid() = user_id);

create policy "用户可读自己的搭配" on public.outfits
  for select using (auth.uid() = user_id);
create policy "用户可插入自己的搭配" on public.outfits
  for insert with check (auth.uid() = user_id);
create policy "用户可删除自己的搭配" on public.outfits
  for delete using (auth.uid() = user_id);

-- 4. Storage 桶：存衣服照片（设为私有，通过签名 URL 访问）
insert into storage.buckets (id, name, public)
values ('clothes', 'clothes', false)
on conflict (id) do nothing;

-- Storage 访问策略：仅本人可访问自己的衣服图片
create policy "用户可上传衣服图片" on storage.objects
  for insert with check (
    bucket_id = 'clothes' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "用户可读取衣服图片" on storage.objects
  for select using (
    bucket_id = 'clothes' and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "用户可删除衣服图片" on storage.objects
  for delete using (
    bucket_id = 'clothes' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. 索引：加速按用户查询
create index if not exists clothes_user_idx on public.clothes(user_id);
create index if not exists outfits_user_idx on public.outfits(user_id);
