// ============================================================
// 云衣柜 · 前端应用逻辑
// 依赖：Supabase CDN 客户端（在 index.html 中通过 importmap 或 script 引入）
// ============================================================

// ---------- 配置（部署时填入你自己的 Supabase 项目信息）----------
const SUPABASE_URL = 'https://ijabayliqlsuomflrvpz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_G7sfjp7AoxzOmExljMNfMw_klYRUbIC';
const AI_FUNCTION = 'ai-tag';                     // Edge Function 名称

// ---------- 引入 Supabase 客户端 ----------
// 方式一：直接 import（需要 importmap 或 CDN）
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 为避免 ES module CDN 兼容问题，这里用动态加载
let supabase = null;
let currentUser = null;
let clothes = [];  // 内存中的衣服列表

// ---------- 工具 ----------
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2400); }
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

const CATEGORIES = ['上装','下装','外套','连衣裙','鞋','配饰'];
const COLORS = ['黑色','白色','灰色','米色','棕色','卡其色','红色','粉色','橙色','黄色','绿色','蓝色','紫色','牛仔蓝','彩色','印花'];
const MATERIALS = ['棉','麻','丝绸','羊毛','羊绒','牛仔','皮革','雪纺','蕾丝','针织','聚酯','羽绒','呢子'];
const STYLES = ['休闲','通勤','商务','运动','甜美','复古','简约','街头','约会','学院','度假'];
const COLOR_HEX = {'黑色':'#222','白色':'#f5f5f5','灰色':'#9a9a9a','米色':'#e8dcc8','棕色':'#8b5a2b','卡其色':'#c3a878','红色':'#c0392b','粉色':'#f2a7c3','橙色':'#e67e22','黄色':'#f1c40f','绿色':'#5d9c5d','蓝色':'#4a6fa5','紫色':'#8a5ca0','牛仔蓝':'#5a7a9a','彩色':'linear-gradient(135deg,#f2a7c3,#f1c40f,#5d9c5d,#4a6fa5)','印花':'linear-gradient(135deg,#c3a878,#c0392b,#4a6fa5)'};

// ---------- 图片压缩 ----------
function compressImage(file, maxSide=1200, quality=0.82){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.naturalWidth,h=img.naturalHeight;
        if(w>maxSide||h>maxSide){ const s=Math.min(maxSide/w,maxSide/h); w=Math.round(w*s); h=Math.round(h*s); }
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/jpeg',quality));
      };
      img.onerror=reject; img.src=e.target.result;
    };
    r.onerror=reject; r.readAsDataURL(file);
  });
}
function dataURLtoBlob(dataURL){
  const [head,body]=dataURL.split(',');
  const mime=head.match(/:(.*?);/)?.[1]||'image/jpeg';
  const bin=atob(body); const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}

// ---------- 初始化 Supabase ----------
async function initSupabase(){
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data:{ session } } = await supabase.auth.getSession();
  if(session){ currentUser = session.user; await enterApp(); }
  else { showLogin(); }
}

// ---------- 登录/注册 ----------
function showLogin(){ $('#loginPage').classList.remove('hidden'); $('#app').classList.add('hidden'); }
function showReg(){ $('#loginBtn').textContent='注册并登录'; }
async function handleLogin(){
  const email=$('#loginEmail').value.trim();
  const pw=$('#loginPassword').value;
  if(!email||!pw){ toast('请输入邮箱和密码'); return; }
  const btn=$('#loginBtn'); btn.disabled=true; btn.textContent='登录中…';
  // 先尝试登录，失败则尝试注册
  let { data, error } = await supabase.auth.signInWithPassword({ email, password:pw });
  if(error){
    // 尝试注册
    ({ data, error } = await supabase.auth.signUp({ email, password:pw }));
    if(error){ btn.disabled=false; btn.textContent='登录'; toast('失败：'+error.message); return; }
    toast('注册成功，已登录');
  }
  currentUser = data.user;
  await enterApp();
}

async function enterApp(){
  $('#loginPage').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#avatar').textContent = (currentUser.email||'衣')[0].toUpperCase();
  $('#accountInfo').textContent = '已登录：'+currentUser.email;
  await loadClothes();
}

