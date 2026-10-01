const CONFIG = window.URBAN_MUSIC_CONFIG || {};
let db = null;
let tracks = [];
let videos = [];
let artists = [];
let current = -1;
let playing = false;
let audio = null;
let session = null;

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const fmt = n => Number(n || 0).toLocaleString('pt-PT');
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const time = s => { s=Math.floor(Number(s)||0); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };

async function init(){
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase) {
    db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
    const r = await db.auth.getSession(); session = r.data?.session || null;
    db.auth.onAuthStateChange((_event, s) => { session=s; updateAccountUI(); });
  }
  await Promise.all([loadTracks(), loadVideos(), loadArtists()]);
  renderPage();
  bindGlobal();
  updateAccountUI();
}

async function loadTracks(){
  if(!db){ tracks=[]; return; }
  const {data,error}=await db.from('tracks').select('id,title,genre,cover_url,audio_url,duration_seconds,views_count,likes_count,downloads_count,artist_id,artists(id,stage_name,avatar_url)').eq('status','published').order('created_at',{ascending:false});
  if(error){ console.error(error); tracks=[]; return; }
  tracks=(data||[]).map(t=>({...t,artist_name:t.artists?.stage_name||'Artista',code:initials(t.title)}));
}
async function loadVideos(){
  if(!db){ videos=[]; return; }
  const {data,error}=await db.from('videos').select('id,title,description,thumbnail_url,original_url,streaming_url,duration_seconds,views_count,likes_count,downloads_count,artist_id,artists(id,stage_name,avatar_url)').eq('status','published').order('created_at',{ascending:false});
  if(error){ console.warn('videos',error.message); videos=[]; return; }
  videos=(data||[]).map(v=>({...v,artist_name:v.artists?.stage_name||'Artista',code:initials(v.title)}));
}
async function loadArtists(){
  if(!db){ artists=[]; return; }
  const {data,error}=await db.from('artists').select('id,stage_name,avatar_url,cover_url,bio,verified,followers_count').order('created_at',{ascending:false}).limit(30);
  if(error){artists=[];return} artists=data||[];
}
function initials(s){return (String(s||'UM').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2)||'UM').toUpperCase();}

