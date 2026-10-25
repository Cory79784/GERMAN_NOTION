import {DEFAULT_MAP,plainProperty,review,REVIEW_ROLES} from '../public/core.js';
export const STATE_FIELD='学习记录';
export const LEGACY_FIELD='WortgartenState';
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const bad=message=>{throw new HttpError(400,message);};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const string=(x,max=500)=>typeof x==='string'&&x.length<=max;
const sameId=(a,b)=>a?.replaceAll('-','').toLowerCase()===b?.replaceAll('-','').toLowerCase();
export const pageId=x=>{if(!/^[a-f0-9-]{32,36}$/i.test(x||''))bad('记录 ID 无效');return x;};
export function decode(page){
  const raw=plainProperty(page.properties?.[STATE_FIELD]);
  if(!raw)return {version:1};
  try{const state=JSON.parse(raw);if(!object(state)||state.version!==1||Object.keys(state).some(k=>!['version','review','lastEventId','events','lastResultLabel'].includes(k))||(state.review&&!object(state.review))||(state.events&&(!Array.isArray(state.events)||state.events.some(x=>typeof x!=='string'))))throw Error();return state;}
  catch{throw new HttpError(409,'网页学习状态格式异常，未覆盖已有数据');}
}
export function learning(state){return Object.fromEntries(Object.entries(state.review||{}).filter(([k])=>REVIEW_ROLES.includes(k)));}
export function serialize(page){
  // Legacy mixed state is deliberately not read or migrated.
  let state,reviewError=null;try{state=decode(page);}catch(e){state={};reviewError=e.message;}
  return {id:page.id,url:page.url,edited:page.last_edited_time,learning:learning(state),reviewError,
    legacyStatePresent:!!plainProperty(page.properties?.[LEGACY_FIELD]),
    props:Object.fromEntries(Object.entries(page.properties).filter(([n])=>![STATE_FIELD,LEGACY_FIELD].includes(n)).map(([n,p])=>[n,plainProperty(p)]))};
}
function rules(list){
  if(!Array.isArray(list)||list.length>30)bad('筛选条件过多');
  return list.map(r=>{
    if(!object(r)||!string(r.field,150)||!['in','contains','range','empty','notempty'].includes(r.op))bad('筛选条件无效');
    const out={field:r.field,op:r.op};
    if(r.values!==undefined){if(!Array.isArray(r.values)||r.values.length>500||r.values.some(v=>!string(v)))bad('筛选选项无效');out.values=r.values;}
    if(r.value!==undefined){if(!string(r.value))bad('筛选文字过长');out.value=r.value;}
    for(const k of ['min','max'])if(r[k]!==undefined){if(r[k]!==''&&!Number.isFinite(Number(r[k])))bad('评分范围无效');out[k]=r[k];}
    return out;
  });
}
export function validatePreferences(p){
  if(!object(p)||JSON.stringify(p).length>40000)bad('设置内容无效或过大');
  const out={};
  if(p.settings){
    const x=p.settings;if(!object(x)||!object(x.map)||!['german','chinese'].includes(x.front)||!['german','chinese'].includes(x.back)||x.front===x.back)bad('卡片设置无效');
    if(!Array.isArray(x.display)||x.display.length>40||x.display.some(k=>!Object.hasOwn(DEFAULT_MAP,k)))bad('显示字段无效');
    const map={};for(const [k,v]of Object.entries(x.map)){if(!Object.hasOwn(DEFAULT_MAP,k)||!string(v,150))bad('字段映射无效');map[k]=v;}
    out.settings={map,front:x.front,back:x.back,display:x.display};
  }
  const filter=x=>{if(!object(x)||!['and','or'].includes(x.logic)||!string(x.search,500)||!['priority','updated','german','due'].includes(x.sort))bad('筛选设置无效');return {rules:rules(x.rules),logic:x.logic,search:x.search,sort:x.sort};};
  if(p.filter){out.filter=filter(p.filter);if(!['browse','cards','due'].includes(p.filter.mode))bad('学习模式无效');out.filter.mode=p.filter.mode;for(const [k,allowed]of Object.entries({scope:['all','new','due','trouble'],contentType:['all','text','image']}))if(p.filter[k]!==undefined){if(!allowed.includes(p.filter[k]))bad('学习筛选无效');out.filter[k]=p.filter[k];}}
  if(p.presets){if(!Array.isArray(p.presets)||p.presets.length>40)bad('保存的筛选过多');out.presets=p.presets.map(x=>{if(!string(x.name,40))bad('筛选名称过长');return {...filter(x),name:x.name};});}
  if(p.resume){if(!object(p.resume)||!['cards','due'].includes(p.resume.mode)||!string(p.resume.id,80))bad('续学位置无效');out.resume={mode:p.resume.mode,id:p.resume.id,...(p.resume.completed===true?{completed:true}:{})};if(p.resume.round){const r=p.resume.round;if(!Array.isArray(r.ids)||r.ids.length>200||new Set(r.ids).size!==r.ids.length||r.ids.some(id=>!/^[a-f0-9-]{32,36}$/i.test(id))||!Number.isInteger(r.index)||r.index<0||r.index>r.ids.length||!object(r.results)||Object.entries(r.results).some(([id,result])=>!r.ids.includes(id)||!['again','hard','good'].includes(result)))bad('本轮进度无效');out.resume.round={ids:r.ids,index:r.index,results:r.results};}}
  return out;
}
export async function sourceSchema(env,notion,create=false){
  const s=await notion(env,`/data_sources/${env.NOTION_DATA_SOURCE_ID}`);
  const property=s.properties[STATE_FIELD];
  if(create&&property&&property.type!=='rich_text')throw new HttpError(409,`${STATE_FIELD} 必须是文本属性，未修改现有字段`);
  if(!property&&create){await notion(env,`/data_sources/${env.NOTION_DATA_SOURCE_ID}`,'PATCH',{properties:{[STATE_FIELD]:{rich_text:{}}}});s.properties[STATE_FIELD]={type:'rich_text',rich_text:{}};}
  return s;
}
export async function ownedPage(env,notion,id){
  const p=await notion(env,`/pages/${pageId(id)}`);
  if(p.archived||p.in_trash||!sameId(p.parent?.data_source_id,env.NOTION_DATA_SOURCE_ID))throw new HttpError(403,'不能修改此数据源以外的记录');
  return p;
}
export async function writeState(env,notion,id,state){
  const raw=JSON.stringify(state);if(raw.length>60000)bad('学习状态过大');
  const chunks=[];for(let i=0;i<raw.length;){let end=Math.min(i+1900,raw.length);if(end<raw.length&&/[\uD800-\uDBFF]/.test(raw[end-1]))end--;chunks.push({text:{content:raw.slice(i,end)}});i=end;}
  await notion(env,`/pages/${pageId(id)}`,'PATCH',{properties:{[STATE_FIELD]:{rich_text:chunks}}});
}
export async function recordReview(env,notion,data){
  if(!object(data))bad('复习请求无效');
  pageId(data.id);if(!/^[a-zA-Z0-9-]{16,80}$/.test(data.eventId||'')||!['again','hard','good'].includes(data.result))bad('复习事件无效');
  if(Object.keys(data).some(k=>!['id','result','eventId','expectedLastReviewed'].includes(k)))bad('复习请求包含不允许的字段');
  const p=await ownedPage(env,notion,data.id),state=decode(p);await sourceSchema(env,notion,true);
  if(state.lastEventId===data.eventId||state.events?.includes(data.eventId))return {learning:learning(state),duplicate:true};
  const previous=state.review||{};
  if((previous.lastReviewed||null)!==(data.expectedLastReviewed||null))throw new HttpError(409,'其他设备已更新此卡片，请同步后继续');
  state.review=review(previous,data.result);state.lastEventId=data.eventId;state.events=[...(state.events||[]),data.eventId].slice(-100);
  state.lastResultLabel={again:'没记住',hard:'模糊',good:'记住'}[data.result];
  await writeState(env,notion,data.id,state);return {learning:learning(state)};
}
