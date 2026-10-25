import {HttpError,serialize,sourceSchema,recordReview,STATE_FIELD,LEGACY_FIELD} from './state.js';
const VERSION='screenshots-v5';
import {mediaMetadata,imageResponse,selectedImage} from './media.js';
import {maskStore} from './preferences.js';
export {SharedPreferences} from './preferences.js';
import {preferences} from './preferences.js';
const DATABASE_ID='371bf40d-a207-49eb-8207-51efaf2cb807';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-App-Version':VERSION};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
async function notion(env,path,method='GET',data){
  // The upstream client rejects every mutation except these two fixed shapes.
  const source=`/data_sources/${env.NOTION_DATA_SOURCE_ID}`;
  const only=(o,key)=>o&&Object.keys(o).length===1&&Object.hasOwn(o,key);
  const schemaWrite=method==='PATCH'&&path===source&&only(data,'properties')&&only(data.properties,STATE_FIELD)&&JSON.stringify(data.properties[STATE_FIELD])==='{"rich_text":{}}';
  const pageWrite=method==='PATCH'&&/^\/pages\/[a-f0-9-]{32,36}$/i.test(path)&&only(data,'properties')&&only(data.properties,STATE_FIELD)&&only(data.properties[STATE_FIELD],'rich_text')&&Array.isArray(data.properties[STATE_FIELD].rich_text);
  if(method!=='GET'&&!(method==='POST'&&path===source+'/query')&&!schemaWrite&&!pageWrite)throw new HttpError(403,'禁止修改 Notion 原始内容或其他字段');
  let r;
  try{r=await (env.FETCH||fetch)('https://api.notion.com/v1'+path,{method,signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${env.NOTION_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});}
  catch{throw new HttpError(502,'无法连接 Notion 服务（网络错误或超时）');}
  if(!r.ok){let upstream={};try{upstream=await r.json();}catch{}const message=r.status===401?'Notion 密钥无效':r.status===403?'Notion 权限不足，请给内部连接开启读取和更新内容权限':r.status===404?'Notion 找不到此数据源：可能是数据源 ID 不匹配，或当前连接无法访问':r.status===429?'Notion 请求过快，请稍后重试':`Notion 请求失败（${r.status}）`;const error=new HttpError(r.status===429?429:502,message);error.upstreamStatus=r.status;error.upstreamCode=/^[a-z_]{1,60}$/.test(upstream.code||'')?upstream.code:undefined;throw error;}
  try{return await r.json();}catch{throw new HttpError(502,'Notion 返回数据格式异常');}
}
async function diagnostics(env){
  const check=async(path,select)=>{try{return {ok:true,...select(await notion(env,path))};}catch(e){return {ok:false,status:e.upstreamStatus||e.status||502,code:e.upstreamCode,message:e.status?e.message:'诊断请求失败'};}};
  const [connection,source,database]=await Promise.all([
    check('/users/me',u=>({name:u.name||'未命名连接'})),
    check(`/data_sources/${env.NOTION_DATA_SOURCE_ID}`,s=>({id:s.id||env.NOTION_DATA_SOURCE_ID})),
    check(`/databases/${env.NOTION_DATABASE_ID||DATABASE_ID}`,d=>({dataSources:(d.data_sources||[]).map(x=>({id:x.id,name:x.name}))}))
  ]);
  const sameId=(a,b)=>a?.replaceAll('-','').toLowerCase()===b?.replaceAll('-','').toLowerCase();
  const mismatch=database.ok&&database.dataSources.length>0&&!database.dataSources.some(x=>sameId(x.id,env.NOTION_DATA_SOURCE_ID));
  const conclusion=!connection.ok?'先检查连接密钥是否有效；下面保留实际请求结果。':mismatch?'数据库可以访问，但配置的数据源 ID 不属于这个数据库；请使用下方实际数据源 ID。':source.ok?'数据源连接正常；若学习内容仍失败，请重试同步并查看具体错误。':database.ok?'数据库可以访问，但数据源请求失败；请核对下方实际数据源 ID 和错误码。':'密钥有效，但数据库与数据源均无法访问；尚不能区分对象 ID 不匹配和此连接缺少页面访问权。';
  return {version:VERSION,configuredSourceId:env.NOTION_DATA_SOURCE_ID,connection,source,database,conclusion};
}
async function body(req){const raw=await req.text();if(raw.length>65000)throw new HttpError(413,'请求过大');try{return JSON.parse(raw);}catch{throw new HttpError(400,'无效 JSON');}}
export default{async fetch(req,env){
  const u=new URL(req.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
  try{
    if(!['GET','POST'].includes(req.method))return json({error:'不支持此方法'},405);
    if(req.method==='POST'&&req.headers.get('Origin')!==u.origin)return json({error:'请求来源不匹配'},403);
    const configured=!!(env.NOTION_TOKEN&&env.NOTION_DATA_SOURCE_ID);
    if(!configured)throw new HttpError(503,'请配置 NOTION_TOKEN 和 NOTION_DATA_SOURCE_ID；无需访问口令');
    if(!/^[0-9a-f-]{32,36}$/i.test(env.NOTION_DATA_SOURCE_ID))throw new HttpError(503,'NOTION_DATA_SOURCE_ID 格式无效');
    const sources={text:env.NOTION_DATA_SOURCE_ID,screenshots:env.NOTION_SCREENSHOT_DATA_SOURCE_ID};
    if(u.pathname==='/api/sources'&&req.method==='GET')return json({sources:Object.entries(sources).map(([key,id])=>({key,configured:!!id,label:key==='text'?'文字知识库':'截图知识库',id:id||null}))});
    const selected=u.searchParams.get('source')||'text';
    if(!Object.hasOwn(sources,selected))throw new HttpError(400,'未知知识库');
    if(!sources[selected])throw new HttpError(503,'截图知识库尚未配置，请设置 NOTION_SCREENSHOT_DATA_SOURCE_ID');
    if(!/^[0-9a-f-]{32,36}$/i.test(sources[selected]))throw new HttpError(503,'所选知识库数据源 ID 格式无效');
    env={...env,NOTION_DATA_SOURCE_ID:sources[selected],NOTION_DATABASE_ID:selected==='screenshots'?env.NOTION_SCREENSHOT_DATABASE_ID:env.NOTION_DATABASE_ID};
    if(u.pathname==='/api/image'&&req.method==='GET')return await imageResponse(env,notion,u.searchParams);
    if(u.pathname==='/api/masks'){const data=req.method==='POST'?await body(req):Object.fromEntries(u.searchParams);if(!data||typeof data!=='object')throw new HttpError(400,'遮挡请求无效');await selectedImage(env,notion,data.id,data.field,data.image);return json(await maskStore(env,data,req.method==='POST'));}
    if(u.pathname==='/api/diagnostics'&&req.method==='GET')return json(await diagnostics(env));
    const source=env.NOTION_DATA_SOURCE_ID;
    if(u.pathname==='/api/status'&&req.method==='GET'){
      await notion(env,`/data_sources/${source}`);
      return json({version:VERSION,source:selected,sourceId:source,configured,notionConnected:true,loginRequired:false,originalContentReadOnly:true,learningShared:true,progressStorage:'notion',preferencesStorage:'cloudflare',preferencesConfigured:!!env.SHARED_PREFERENCES,reviewField:STATE_FIELD});
    }
    if(u.pathname==='/api/schema'&&req.method==='GET'){const s=await sourceSchema(env,notion);return json({properties:Object.entries(s.properties).filter(([n])=>![STATE_FIELD,LEGACY_FIELD].includes(n)).map(([name,p])=>({name,id:p.id,type:p.type,...(p.type==='formula'&&u.searchParams.get('definitions')==='1'?{formula:p.formula?.expression}:{}),options:p[p.type]?.options?.map(x=>x.name)||[]}))});}
    if(u.pathname==='/api/entries'&&req.method==='GET'){
      const cursor=u.searchParams.get('cursor');if(cursor&&cursor.length>1000)throw new HttpError(400,'无效分页参数');
      const r=await notion(env,`/data_sources/${source}/query`,'POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})});
      return json({entries:await Promise.all(r.results.map(async p=>({...serialize(p),source:selected,media:await mediaMetadata(p)}))),hasMore:r.has_more,cursor:r.next_cursor});
    }
    if(u.pathname==='/api/preferences')return json(await preferences(env,req.method==='POST'?await body(req):undefined));
    if(u.pathname==='/api/classify')throw new HttpError(403,'网页分类写入已禁用，请在 Notion 修改原字段');
    if(u.pathname==='/api/review'&&req.method==='POST')return json(await recordReview(env,notion,await body(req)));
    return json({error:'接口不存在'},404);
  }catch(e){const status=e.status||500;console.error(JSON.stringify({event:'api_error',path:u.pathname,status}));const message=e.status?e.message:'服务暂时不可用，请稍后重试';return json({error:u.pathname==='/api/status'?'Notion 连接失败：'+message:message},status);}
}};