function trackCard(t){
  return `<article class="track" data-track-id="${esc(t.id)}"><div class="track-cover" style="${t.cover_url?`background-image:linear-gradient(135deg,rgba(0,0,0,.15),rgba(0,0,0,.5)),url('${esc(t.cover_url)}');background-size:cover;background-position:center`:''}"><span class="cover-code">${esc(t.code)}</span><button class="cover-play" data-play="${esc(t.id)}" aria-label="Reproduzir">▶</button><button class="more" data-like="${esc(t.id)}" title="Curtir">♡</button></div><h3>${esc(t.title)}</h3><p>${esc(t.artist_name)}</p><div class="metrics"><span>◉ ${fmt(t.views_count)}</span><span>♡ ${fmt(t.likes_count)}</span><span>⇩ ${fmt(t.downloads_count)}</span></div></article>`;
}
function videoCard(v){
  return `<article class="track video-card"><div class="track-cover" style="${v.thumbnail_url?`background-image:linear-gradient(135deg,rgba(0,0,0,.12),rgba(0,0,0,.6)),url('${esc(v.thumbnail_url)}');background-size:cover;background-position:center`:''}"><span class="cover-code">${esc(v.code)}</span><button class="cover-play" data-video="${esc(v.id)}">▶</button><button class="more" data-video-like="${esc(v.id)}">♡</button></div><h3>${esc(v.title)}</h3><p>${esc(v.artist_name)}</p><div class="metrics"><span>◉ ${fmt(v.views_count)}</span><span>♡ ${fmt(v.likes_count)}</span><span>⇩ ${fmt(v.downloads_count)}</span></div></article>`;
}
function artistCard(a){
  const avatar=a.avatar_url?`style="background-image:url('${esc(a.avatar_url)}');background-size:cover;background-position:center"`:'';
  return `<article class="artist"><a href="artista.html?id=${encodeURIComponent(a.id)}" class="artist-pic" ${avatar}>${a.avatar_url?'':esc(initials(a.stage_name))}<span class="verified">${a.verified?'✓':''}</span></a><b>${esc(a.stage_name)}</b><small>${fmt(a.followers_count)} seguidores</small><button class="follow-btn" data-follow="${esc(a.id)}">Seguir</button></article>`;
}
function recentCard(t){return `<div class="recent"><div class="recent-cover">${esc(t.code)}</div><div class="recent-info"><b>${esc(t.title)}</b><small>${esc(t.artist_name)}</small><div class="recent-stats"><span>◉ ${fmt(t.views_count)}</span><span>♡ ${fmt(t.likes_count)}</span><span>⇩ ${fmt(t.downloads_count)}</span></div></div><button class="recent-menu" data-play="${esc(t.id)}">▶</button></div>`;}
function renderPage(){
  const p=location.pathname.split('/').pop() || 'index.html';
  const q=new URLSearchParams(location.search);
  const grid=$('#trackGrid');
  if(grid){
    let list=[...tracks];
    if(p==='pesquisa.html'){
      const term=(q.get('q')||'').trim().toLowerCase();
      const label=$('#searchLabel'); if(label) label.textContent=term?`Resultados para “${q.get('q')}”`:'Digite algo para pesquisar';
      list=term?tracks.filter(t=>`${t.title} ${t.artist_name} ${t.genre||''}`.toLowerCase().includes(term)):[];
    }
    if(p==='genero.html'){
      const g=(q.get('g')||'').toLowerCase(); const label=$('#genreTitle'); if(label) label.textContent='🎵 '+(q.get('g')||'Género');
      list=g?tracks.filter(t=>(t.genre||'').toLowerCase()===g):[];
    }
    grid.innerHTML=list.length?list.map(trackCard).join(''):'<div class="empty-state">Nenhuma música publicada ainda.</div>';
  }
  const recent=$('#recentGrid'); if(recent) recent.innerHTML=tracks.slice(0,6).map(recentCard).join('') || '<div class="empty-state">Ainda não há lançamentos.</div>';
  const vg=$('#videoGrid'); if(vg) vg.innerHTML=videos.length?videos.slice(0,10).map(videoCard).join(''):'<div class="empty-state">Ainda não há vídeos publicados.</div>';
  const ag=$('#artistGrid'); if(ag) ag.innerHTML=artists.length?artists.slice(0,12).map(artistCard).join(''):'<div class="empty-state">Ainda não existem artistas publicados.</div>';
  const pr=$('#playlistRow'); if(pr) renderPlaylists(pr);
  bindCards();
}
function renderPlaylists(el){
  const pls=[['HIP HOP VIBES','52K'],['AFRO BEATS','48K'],['AMAPIANO 2025','37K'],['TRAP NATION','29K'],['R&B COLLECTION','24K'],['MOOD BOA','19K']];
  el.innerHTML=pls.map((p,i)=>`<a class="playlist" href="genero.html?g=${encodeURIComponent(p[0].split(' ')[0])}"><div class="playlist-cover">${p[0]}</div><b>${p[0]}</b><small>Urban Music · ${p[1]} seguidores</small></a>`).join('');
}
function bindCards(){
  $$('[data-play]').forEach(b=>b.onclick=()=>playById(b.dataset.play));
  $$('[data-video]').forEach(b=>b.onclick=()=>openVideo(b.dataset.video));
  $$('[data-like]').forEach(b=>b.onclick=()=>likeTrack(b.dataset.like));
  $$('[data-video-like]').forEach(b=>b.onclick=()=>likeVideo(b.dataset.videoLike));
  $$('[data-follow]').forEach(b=>b.onclick=()=>followArtist(b.dataset.follow,b));
}

