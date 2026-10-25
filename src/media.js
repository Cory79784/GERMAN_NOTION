import {HttpError,ownedPage} from './state.js';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function imageFiles(page,field){
 const p=page.properties?.[field];if(p?.type!=='files')return [];
 return Promise.all((p.files||[]).filter(f=>[f.name,f[f.type]?.url].some(v=>/\.(png|jpe?g|webp|gif|avif|heic|heif)(?:$|\?)/i.test(v||''))).map(async f=>{
  const url=f[f.type]?.url;let identity;try{const u=new URL(url);identity=f.type==='file'?u.origin+u.pathname:u.href;}catch{return null;}
  return {key:await digest(identity),name:f.name||'截图',url};
 })).then(files=>files.filter(Boolean));
}
export async function mediaMetadata(page){
 const out={};for(const [name,p]of Object.entries(page.properties||{}))if(p.type==='files')out[name]=(await imageFiles(page,name)).map(({key,name})=>({key,name}));return out;
}
export async function selectedImage(env,notion,id,field,key){
 if(typeof field!=='string'||field.length>150||!/^[a-f0-9]{64}$/.test(key||''))throw new HttpError(400,'图片参数无效');
 const page=await ownedPage(env,notion,id),file=(await imageFiles(page,field)).find(f=>f.key===key);
 if(!file)throw new HttpError(404,'图片已被移除或替换，请同步最新记录');return file;
}
export async function imageResponse(env,notion,params){
 const file=await selectedImage(env,notion,params.get('id'),params.get('field'),params.get('image'));
 const u=new URL(file.url);const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||!(/(^|\.)amazonaws\.com$|(^|\.)notion-static\.com$|(^|\.)notion\.so$|(^|\.)notionusercontent\.com$/.test(host)))throw new HttpError(403,'请使用上传到 Notion 的图片；不代理任意外部网址');
 let r;try{r=await(env.FETCH||fetch)(u.href,{redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(502,'图片下载超时，请重试');}
 if(!r.ok)throw new HttpError(502,'图片读取失败，请重试以重新获取 Notion 图片链接');
 const type=(r.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
 if(!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(type))throw new HttpError(415,'图片格式暂不支持，请在 Notion 上传 PNG、JPG 或 WebP');
 const max=10*1024*1024;if(Number(r.headers.get('Content-Length'))>max)throw new HttpError(413,'图片超过 10MB，请压缩后上传');
 const reader=r.body.getReader(),parts=[];let length=0;while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>max){await reader.cancel();throw new HttpError(413,'图片超过 10MB');}parts.push(chunk.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
