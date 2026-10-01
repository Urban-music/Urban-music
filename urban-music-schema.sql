
-- URBAN MUSIC — BASE DE DADOS V1
-- Supabase / PostgreSQL
-- Requisito: autenticação do Supabase (auth.users)

create extension if not exists "pgcrypto";

-- PERFIS
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  role text not null default 'listener'
    check (role in ('listener','artist','admin')),
  created_at timestamptz not null default now()
);

-- PERFIS DE ARTISTAS
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete cascade,
  stage_name text not null,
  avatar_url text,
  cover_url text,
  bio text,
  verified boolean not null default false,
  followers_count bigint not null default 0,
  created_at timestamptz not null default now()
);

-- MÚSICAS
create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null,
  description text,
  genre text,
  cover_url text,
  audio_url text not null,
  duration_seconds integer,
  views_count bigint not null default 0,
  likes_count bigint not null default 0,
  downloads_count bigint not null default 0,
  status text not null default 'pending'
    check (status in ('pending','published','rejected','hidden')),
  created_at timestamptz not null default now()
);

-- VÍDEOS
-- original_url preserva o arquivo original enviado pelo artista.
-- streaming_url pode apontar para uma versão preparada para reprodução,
-- sem apagar nem substituir o original.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null,
  description text,
  thumbnail_url text,
  original_url text not null,
  streaming_url text,
  duration_seconds integer,
  views_count bigint not null default 0,
  likes_count bigint not null default 0,
  downloads_count bigint not null default 0,
  status text not null default 'pending'
    check (status in ('pending','published','rejected','hidden')),
  created_at timestamptz not null default now()
);

-- SEGUIDORES
create table if not exists public.artist_follows (
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (artist_id, user_id)
);

-- LIKES DE MÚSICAS
create table if not exists public.track_likes (
  track_id uuid not null references public.tracks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, user_id)
);

-- LIKES DE VÍDEOS
create table if not exists public.video_likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

-- DOWNLOADS DE UTILIZADORES
create table if not exists public.downloads (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  track_id uuid references public.tracks(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (track_id is not null and video_id is null)
    or
    (track_id is null and video_id is not null)
  )
);

