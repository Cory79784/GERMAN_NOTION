import { DEFAULT_MAP, plainProperty, review } from '../public/core.js';

const API = 'https://api.notion.com/v1';
const encoder = new TextEncoder();
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' };
const json = (body, status=200, extra={}) => new Response(JSON.stringify(body), {status,headers:{...headers,...extra}});
class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
const fail = (status,message) => { throw new HttpError(status,message); };
const id = value => { if (!/^[0-9a-f-]{32,36}$/i.test(value || '')) fail(400,'无效记录 ID'); return value; };
const equalId = (a,b) => a?.replaceAll('-','') === b?.replaceAll('-','');
async function digest(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s))); }
async function safeEqual(a,b) { const [x,y] = await Promise.all([digest(a),digest(b)]); return x.reduce((v,n,i)=>v|(n^y[i]),0)===0; }
async function signature(secret,value) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function authorized(req,env) {
  if (!env.APP_PASSWORD) return false;
  const cookie = (req.headers.get('cookie') || '').match(/(?:^|;\s*)gm_session=([^;]+)/)?.[1];
  if (!cookie) return false;
  const [expiry,sig] = cookie.split('.');
  return /^\d+$/.test(expiry) && Number(expiry)>Date.now() && Number(expiry)<Date.now()+31*86400000 && !!sig && safeEqual(sig,await signature(env.APP_PASSWORD,expiry));
}
async function body(req) {
  const raw = await req.text();
  if (raw.length>20000) fail(413,'请求过大');
  try { return JSON.parse(raw); } catch { fail(400,'请求不是有效 JSON'); }
}
async function notion(env,path,method='GET',data) {
  const res = await (env.FETCH || fetch)(API+path,{method,headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  if (!res.ok) {
    // Do not forward upstream responses that may contain private property values.
    const msg = res.status===401?'Notion 密钥无效':res.status===403||res.status===404?'Notion 未授权此数据库，请检查连接权限':res.status===429?'Notion 请求过快，请稍后重试':`Notion 请求失败（${res.status}）`;
    fail(res.status===429?429:502,msg);
  }
  return res.json();
}
async function schema(env) { return notion(env,`/data_sources/${id(env.NOTION_DATA_SOURCE_ID)}`); }
function mapFor(input,s) {
  const map = {...DEFAULT_MAP,...input};
  const roles = Object.keys(DEFAULT_MAP);
  for (const [role,name] of Object.entries(map)) {
    if (!roles.includes(role) || typeof name!=='string' || name.length>150) fail(400,'字段映射无效');
  }
  // A write must not map two roles to the same property.
  const writes = ['usage','priority','formalScore','frequencyScore','classification','mastery','nextReview','lastReviewed','reviewCount','interval','lastResult','streak','errorCount','eventId'];
  const mapped = writes.map(k=>map[k]).filter(n=>n && s.properties[n]);
  if(new Set(mapped).size!==mapped.length) fail(400,'可写字段不能重复映射');
  return map;
}
function encode(s,name,value) {
  const property = s.properties[name];
  if (!property) fail(409,`缺少字段「${name}」，请先初始化或调整映射`);
  switch(property.type) {
    case 'number': if (value!==null && typeof value!=='number') fail(400,`「${name}」需要数字`); return {number:value};
    case 'select': return {select:value===null?null:{name:String(value)}};
    case 'rich_text': return {rich_text:value===null?[]:[{text:{content:String(value)}}]};
    case 'date': return {date:value===null?null:{start:value}};
    default: fail(409,`「${name}」是只读或不兼容字段`);
  }
}
async function ownedPage(env,pageId) {
  const page = await notion(env,`/pages/${id(pageId)}`);
  if (page.archived || page.in_trash || !equalId(page.parent?.data_source_id,env.NOTION_DATA_SOURCE_ID)) fail(403,'不能修改此数据库以外的记录');
  return page;
}
const EXPECTED = {
  usage:{type:'select',name:'学习用途',options:['积极词汇','消极词汇']},
  priority:{type:'select',name:'Priority',options:['A','B','C','D']},
  formalScore:{type:'number',name:'书面程度评分'},frequencyScore:{type:'number',name:'常用度评分'},
  classification:{type:'select',name:'分类状态',options:['人工确认','待确认']},
  mastery:{type:'select',name:'Mastery',options:['New','Learning','Mastered']},
  nextReview:{type:'date',name:'NextReview'},lastReviewed:{type:'date',name:'LastReviewed'},
  reviewCount:{type:'number',name:'ReviewCount'},interval:{type:'number',name:'ReviewInterval'},
  lastResult:{type:'select',name:'LastResult',options:['Independent','Hesitant','WithHint','Incorrect']},
  streak:{type:'number',name:'IndependentStreak'},errorCount:{type:'number',name:'ErrorCount'},eventId:{type:'rich_text',name:'ReviewEventID'}
};
export default {
  async fetch(req,env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!['GET','POST'].includes(req.method)) fail(405,'不支持此方法');
      if (req.method==='POST' && req.headers.get('Origin')!==url.origin) fail(403,'请求来源不匹配');
      if (url.pathname==='/api/status' && req.method==='GET') return json({configured:!!(env.APP_PASSWORD&&env.NOTION_TOKEN&&env.NOTION_DATA_SOURCE_ID),authenticated:await authorized(req,env)});
      if (!env.APP_PASSWORD||!env.NOTION_TOKEN||!env.NOTION_DATA_SOURCE_ID) fail(503,'请先配置 APP_PASSWORD、NOTION_TOKEN 和 NOTION_DATA_SOURCE_ID');
      if(url.pathname==='/api/login' && req.method==='POST') {
        const data=await body(req);
        if(typeof data.password!=='string'||!await safeEqual(data.password,env.APP_PASSWORD)) return json({error:'访问口令错误'},401);
        const expiry=String(Date.now()+30*86400000);
        return json({ok:true},200,{'Set-Cookie':`gm_session=${expiry}.${await signature(env.APP_PASSWORD,expiry)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});
      }
      if (!await authorized(req,env)) fail(401,'请先输入访问口令');
      if(url.pathname==='/api/logout' && req.method==='POST') return json({ok:true},200,{'Set-Cookie':'gm_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
      if(url.pathname==='/api/schema' && req.method==='GET') {
        const s=await schema(env);
        return json({properties:Object.entries(s.properties).map(([name,p])=>({name,id:p.id,type:p.type,options:p[p.type]?.options?.map(x=>x.name)||[]})),mapping:DEFAULT_MAP});
      }
      if(url.pathname==='/api/entries' && req.method==='GET') {
        const cursor=url.searchParams.get('cursor');
        if(cursor && cursor.length>1000) fail(400,'无效分页参数');
        const r=await notion(env,`/data_sources/${id(env.NOTION_DATA_SOURCE_ID)}/query`,'POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})});
        return json({entries:r.results.map(p=>({id:p.id,url:p.url,edited:p.last_edited_time,props:Object.fromEntries(Object.entries(p.properties).map(([k,v])=>[k,plainProperty(v)]))})),hasMore:r.has_more,cursor:r.next_cursor});
      }
      if(url.pathname==='/api/setup' && req.method==='POST') {
        const data=await body(req),s=await schema(env),map=mapFor(data.mapping,s),properties={};
        for(const [role,def] of Object.entries(EXPECTED)) {
          if(!map[role]) fail(400,`请先映射字段 ${role}`);
          const name=map[role]||def.name,old=s.properties[name];
          if(old && old.type!==def.type) fail(409,`「${name}」类型应为 ${def.type}；请在映射中选择兼容字段`);
          if(def.type==='select') {
            const existing=old?.select?.options||[];
            const added=def.options.filter(n=>!existing.some(o=>o.name===n));
            if(!old||added.length) properties[name]={select:{options:[...existing.map(({id,name,color})=>({id,name,color})),...added.map(name=>({name}))]}};
          } else if(!old) properties[name]={[def.type]:{}};
        }
        if(Object.keys(properties).length) await notion(env,`/data_sources/${env.NOTION_DATA_SOURCE_ID}`,'PATCH',{properties});
        return json({ok:true,changed:Object.keys(properties)});
      }
      if(url.pathname==='/api/classify' && req.method==='POST') {
        const data=await body(req),s=await schema(env),map=mapFor(data.mapping,s);
        const allowed={usage:['积极词汇','消极词汇'],priority:['A','B','C','D'],formalScore:'score',frequencyScore:'score'};
        if(!data.changes || !Object.keys(data.changes).length) fail(400,'请选择要修改的分类');
        const properties={};
        for(const [role,value] of Object.entries(data.changes)) {
          if(!allowed[role] || (value!==null && (allowed[role]==='score' ? !Number.isInteger(value)||value<1||value>5 : !allowed[role].includes(value)))) fail(400,'无效分类值');
          properties[map[role]]=encode(s,map[role],value);
        }
        properties[map.classification]=encode(s,map.classification,'人工确认');
        await ownedPage(env,data.id);
        await notion(env,`/pages/${data.id}`,'PATCH',{properties});
        return json({ok:true,props:{...Object.fromEntries(Object.entries(data.changes).map(([k,v])=>[map[k],v])),[map.classification]:'人工确认'}});
      }
      if(url.pathname==='/api/review' && req.method==='POST') {
        const data=await body(req);
        if(!/^[a-zA-Z0-9-]{16,80}$/.test(data.eventId||'')) fail(400,'无效复习事件');
        if(!['again','hard','good'].includes(data.result)) fail(400,'无效复习结果');
        const s=await schema(env),map=mapFor(data.mapping,s),page=await ownedPage(env,data.id);
        const p=Object.fromEntries(Object.entries(page.properties).map(([k,v])=>[k,plainProperty(v)]));
        if(p[map.eventId]===data.eventId) return json({ok:true,duplicate:true,props:p});
        // Optimistic conflict check avoids silently replacing progress changed on another device.
        if((p[map.lastReviewed]||null)!==(data.expectedLastReviewed||null)) fail(409,'此卡片已在其他设备复习，请刷新后继续');
        const previous=Object.fromEntries(['interval','streak','reviewCount','errorCount'].map(k=>[k,p[map[k]]]));
        const state=review(previous,data.result),props={...Object.fromEntries(Object.entries(state).map(([k,v])=>[map[k],v])),[map.eventId]:data.eventId};
        const properties=Object.fromEntries(Object.entries(props).map(([k,v])=>[k,encode(s,k,v)]));
        await notion(env,`/pages/${data.id}`,'PATCH',{properties});
        return json({ok:true,props});
      }
      fail(404,'接口不存在');
    } catch(e) { return json({error:e.status?e.message:'服务暂时不可用，请稍后重试'},e.status||500); }
  }
};
