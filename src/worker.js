import { plainProperty } from '../public/core.js';

const VERSION = 'passwordless-v2';
const HEADERS = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-App-Version':VERSION };
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:HEADERS});
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
async function notion(env,path,data) {
  const res=await (env.FETCH||fetch)('https://api.notion.com/v1'+path,{
    method:data?'POST':'GET',headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},
    body:data?JSON.stringify(data):undefined
  });
  if(!res.ok){
    const message=res.status===401?'Notion 密钥无效':res.status===403||res.status===404?'Notion 未授权此数据库，请检查连接权限':res.status===429?'Notion 请求过快，请稍后重试':`Notion 请求失败（${res.status}）`;
    throw new HttpError(res.status===429?429:502,message);
  }
  return res.json();
}
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
    try{
      // No public endpoint may mutate Notion, even if an old browser calls a retired endpoint.
      if(req.method!=='GET')return json({error:'免登录模式仅允许读取；分类和复习进度保存在当前浏览器。'},403);
      const configured=!!(env.NOTION_TOKEN&&env.NOTION_DATA_SOURCE_ID);
      if(url.pathname==='/api/status')return json({version:VERSION,configured,publicReadOnly:true,progressStorage:'browser'});
      if(!configured)throw new HttpError(503,'请在 Cloudflare 配置 NOTION_TOKEN 和 NOTION_DATA_SOURCE_ID，无需访问口令');
      if(!/^[0-9a-f-]{32,36}$/i.test(env.NOTION_DATA_SOURCE_ID))throw new HttpError(503,'NOTION_DATA_SOURCE_ID 格式无效');
      const source=encodeURIComponent(env.NOTION_DATA_SOURCE_ID);
      if(url.pathname==='/api/schema'){
        const s=await notion(env,`/data_sources/${source}`);
        return json({properties:Object.entries(s.properties).map(([name,p])=>({name,id:p.id,type:p.type,options:p[p.type]?.options?.map(x=>x.name)||[]}))});
      }
      if(url.pathname==='/api/entries'){
        const cursor=url.searchParams.get('cursor');
        if(cursor&&cursor.length>1000)throw new HttpError(400,'无效分页参数');
        const r=await notion(env,`/data_sources/${source}/query`,{page_size:100,...(cursor?{start_cursor:cursor}:{})});
        return json({entries:r.results.map(p=>({id:p.id,url:p.url,edited:p.last_edited_time,props:Object.fromEntries(Object.entries(p.properties).map(([name,v])=>[name,plainProperty(v)]))})),hasMore:r.has_more,cursor:r.next_cursor});
      }
      return json({error:'接口不存在'},404);
    }catch(e){
      const status=e.status||500;
      console.error(JSON.stringify({event:'api_error',path:url.pathname,status}));
      return json({error:e.status?e.message:'服务暂时不可用，请稍后重试'},status);
    }
  }
};
