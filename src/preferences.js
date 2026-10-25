import {HttpError,validatePreferences} from './state.js';
export function validateMasks(value){
 if(!value||!Array.isArray(value.rects)||value.rects.length>40||!Number.isInteger(value.expectedVersion)||value.expectedVersion<0)throw new HttpError(400,'遮挡配置无效');
 const rects=value.rects.map(r=>{if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)||r.w<0.001||r.h<0.001||r.x+r.w>1.000001||r.y+r.h>1.000001)throw new HttpError(400,'遮挡坐标必须是图片内的比例坐标');return {x:r.x,y:r.y,w:r.w,h:r.h};});
 const out={rects,expectedVersion:value.expectedVersion};
 if(value.strokes!==undefined){
  if(!Array.isArray(value.strokes)||value.strokes.length>100||JSON.stringify(value.strokes).length>55000)throw new HttpError(400,'涂画内容过多');
  let points=0;out.strokes=value.strokes.map(s=>{
   if(!s||!['pen','erase'].includes(s.tool)||!/^#[0-9a-f]{6}$/i.test(s.color)||!Number.isFinite(s.width)||s.width<.001||s.width>.5||!Array.isArray(s.points)||!s.points.length||s.points.length>1000)throw new HttpError(400,'记号笔参数无效');
   points+=s.points.length;if(points>3000||s.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1)))throw new HttpError(400,'涂画坐标无效或过多');
   return {tool:s.tool,color:s.color,width:s.width,points:s.points};
  });
 }
 return out;
}
export class SharedPreferences{
 constructor(ctx){this.storage=ctx.storage;}
 async fetch(req){
  const path=new URL(req.url).pathname;
  try{
   if(path.startsWith('/masks/')){
    const key=path.slice(1);if(req.method==='GET')return Response.json(await this.storage.get(key)||{rects:[],version:0});
    const clean=validateMasks(await req.json());
    return await this.storage.transaction(async tx=>{const old=await tx.get(key)||{version:0};if(old.version!==clean.expectedVersion)return Response.json({error:'另一设备已更新遮挡，请重新加载后再编辑'},{status:409});const value={rects:clean.rects,...(clean.strokes!==undefined?{strokes:clean.strokes}:old.strokes?{strokes:old.strokes}:{}),version:old.version+1};await tx.put(key,value);return Response.json(value);});
   }
   if(req.method==='GET')return Response.json(await this.storage.get('preferences')||{preferences:null,updatedAt:null});
   if(req.method!=='POST')return new Response(null,{status:405});
   const value={preferences:validatePreferences(await req.json()),updatedAt:new Date().toISOString()};await this.storage.put('preferences',value);return Response.json(value);
  }catch(e){return Response.json({error:e.status?e.message:'Cloudflare 保存失败'},{status:e.status||500});}
 }
}
async function cloudStore(env,path,value){
 if(!env.SHARED_PREFERENCES)throw new HttpError(503,'缺少 Cloudflare 共享设置绑定，请部署完整 wrangler.jsonc；未写入 Notion');
 const id=env.SHARED_PREFERENCES.idFromName(env.NOTION_DATA_SOURCE_ID.replaceAll('-','').toLowerCase());
 const r=await env.SHARED_PREFERENCES.get(id).fetch(new Request('https://settings.internal'+path,{method:value===undefined?'GET':'POST',body:value===undefined?undefined:JSON.stringify(value)}));
 const data=await r.json();if(!r.ok)throw new HttpError(r.status,data.error||'Cloudflare 保存失败');return data;
}
export const preferences=(env,value)=>cloudStore(env,'/preferences',value===undefined?undefined:validatePreferences(value));
export const maskStore=(env,data,write)=>cloudStore(env,`/masks/${data.id}/${encodeURIComponent(data.field)}/${data.image}`,write?validateMasks(data):undefined);