-- CONTROLO DOS 3 DOWNLOADS PARA VISITANTES
-- O token deve ser criado pelo frontend/backend e guardado em cookie/local storage.
create table if not exists public.guest_downloads (
  guest_token text primary key,
  download_count integer not null default 0 check (download_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PLAYLISTS
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  cover_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

-- HISTÓRICO DE VISUALIZAÇÕES/REPRODUÇÕES
-- Serve para métricas reais e proteção básica contra contagens repetidas.
create table if not exists public.track_plays (
  id bigint generated always as identity primary key,
  track_id uuid not null references public.tracks(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  session_token text,
  created_at timestamptz not null default now()
);

create table if not exists public.video_views (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  session_token text,
  created_at timestamptz not null default now()
);

-- ÍNDICES
create index if not exists idx_tracks_artist on public.tracks(artist_id);
create index if not exists idx_tracks_status on public.tracks(status);
create index if not exists idx_tracks_created on public.tracks(created_at desc);
create index if not exists idx_videos_artist on public.videos(artist_id);
create index if not exists idx_videos_status on public.videos(status);
create index if not exists idx_videos_created on public.videos(created_at desc);
create index if not exists idx_downloads_user on public.downloads(user_id);
create index if not exists idx_track_plays_track on public.track_plays(track_id);
create index if not exists idx_video_views_video on public.video_views(video_id);

-- PERFIL AUTOMÁTICO APÓS SIGNUP
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(coalesce(new.email, new.id::text), '@', 1),
    coalesce(new.raw_user_meta_data->>'display_name',
             split_part(coalesce(new.email, new.id::text), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.tracks enable row level security;
alter table public.videos enable row level security;
alter table public.artist_follows enable row level security;
alter table public.track_likes enable row level security;
alter table public.video_likes enable row level security;
alter table public.downloads enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.track_plays enable row level security;
alter table public.video_views enable row level security;
alter table public.guest_downloads enable row level security;

-- LEITURA PÚBLICA DO CONTEÚDO PUBLICADO
create policy "public can read published tracks"
on public.tracks for select
using (status = 'published');

create policy "public can read published videos"
on public.videos for select
using (status = 'published');

create policy "public can read artists"
on public.artists for select
using (true);

create policy "users can read profiles"
on public.profiles for select
using (true);

-- O PRÓPRIO UTILIZADOR PODE ALTERAR O SEU PERFIL
create policy "users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- SEGUIR ARTISTAS
create policy "users can follow artists"
on public.artist_follows for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can unfollow artists"
on public.artist_follows for delete
to authenticated
using (auth.uid() = user_id);

create policy "users can see follows"
on public.artist_follows for select
using (true);

-- LIKES
create policy "users can like tracks"
on public.track_likes for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can unlike tracks"
on public.track_likes for delete
to authenticated
using (auth.uid() = user_id);

create policy "users can see track likes"
on public.track_likes for select
using (true);

create policy "users can like videos"
on public.video_likes for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can unlike videos"
on public.video_likes for delete
to authenticated
using (auth.uid() = user_id);

create policy "users can see video likes"
on public.video_likes for select
using (true);

-- PLAYLISTS DO PRÓPRIO UTILIZADOR
create policy "users can create playlists"
on public.playlists for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can manage own playlists"
on public.playlists for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own playlists"
on public.playlists for delete
to authenticated
using (auth.uid() = user_id);

create policy "public can read public playlists"
on public.playlists for select
using (is_public = true or auth.uid() = user_id);

create policy "users can manage own playlist tracks"
on public.playlist_tracks for all
to authenticated
using (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_id and p.user_id = auth.uid()
  )
);

-- DOWNLOADS DO PRÓPRIO UTILIZADOR
create policy "users can record own downloads"
on public.downloads for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can see own downloads"
on public.downloads for select
to authenticated
using (auth.uid() = user_id);

-- OBSERVAÇÃO:
-- Publicação de tracks/videos deve ser feita pelo painel administrativo/artista
-- através de uma função/backend seguro. Não abrir INSERT público nestas tabelas.
-- O contador de visualizações/likes/downloads também deverá ser atualizado
-- por funções RPC/backend para evitar manipulação direta pelo navegador.

-- FUNÇÕES SEGURAS PARA INTERAÇÕES
create or replace function public.record_track_play(p_track_id uuid, p_session_token text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.track_plays(track_id,user_id,session_token) values(p_track_id,auth.uid(),p_session_token);
  update public.tracks set views_count=views_count+1 where id=p_track_id and status='published';
end; $$;

create or replace function public.record_video_view(p_video_id uuid, p_session_token text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.video_views(video_id,user_id,session_token) values(p_video_id,auth.uid(),p_session_token);
  update public.videos set views_count=views_count+1 where id=p_video_id and status='published';
end; $$;

create or replace function public.toggle_track_like(p_track_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare liked boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if exists(select 1 from public.track_likes where track_id=p_track_id and user_id=auth.uid()) then
    delete from public.track_likes where track_id=p_track_id and user_id=auth.uid(); liked:=false;
  else
    insert into public.track_likes(track_id,user_id) values(p_track_id,auth.uid()); liked:=true;
  end if;
  update public.tracks set likes_count=(select count(*) from public.track_likes where track_id=p_track_id) where id=p_track_id;
  return json_build_object('liked',liked);
end; $$;

create or replace function public.toggle_video_like(p_video_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare liked boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if exists(select 1 from public.video_likes where video_id=p_video_id and user_id=auth.uid()) then
    delete from public.video_likes where video_id=p_video_id and user_id=auth.uid(); liked:=false;
  else
    insert into public.video_likes(video_id,user_id) values(p_video_id,auth.uid()); liked:=true;
  end if;
  update public.videos set likes_count=(select count(*) from public.video_likes where video_id=p_video_id) where id=p_video_id;
  return json_build_object('liked',liked);
end; $$;

create or replace function public.toggle_artist_follow(p_artist_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare following boolean;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if exists(select 1 from public.artist_follows where artist_id=p_artist_id and user_id=auth.uid()) then
    delete from public.artist_follows where artist_id=p_artist_id and user_id=auth.uid(); following:=false;
  else
    insert into public.artist_follows(artist_id,user_id) values(p_artist_id,auth.uid()); following:=true;
  end if;
  update public.artists set followers_count=(select count(*) from public.artist_follows where artist_id=p_artist_id) where id=p_artist_id;
  return json_build_object('following',following);
end; $$;

create or replace function public.guest_downloads_left(p_guest_token text)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if p_guest_token is null or length(trim(p_guest_token))=0 then return 3; end if;
  select download_count into n from public.guest_downloads where guest_token=p_guest_token;
  return greatest(3-coalesce(n,0),0);
end; $$;

create or replace function public.register_download(p_track_id uuid default null, p_video_id uuid default null, p_guest_token text default null)
returns json language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if auth.uid() is null then
    if p_guest_token is null then raise exception 'guest_token_required'; end if;
    insert into public.guest_downloads(guest_token,download_count,updated_at) values(p_guest_token,1,now())
      on conflict(guest_token) do update set download_count=public.guest_downloads.download_count+1,updated_at=now();
    select download_count into n from public.guest_downloads where guest_token=p_guest_token;
    if n>3 then raise exception 'guest_download_limit'; end if;
  end if;
  insert into public.downloads(user_id,track_id,video_id) values(auth.uid(),p_track_id,p_video_id);
  if p_track_id is not null then update public.tracks set downloads_count=downloads_count+1 where id=p_track_id; end if;
  if p_video_id is not null then update public.videos set downloads_count=downloads_count+1 where id=p_video_id; end if;
  return json_build_object('ok',true);
end; $$;

-- Permissões RPC
revoke all on function public.record_track_play(uuid,text) from public;
grant execute on function public.record_track_play(uuid,text) to anon,authenticated;
revoke all on function public.record_video_view(uuid,text) from public;
grant execute on function public.record_video_view(uuid,text) to anon,authenticated;
revoke all on function public.toggle_track_like(uuid) from public;
grant execute on function public.toggle_track_like(uuid) to authenticated;
revoke all on function public.toggle_video_like(uuid) from public;
grant execute on function public.toggle_video_like(uuid) to authenticated;
revoke all on function public.toggle_artist_follow(uuid) from public;
grant execute on function public.toggle_artist_follow(uuid) to authenticated;
revoke all on function public.guest_downloads_left(text) from public;
grant execute on function public.guest_downloads_left(text) to anon,authenticated;
revoke all on function public.register_download(uuid,uuid,text) from public;
grant execute on function public.register_download(uuid,uuid,text) to anon,authenticated;

-- Storage básico para os uploads do Urban Music.
insert into storage.buckets(id,name,public) values
('audio','audio',true),('videos','videos',true),('covers','covers',true)
on conflict (id) do update set public=true;

-- Criação segura do perfil de artista pelo próprio utilizador.
create or replace function public.create_artist_profile(p_stage_name text, p_bio text default null, p_avatar_url text default null)
returns public.artists language plpgsql security definer set search_path=public as $$
declare a public.artists;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  insert into public.artists(user_id,stage_name,bio,avatar_url)
  values(auth.uid(),trim(p_stage_name),p_bio,p_avatar_url)
  returning * into a;
  update public.profiles set role='artist',display_name=coalesce(nullif(trim(p_stage_name),''),display_name) where id=auth.uid();
  return a;
end; $$;
revoke all on function public.create_artist_profile(text,text,text) from public;
grant execute on function public.create_artist_profile(text,text,text) to authenticated;

-- Storage: cada artista só pode enviar ficheiros para a sua própria pasta.
drop policy if exists "artists upload own audio" on storage.objects;
create policy "artists upload own audio" on storage.objects for insert to authenticated
with check (bucket_id='audio' and (storage.foldername(name))[1] in (select id::text from public.artists where user_id=auth.uid()));
drop policy if exists "artists upload own videos" on storage.objects;
create policy "artists upload own videos" on storage.objects for insert to authenticated
with check (bucket_id='videos' and (storage.foldername(name))[1] in (select id::text from public.artists where user_id=auth.uid()));
drop policy if exists "artists upload own covers" on storage.objects;
create policy "artists upload own covers" on storage.objects for insert to authenticated
with check (bucket_id='covers' and (storage.foldername(name))[1] in (select id::text from public.artists where user_id=auth.uid()));