async function logout(){
  await supabase.auth.signOut();
  currentUser=null; clothes=[];
  $('#app').classList.add('hidden');
  $('#loginPage').classList.remove('hidden');
  $('#loginBtn').textContent='登录';
}

// ---------- 数据加载 ----------
async function loadClothes(){
  const { data, error } = await supabase.from('clothes').select('*').order('created_at',{ascending:false});
  if(error){ toast('加载失败：'+error.message); return; }
  clothes = data||[];
  renderCloset();
}

// ---------- 渲染衣柜 ----------
function renderCloset(){
  const catF=$('#filterCat')?.value||'全部', colF=$('#filterCol')?.value||'全部';
  let list=clothes.filter(c=>{
    if(catF!=='全部'&&c.category!==catF) return false;
    if(colF!=='全部'&&!(c.colors||[]).includes(colF)) return false;
    return true;
  });
  $('#statsBar').innerHTML=`
    <div class="stat"><div class="num">${clothes.length}</div><div class="lb">总数</div></div>
    <div class="stat"><div class="num">${clothes.filter(c=>c.category==='上装').length}</div><div class="lb">上装</div></div>
    <div class="stat"><div class="num">${clothes.filter(c=>c.category==='下装').length}</div><div class="lb">下装</div></div>
    <div class="stat"><div class="num">${clothes.filter(c=>c.category==='外套').length}</div><div class="lb">外套</div></div>`;
  const grid=$('#closetGrid');
  if(!list.length){ grid.innerHTML='<div class="hint" style="grid-column:1/-1;text-align:center;padding:40px 0">云衣柜还是空的，拍照上传第一件衣服吧 👆</div>'; return; }
  grid.innerHTML=list.map(c=>{
    const tags=[`<span class="tag cat">${esc(c.category)}</span>`,
      ...(c.colors||[]).map(x=>`<span class="tag col">${esc(x)}</span>`),
      ...(c.styles||[]).map(x=>`<span class="tag">${esc(x)}</span>`),
      ...(c.custom_tags||[]).map(x=>`<span class="tag custom">${esc(x)}</span>`)].join('');
    return `<div class="cloth-card" data-id="${c.id}">
      <img src="${esc(c.image_url)}" alt="${esc(c.name)}" loading="lazy">
      <div class="info"><div class="name">${esc(c.name)}</div><div class="tags">${tags}</div></div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.cloth-card').forEach(el=>el.onclick=()=>openEdit(el.dataset.id));
}

function renderFilters(){
  $('#filterBar').innerHTML=`
    <select id="filterCat">${['全部',...CATEGORIES].map(c=>`<option>${c}</option>`).join('')}</select>
    <select id="filterCol">${['全部',...COLORS].map(c=>`<option>${c}</option>`).join('')}</select>`;
  $('#filterCat').onchange=renderCloset;
  $('#filterCol').onchange=renderCloset;
}

// ---------- 上传 & AI 打标签 ----------
let processing=false;
async function handleUpload(files){
  const valid=[...files].filter(f=>f.type.startsWith('image/'));
  if(!valid.length) return;
  if(processing){ toast('处理中，请稍候'); return; }
  processing=true;
  const dz=$('#dropzone'); const ot=dz.querySelector('.t').textContent;
  let done=0;
  for(const f of valid){
    dz.querySelector('.t').textContent=`⏳ 处理 ${done+1}/${valid.length}…`;
    try{
      const compressed=await compressImage(f);
      // 1. AI 打标签（云端）
      const tags=await aiTag(compressed);
      // 2. 上传图片到 Storage
      const path=`${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
      const { error:upErr }=await supabase.storage.from('clothes').upload(path, dataURLtoBlob(compressed), {contentType:'image/jpeg'});
      if(upErr) throw upErr;
      const { data:urlData }=supabase.storage.from('clothes').getPublicUrl(path);
      // 3. 写入数据库
      const { error:dbErr }=await supabase.from('clothes').insert({
        user_id:currentUser.id, image_url:urlData.publicUrl, storage_path:path,
        name:tags.name, category:tags.category, colors:tags.colors, materials:tags.materials, styles:tags.styles, custom_tags:tags.customTags
      });
      if(dbErr) throw dbErr;
      done++;
    }catch(e){ console.error(e); toast('第'+(done+1)+'张失败：'+e.message); }
  }
  dz.querySelector('.t').textContent=ot;
  processing=false;
  toast(`已上传 ${done} 件到云衣柜`);
  await loadClothes();
}

// 云端 AI 打标签
async function aiTag(imageBase64){
  // 优先云端 Edge Function
  try{
    const { data, error }=await supabase.functions.invoke(AI_FUNCTION, { body:{ action:'tag', imageBase64 } });
    if(!error && data?.result){
      const m=data.result.match(/\{[\s\S]*\}/);
      const obj=JSON.parse(m?m[0]:data.result);
      return normalizeTags(obj);
    }
  }catch(e){ console.log('云端AI失败，走本地规则',e); }
  // 本地规则兜底
  return localTag(imageBase64);
}

function normalizeTags(obj){
  let cat=obj.category||'上装';
  const alias={'上衣':'上装','T恤':'上装','衬衫':'上装','卫衣':'上装','毛衣':'上装','针织衫':'上装','打底衫':'上装','背心':'上装','裤子':'下装','牛仔裤':'下装','短裤':'下装','长裤':'下装','西裤':'下装','阔腿裤':'下装','半身裙':'下装','短裙':'下装','长裙':'下装','外套':'外套','大衣':'外套','羽绒服':'外套','夹克':'外套','西装':'外套','风衣':'外套','开衫':'外套','棉服':'外套','冲锋衣':'外套','皮衣':'外套','连衣裙':'连衣裙','裙装':'连衣裙','鞋':'鞋','运动鞋':'鞋','皮鞋':'鞋','靴':'鞋','凉鞋':'鞋','高跟鞋':'鞋','包':'配饰','帽子':'配饰','围巾':'配饰','腰带':'配饰','首饰':'配饰'};
  if(alias[cat]) cat=alias[cat];
  if(!CATEGORIES.includes(cat)) cat='上装';
  return {
    name:obj.name||'未命名衣服', category:cat,
    colors: obj.color&&COLORS.includes(obj.color)?[obj.color]:[],
    materials: obj.material&&MATERIALS.includes(obj.material)?[obj.material]:[],
    styles: obj.style&&STYLES.includes(obj.style)?[obj.style]:[],
    customTags: Array.isArray(obj.tags)?obj.tags.slice(0,5):[]
  };
}

// 本地规则：canvas 取主色
function localTag(imageBase64){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas'), s=40; c.width=c.height=s;
      const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,s,s);
      const d=ctx.getImageData(0,0,s,s).data;
      const buckets={};
      for(let i=0;i<d.length;i+=4){
        const R=d[i],G=d[i+1],B=d[i+2];
        const mx=Math.max(R,G,B),mn=Math.min(R,G,B);
        const val=mx/255, sat=mx===0?0:(mx-mn)/mx;
        if(val<0.08||val>0.96) continue;
        buckets[(R>>5)+'_'+(G>>5)+'_'+(B>>5)]=(buckets[(R>>5)+'_'+(G>>5)+'_'+(B>>5)]||0)+1;
      }
      let best=null,bn=0; for(const k in buckets){ if(buckets[k]>bn){bn=buckets[k];best=k;} }
      let color='彩色';
      if(best){ const [r,g,b]=best.split('_').map(Number); color=nearestColor(r*32+16,g*32+16,b*32+16); }
      resolve({name:'未命名衣服',category:'上装',colors:[color],materials:[],styles:[],customTags:[]});
    };
    img.onerror=()=>resolve({name:'未命名衣服',category:'上装',colors:['彩色'],materials:[],styles:[],customTags:[]});
    img.src=imageBase64;
  });
}
function nearestColor(r,g,b){
  const refs={'黑色':[40,40,42],'白色':[245,245,245],'灰色':[150,150,150],'米色':[225,215,195],'棕色':[130,85,50],'卡其色':[180,165,120],'红色':[185,50,45],'粉色':[240,165,190],'橙色':[225,130,40],'黄色':[240,195,30],'绿色':[90,155,90],'蓝色':[70,110,160],'紫色':[135,90,160],'牛仔蓝':[90,120,150]};
  let best='灰色',bd=Infinity;
  for(const n in refs){ const [rr,gg,bb]=refs[n]; const dd=(r-rr)**2+(g-gg)**2+(b-bb)**2; if(dd<bd){bd=dd;best=n;} }
  return best;
}

