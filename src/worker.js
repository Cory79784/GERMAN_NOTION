import {HttpError,serialize,sourceSchema,preferences,classify,recordReview} from './state.js';
const VERSION='shared-v3';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-App-Version':VERSION};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
async function notion(env,path,method='GET',data){
  const r=await (env.FETCH||fetch)('https://api.notion.com/v1'+path,{method,headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  if(!r.ok){const message=r.status===401?'Notion 密钥无效':r.status===403?'Notion 权限不足，请给内部连接开启读取和更新内容权限':r.status===404?'Notion 未授权此数据库，请检查连接权限':r.status===429?'Notion 请求过快，请稍后重试':`Notion 请求失败（${r.status}）`;throw new HttpError(r.status===429?429:502,message);}
  return r.json();
}
async function body(req){const raw=await req.text();if(raw.length>65000)throw new HttpError(413,'请求过大');try{return JSON.parse(raw);}catch{throw new HttpError(400,'无效 JSON');}}
export default{async fetch(req,env){
  const u=new URL(req.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
  try{
    if(!['GET','POST'].includes(req.method))return json({error:'不支持此方法'},405);
    if(req.method==='POST'&&req.headers.get('Origin')!==u.origin)return json({error:'请求来源不匹配'},403);
    const configured=!!(env.NOTION_TOKEN&&env.NOTION_DATA_SOURCE_ID);
    if(u.pathname==='/api/status'&&req.method==='GET')return json({version:VERSION,configured,loginRequired:false,originalContentReadOnly:true,learningShared:true,progressStorage:'notion'});
    if(!configured)throw new HttpError(503,'请配置 NOTION_TOKEN 和 NOTION_DATA_SOURCE_ID；无需访问口令');
    if(!/^[0-9a-f-]{32,36}$/i.test(env.NOTION_DATA_SOURCE_ID))throw new HttpError(503,'NOTION_DATA_SOURCE_ID 格式无效');
    const source=env.NOTION_DATA_SOURCE_ID;
    if(u.pathname==='/api/schema'&&req.method==='GET'){const s=await sourceSchema(env,notion);return json({properties:Object.entries(s.properties).filter(([n])=>n!=='WortgartenState').map(([name,p])=>({name,id:p.id,type:p.type,options:p[p.type]?.options?.map(x=>x.name)||[]}))});}
    if(u.pathname==='/api/entries'&&req.method==='GET'){
      const cursor=u.searchParams.get('cursor');if(cursor&&cursor.length>1000)throw new HttpError(400,'无效分页参数');
      const r=await notion(env,`/data_sources/${source}/query`,'POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})});
      return json({entries:r.results.map(serialize),hasMore:r.has_more,cursor:r.next_cursor});
    }
    if(u.pathname==='/api/preferences')return json(await preferences(env,notion,req.method==='POST'?await body(req):undefined));
    if(u.pathname==='/api/classify'&&req.method==='POST')return json(await classify(env,notion,await body(req)));
    if(u.pathname==='/api/review'&&req.method==='POST')return json(await recordReview(env,notion,await body(req)));
    return json({error:'接口不存在'},404);
  }catch(e){const status=e.status||500;console.error(JSON.stringify({event:'api_error',path:u.pathname,status}));return json({error:e.status?e.message:'服务暂时不可用，请稍后重试'},status);}
}};