function getAudio(){
  if(audio)return audio;
  audio=document.createElement('audio'); audio.id='urbanAudio'; audio.preload='metadata'; document.body.appendChild(audio);
  audio.addEventListener('timeupdate',()=>{const bar=$('#progress'),ct=$('#currentTime'),du=$('#duration');if(audio.duration){if(bar)bar.style.width=(audio.currentTime/audio.duration*100)+'%';if(ct)ct.textContent=time(audio.currentTime);if(du)du.textContent=time(audio.duration);}});
  audio.addEventListener('loadedmetadata',()=>{const du=$('#duration');if(du)du.textContent=time(audio.duration)});
  audio.addEventListener('ended',next);
  return audio;
}
function playById(id){
  const i=tracks.findIndex(t=>t.id===id); if(i<0)return; current=i; const t=tracks[i];
  $('#playingTitle').textContent=t.title; $('#playingArtist').textContent=t.artist_name; $('#playingCover').textContent=t.code;
  const a=getAudio(); if(!t.audio_url){toast('Esta música ainda não tem áudio publicado.');return}
  a.src=t.audio_url; playing=true; a.play().catch(()=>{playing=false;toast('Não foi possível reproduzir este áudio.')}); updatePlayButton(); recordPlay(t.id);
}
function next(){if(!tracks.length)return;playById(tracks[(current+1)%tracks.length].id)}
function prev(){if(!tracks.length)return;playById(tracks[(current-1+tracks.length)%tracks.length].id)}
function updatePlayButton(){const b=$('#playBtn');if(b)b.textContent=playing?'Ⅱ':'▶'}
function bindGlobal(){
  const p=$('#playBtn'),pr=$('#prevBtn'),nx=$('#nextBtn'),seek=$('#seekbar');
  if(p)p.onclick=()=>{if(current<0){if(tracks[0])playById(tracks[0].id);return} const a=getAudio(); if(!tracks[current]?.audio_url){toast('Esta música ainda não tem áudio publicado.');return} playing=!playing; playing?a.play():a.pause();updatePlayButton()};
  if(pr)pr.onclick=prev;if(nx)nx.onclick=next;
  if(seek)seek.onclick=e=>{const a=getAudio();if(!a.duration)return;const r=seek.getBoundingClientRect();a.currentTime=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*a.duration};
  const dl=$('#downloadBtn'); if(dl)dl.onclick=e=>{e.preventDefault(); if(current>=0)downloadTrack(tracks[current]); else toast('Escolhe uma música primeiro.')};
  const like=$('#playerLike'); if(like)like.onclick=()=>{if(current>=0)likeTrack(tracks[current].id)};
  const login=$('#loginBtn'); if(login)login.onclick=openAuth;
}
async function recordPlay(trackId){
  if(!db)return;
  const {error}=await db.rpc('record_track_play',{p_track_id:trackId,p_session_token:getGuestToken()}); if(error)console.debug('play',error.message);
}
async function likeTrack(id){
  if(!session){openAuth('Para curtir uma música, cria uma conta ou entra.');return}
  if(!db)return;
  const {data,error}=await db.rpc('toggle_track_like',{p_track_id:id});
  if(error){toast('Não foi possível atualizar o like.');return}
  toast(data?.liked?'❤️ Like adicionado':'Like removido'); await loadTracks();renderPage();
}
async function likeVideo(id){
  if(!session){openAuth('Para curtir um vídeo, cria uma conta ou entra.');return}
  if(!db)return;
  const {data,error}=await db.rpc('toggle_video_like',{p_video_id:id});
  if(error){toast('Não foi possível atualizar o like.');return}
  toast(data?.liked?'❤️ Like adicionado':'Like removido'); await loadVideos();renderPage();
}
async function followArtist(id,button){
  if(!session){openAuth('Para seguir artistas, cria uma conta ou entra.');return}
  if(!db)return;
  const {data,error}=await db.rpc('toggle_artist_follow',{p_artist_id:id});
  if(error){toast('Não foi possível seguir este artista.');return}
  button.textContent=data?.following?'Seguindo':'Seguir'; toast(data?.following?'Artista seguido':'Deixaste de seguir'); await loadArtists();renderPage();
}
function getGuestToken(){let k=localStorage.getItem('urban_guest_token');if(!k){k=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());localStorage.setItem('urban_guest_token',k)}return k}
async function downloadTrack(t){
  if(!t?.audio_url)return toast('Este conteúdo não tem arquivo para download.');
  const {allowed,remaining}=await canDownload(); if(!allowed){openAuth('Já usaste os 3 downloads gratuitos. Cria uma conta para continuar.');return}
  if(db){const {error}=await db.rpc('register_download',{p_track_id:t.id,p_video_id:null,p_guest_token:session?null:getGuestToken()});if(error){toast(error.message.includes('guest_download_limit')?'Já usaste os 3 downloads gratuitos.': 'Não foi possível registrar o download.');return}} else if(!session){localStorage.setItem('urban_guest_downloads',String(Number(localStorage.getItem('urban_guest_downloads')||0)+1));}
  const a=document.createElement('a');a.href=t.audio_url;a.download=(t.title||'urban-music')+'.mp3';a.target='_blank';document.body.appendChild(a);a.click();a.remove();toast(session?'Download iniciado.':`Download iniciado. Restam ${remaining-1} gratuitos.`);
}
async function canDownload(){
  if(session)return {allowed:true,remaining:Infinity};
  if(!db){const n=Number(localStorage.getItem('urban_guest_downloads')||0);return {allowed:n<3,remaining:3-n};}
  const {data,error}=await db.rpc('guest_downloads_left',{p_guest_token:getGuestToken()}); if(error)return {allowed:false,remaining:0}; return {allowed:Number(data)>0,remaining:Number(data)};
}
function openVideo(id){
  const v=videos.find(x=>x.id===id);if(!v)return;
  const src=v.streaming_url||v.original_url;
  const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal video-modal"><button class="modal-close">×</button><h2>${esc(v.title)}</h2><p>${esc(v.artist_name)}</p><video controls playsinline preload="metadata" style="width:100%;max-height:70vh;border-radius:10px;background:#000" src="${esc(src)}"></video><div class="modal-actions"><button class="modal-primary" id="videoDownload">⇩ Download</button><button class="modal-primary" id="videoLike">♡ Like</button><label class="modal-primary">Velocidade <select id="videoSpeed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div></div>`;
  document.body.appendChild(wrap);const player=$('video',wrap);$('.modal-close',wrap).onclick=()=>{player?.pause();wrap.remove()};$('#videoLike',wrap).onclick=()=>likeVideo(v.id);$('#videoDownload',wrap).onclick=()=>downloadVideo(v);$('#videoSpeed',wrap).onchange=e=>{if(player)player.playbackRate=Number(e.target.value)}; wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()}); recordVideoView(v.id);
}
async function recordVideoView(id){if(db)await db.rpc('record_video_view',{p_video_id:id,p_session_token:getGuestToken()}).catch(()=>{});}
async function downloadVideo(v){
  const {allowed,remaining}=await canDownload();if(!allowed){openAuth('Já usaste os 3 downloads gratuitos. Cria uma conta para continuar.');return}
  if(db){const r=await db.rpc('register_download',{p_track_id:null,p_video_id:v.id,p_guest_token:session?null:getGuestToken()});if(r.error){toast(r.error.message.includes('guest_download_limit')?'Já usaste os 3 downloads gratuitos.':'Não foi possível registrar o download.');return}} else if(!session){localStorage.setItem('urban_guest_downloads',String(Number(localStorage.getItem('urban_guest_downloads')||0)+1));}
  const a=document.createElement('a');a.href=v.original_url||v.streaming_url;a.download=(v.title||'urban-video')+'.mp4';a.target='_blank';document.body.appendChild(a);a.click();a.remove();toast(session?'Download iniciado.':`Download iniciado. Restam ${remaining-1} gratuitos.`);
}