// ---------- 编辑衣服 ----------
function openEdit(id){
  const c=clothes.find(x=>x.id===id); if(!c) return;
  $('#modalTitle').textContent='编辑衣服';
  $('#modalBody').innerHTML=`
    <div class="field"><label>名称</label><input type="text" id="eName" value="${esc(c.name)}"></div>
    <div class="field"><label>品类</label><div class="tag-select" id="eCat">${CATEGORIES.map(x=>`<span class="opt ${c.category===x?'on':''}" data-cat="${x}">${x}</span>`).join('')}</div></div>
    <div class="field"><label>颜色</label><div class="tag-select" id="eCol">${COLORS.map(x=>{const on=(c.colors||[]).includes(x);const hex=COLOR_HEX[x];return `<span class="opt color ${on?'on':''}" data-col="${x}" style="background:${hex}" title="${x}"></span>`;}).join('')}</div></div>
    <div class="field"><label>材质</label><div class="tag-select" id="eMat">${MATERIALS.map(x=>`<span class="opt ${(c.materials||[]).includes(x)?'on':''}" data-mat="${x}">${x}</span>`).join('')}</div></div>
    <div class="field"><label>风格</label><div class="tag-select" id="eStyle">${STYLES.map(x=>`<span class="opt ${(c.styles||[]).includes(x)?'on':''}" data-style="${x}">${x}</span>`).join('')}</div></div>
    <div class="field"><label>自定义标签（逗号分隔）</label><input type="text" id="eCustom" value="${esc((c.custom_tags||[]).join('、'))}" placeholder="显瘦、百搭、重要场合"></div>
    <button class="btn" id="saveEditBtn">保存</button>`;
  $('#mask').classList.add('show');
  $('#eCat').querySelectorAll('.opt').forEach(o=>o.onclick=()=>{ $('#eCat').querySelectorAll('.opt').forEach(x=>x.classList.remove('on')); o.classList.add('on'); });
  $('#eCol').querySelectorAll('.opt').forEach(o=>o.onclick=()=>o.classList.toggle('on'));
  $('#eMat').querySelectorAll('.opt').forEach(o=>o.onclick=()=>o.classList.toggle('on'));
  $('#eStyle').querySelectorAll('.opt').forEach(o=>o.onclick=()=>o.classList.toggle('on'));
  $('#saveEditBtn').onclick=async()=>{
    const update={
      name:$('#eName').value.trim()||'未命名衣服',
      category:$('#eCat').querySelector('.on')?.dataset.cat||'上装',
      colors:[...$('#eCol').querySelectorAll('.on')].map(x=>x.dataset.col),
      materials:[...$('#eMat').querySelectorAll('.on')].map(x=>x.dataset.mat),
      styles:[...$('#eStyle').querySelectorAll('.on')].map(x=>x.dataset.style),
      custom_tags:$('#eCustom').value.split(/[、,，]/).map(x=>x.trim()).filter(Boolean).slice(0,8)
    };
    const { error }=await supabase.from('clothes').update(update).eq('id',c.id);
    if(error){ toast('保存失败'); return; }
    $('#mask').classList.remove('show'); toast('已保存'); await loadClothes();
  };
}

