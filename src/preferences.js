import {HttpError,validatePreferences} from './state.js';
// No Notion client or token is passed to the settings store.
export class SharedPreferences{
  constructor(ctx){this.storage=ctx.storage;}
  async fetch(req){
    if(req.method==='GET')return Response.json(await this.storage.get('preferences')||{preferences:null,updatedAt:null});
    if(req.method!=='POST')return new Response(null,{status:405});
    const clean=validatePreferences(await req.json());
    const value={preferences:clean,updatedAt:new Date().toISOString()};
    await this.storage.put('preferences',value);return Response.json(value);
  }
}
export async function preferences(env,value){
  if(!env.SHARED_PREFERENCES)throw new HttpError(503,'缺少 Cloudflare 共享设置绑定，请部署仓库中的完整 wrangler.jsonc；未写入 Notion');
  const id=env.SHARED_PREFERENCES.idFromName(env.NOTION_DATA_SOURCE_ID.replaceAll('-','').toLowerCase());
  const stub=env.SHARED_PREFERENCES.get(id),clean=value===undefined?undefined:validatePreferences(value);
  const r=await stub.fetch(new Request('https://settings.internal/preferences',{method:clean===undefined?'GET':'POST',body:clean===undefined?undefined:JSON.stringify(clean)}));
  if(!r.ok)throw new HttpError(502,'Cloudflare 共享设置保存失败，未写入 Notion');
  return r.json();
}