function openAuth(message=''){
  const old=$('#authModal');if(old)old.remove();
  const wrap=document.createElement('div');wrap.id='authModal';wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal"><button class="modal-close">×</button><h2>Urban Music</h2><p>${esc(message||'Entra na tua conta ou cria uma nova.')}</p><div class="auth-tabs"><button class="auth-tab active" data-mode="login">Entrar</button><button class="auth-tab" data-mode="signup">Criar conta</button></div><form id="authForm"><input id="authEmail" type="email" required placeholder="Email"><input id="authPassword" type="password" required minlength="6" placeholder="Palavra-passe"><input id="authName" type="text" placeholder="Nome" hidden><button class="modal-primary" type="submit">Continuar</button></form><div id="authMsg"></div></div>`;
  document.body.appendChild(wrap);let mode='login';$('.modal-close',wrap).onclick=()=>wrap.remove();
  $$('.auth-tab',wrap).forEach(b=>b.onclick=()=>{$$('.auth-tab',wrap).forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.mode;$('#authName',wrap).hidden=mode!=='signup';});
  $('#authForm',wrap).onsubmit=async e=>{e.preventDefault();if(!db){$('#authMsg',wrap).textContent='Supabase ainda não está configurado.';return}const email=$('#authEmail',wrap).value.trim(),password=$('#authPassword',wrap).value,name=$('#authName',wrap).value.trim();let r;if(mode==='signup')r=await db.auth.signUp({email,password,options:{data:{display_name:name}}});else r=await db.auth.signInWithPassword({email,password});if(r.error){$('#authMsg',wrap).textContent=r.error.message;return}toast(mode==='signup'?'Conta criada.':'Entraste com sucesso.');wrap.remove();updateAccountUI();};
}
function updateAccountUI(){const a=$('.avatar');if(a){a.textContent=session?(session.user.user_metadata?.display_name?.[0]||session.user.email?.[0]||'U').toUpperCase():'N';a.title=session?session.user.email:'Entrar / criar conta'}const login=$('#loginBtn');if(login)login.textContent=session?'Conta / Perfil':'Entrar / Criar conta';}
function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('show'),2600)}

init();
window.playById = playById;
window.openVideo = openVideo;
window.followArtistForPage = followArtist;