// ---------- AI 搭配 ----------
async function generateOutfit(){
  if(clothes.length<2){ toast('衣柜至少需要 2 件衣服'); return; }
  const prompt=$('#outfitPrompt').value.trim()||'请给我搭一套';
  const weather=$('#weatherSelect').value, style=$('#styleSelect').value;
  $('#outfitResult').innerHTML='<div class="loading"><div class="spinner"></div>正在为你挑选…</div>';

  const closetInfo=clothes.map(c=>({id:c.id,name:c.name,category:c.category,colors:c.colors,styles:c.styles,custom_tags:c.custom_tags}));
  const p=`你是时尚搭配专家。衣柜JSON：${JSON.stringify(closetInfo)}\n需求：${prompt}${weather?'，天气：'+weather:''}${style?'，风格：'+style:''}\n请从衣柜选一套（上装+下装+外套，有连衣裙可整体）。输出严格JSON：{"outfit":[{"id":"衣服id","role":"上装/下装/外套/连衣裙"}],"reason":"理由100字内"}`;

  let outfit=null, reason='';
  try{
    const { data, error }=await supabase.functions.invoke(AI_FUNCTION,{body:{action:'text',prompt:p}});
    if(!error && data?.result){
      const m=data.result.match(/\{[\s\S]*\}/); const obj=JSON.parse(m?m[0]:data.result);
      const ids=(obj.outfit||[]).map(o=>o.id);
      const picked=ids.map(id=>clothes.find(c=>c.id===id)).filter(Boolean);
      if(picked.length>=2){ outfit=picked.map(c=>({c,role:(obj.outfit.find(o=>o.id===c.id)||{}).role||c.category})); reason=obj.reason||''; }
    }
  }catch(e){ console.log('AI搭配失败，走本地',e); }

  if(!outfit){ // 本地兜底
    const pick=cat=>{ const pool=clothes.filter(c=>c.category===cat); return pool[Math.floor(Math.random()*pool.length)]||null; };
    outfit=[]; const u=pick('上装'),l=pick('下装'); if(u)outfit.push({c:u,role:'上装'}); if(l)outfit.push({c:l,role:'下装'});
    const need=weather&&(weather.includes('寒冷')||weather.includes('严寒')||weather.includes('凉爽')||weather.includes('下雨'));
    if(need){ const o=pick('外套'); if(o)outfit.push({c:o,role:'外套'}); }
    reason='根据天气与风格为你挑选了这套搭配。';
  }

  $('#outfitResult').innerHTML=`
    <div class="card"><h2>👗 你的今日搭配</h2>
      <div class="outfit">${outfit.map(o=>`<div class="outfit-item"><img src="${esc(o.c.image_url)}"><div class="role"><b>${esc(o.role)}</b> · ${esc(o.c.name)}</div></div>`).join('')}</div>
      <div class="ai-result">${esc(reason)}</div>
      <div style="margin-top:12px"><button class="btn ghost small" id="reGen">🔄 换一套</button></div>
    </div>`;
  $('#reGen').onclick=generateOutfit;
}

// ---------- 新衣匹配 ----------
let matchImg=null;
async function handleMatchUpload(files){
  const f=files[0]; if(!f||!f.type.startsWith('image/')) return;
  matchImg=await compressImage(f);
  $('#matchPreview').innerHTML=`<div class="outfit-item"><img src="${matchImg}"></div>`;
  $('#matchBtn').classList.remove('hidden');
}
async function matchNewItem(){
  if(!matchImg) return;
  if(!clothes.length){ toast('云衣柜为空'); return; }
  const btn=$('#matchBtn'); btn.disabled=true; btn.textContent='识别中…';
  $('#matchResult').innerHTML='<div class="loading"><div class="spinner"></div>识别新衣并寻找搭配…</div>';

  // 先识别新衣
  let newTags=await aiTag(matchImg);
  let matched=null, reason='';
  const closetInfo=clothes.map(c=>({id:c.id,name:c.name,category:c.category,colors:c.colors,styles:c.styles}));
  try{
    const p=`新衣识别结果：${JSON.stringify(newTags)}。衣柜：${JSON.stringify(closetInfo)}。请挑2-4件能与新衣搭配的旧衣（品类互补、颜色协调）。输出严格JSON：{"items":[{"id":"衣服id","why":"为什么"}],"summary":"建议80字内"}`;
    const { data, error }=await supabase.functions.invoke(AI_FUNCTION,{body:{action:'match',imageBase64:matchImg,prompt:p}});
    if(!error && data?.result){
      const m=data.result.match(/\{[\s\S]*\}/); const obj=JSON.parse(m?m[0]:data.result);
      const ids=(obj.items||[]).map(o=>o.id);
      const picked=ids.map(id=>clothes.find(c=>c.id===id)).filter(Boolean);
      if(picked.length){ matched=picked.map((c,i)=>({c,why:(obj.items[i]||{}).why||''})); reason=obj.summary||''; }
    }
  }catch(e){ console.log('匹配失败走本地',e); }

  if(!matched){
    const comp=newTags.category==='上装'?'下装':newTags.category==='下装'?'上装':newTags.category==='外套'?['上装','下装']:['上装'];
    const targets=Array.isArray(comp)?comp:[comp];
    const pool=clothes.filter(c=>targets.includes(c.category));
    const neutral=['黑色','白色','灰色','米色'];
    matched=pool.map(c=>{ let s=0; if(c.colors?.some(x=>neutral.includes(x)))s+=3; if(newTags.colors?.some(x=>c.colors?.includes(x)))s+=2; return {c,s}; }).sort((a,b)=>b.s-a.s).slice(0,3).map(o=>({c:o.c,why:'品类互补，颜色协调'}));
    reason=`这件${newTags.name||newTags.category}可搭配以下 ${matched.length} 件旧衣。`;
  }

  $('#matchResult').innerHTML=`
    <div class="card"><h2>🆕 新衣识别</h2>
      <div style="width:120px;margin-bottom:8px"><div class="outfit-item"><img src="${matchImg}"><div class="role"><b>${esc(newTags.category)}</b></div></div></div>
      <div class="tags"><span class="tag cat">${esc(newTags.category)}</span>${(newTags.colors||[]).map(x=>`<span class="tag col">${esc(x)}</span>`).join('')}${(newTags.styles||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>
      <div class="ai-result" style="margin-top:10px">${esc(reason)}</div>
      <h2 style="margin-top:16px">👗 云衣柜推荐搭配</h2>
      <div class="outfit">${matched.map(m=>`<div class="outfit-item"><img src="${esc(m.c.image_url)}"><div class="role"><b>${esc(m.c.category)}</b> · ${esc(m.c.name)}</div>${m.why?`<div style="font-size:11px;color:var(--sub);padding:0 8px 8px">${esc(m.why)}</div>`:''}</div>`).join('')}</div>
    </div>`;
  btn.disabled=false; btn.textContent='🔍 识别并推荐搭配';
}

// ---------- 导出 ----------
function exportData(){
  if(!clothes.length){ toast('衣柜为空'); return; }
  const blob=new Blob([JSON.stringify(clothes,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='云衣柜备份_'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(a.href);
}

// ---------- 事件绑定 ----------
function bind(){
  // 登录
  $('#loginBtn').onclick=handleLogin;
  $('#toggleReg').onclick=()=>{ $('#loginBtn').textContent='注册并登录'; $('#toggleReg').textContent='已有账号？去登录'; $('#toggleReg').onclick=()=>{ $('#loginBtn').textContent='登录'; $('#toggleReg').textContent='没有账号？注册一个'; $('#toggleReg').onclick=()=>{}; bind(); }; };
  $('#loginPassword').addEventListener('keydown',e=>{ if(e.key==='Enter')handleLogin(); });
  $('#logoutBtn').onclick=logout;

  // 底部导航
  $$('.bottom-nav button').forEach(b=>b.onclick=()=>{
    $$('.bottom-nav button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    $$('.page').forEach(s=>s.classList.remove('active')); $('#page-'+b.dataset.page).classList.add('active');
  });

  // 上传
  const dz=$('#dropzone'), fi=$('#fileInput');
  dz.onclick=()=>fi.click(); fi.onchange=()=>handleUpload(fi.files);

  // 匹配上传
  const dz2=$('#dropzone2'), fi2=$('#fileInput2');
  dz2.onclick=()=>fi2.click(); fi2.onchange=()=>handleMatchUpload(fi2.files);
  $('#matchBtn').onclick=matchNewItem;

  // 搭配
  $('#genOutfitBtn').onclick=generateOutfit;

  // 设置
  $('#exportBtn').onclick=exportData;

  // 弹窗
  $('#modalClose').onclick=()=>$('#mask').classList.remove('show');
  $('#mask').onclick=e=>{ if(e.target===e.currentTarget)$('#mask').classList.remove('show'); };
}

// ---------- 启动 ----------
bind();
renderFilters();
initSupabase();
