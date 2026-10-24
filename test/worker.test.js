import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const SOURCE='2aaff02b-8ca6-41bc-9c61-fb482528ccf3';
function fixture(){
  const calls=[];let count=0;
  const env={NOTION_TOKEN:'test-only-token',NOTION_DATA_SOURCE_ID:SOURCE,ASSETS:{fetch:async()=>new Response('static page')},FETCH:async(url,init)=>{
    calls.push({url,method:init.method,data:init.body?JSON.parse(init.body):null});
    if(url.endsWith('/query')){count++;return Response.json({results:[{id:'entry',properties:{German:{type:'title',title:[{plain_text:'testen'}]}}}],has_more:count===1,next_cursor:count===1?'next-page':null});}
    return Response.json({properties:{German:{id:'title',type:'title',title:{}}}});
  }};
  return {env,calls};
}
const request=(env,path,method='GET')=>worker.fetch(new Request('https://memory.example'+path,{method}),env);
test('公开状态接口无密码依赖，有明确版本标记，不泄露密钥',async()=>{
  const {env}=fixture(),r=await request(env,'/api/status'),data=await r.json();
  assert.equal(data.version,'passwordless-v2');assert.equal(data.publicReadOnly,true);assert.equal(data.configured,true);assert.equal(data.progressStorage,'browser');
  assert.ok(!JSON.stringify(data).includes(env.NOTION_TOKEN));assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-app-version'),'passwordless-v2');
});
test('无登录可读取字段与完整分页条目，游标正确传递',async()=>{
  const {env,calls}=fixture();assert.equal((await request(env,'/api/schema')).status,200);
  const page=await (await request(env,'/api/entries')).json();assert.equal(page.entries[0].props.German,'testen');assert.equal(page.hasMore,true);
  await request(env,'/api/entries?cursor=next-page');assert.equal(calls.at(-1).data.start_cursor,'next-page');
  assert.ok(calls.every(c=>c.method==='GET'||(c.method==='POST'&&c.url.endsWith('/query'))));
});
test('所有写入接口关闭，包括旧浏览器缓存的登录、复习、分类和初始化接口',async()=>{
  const {env,calls}=fixture();
  for(const path of ['/api/login','/api/review','/api/classify','/api/setup','/api/logout','/api/entries']){
    for(const method of ['POST','PATCH','PUT','DELETE'])assert.equal((await request(env,path,method)).status,403);
  }
  assert.equal(calls.length,0);
});
test('缺少 token 时给出可操作的配置提示，状态接口仍可访问',async()=>{
  const {env}=fixture();delete env.NOTION_TOKEN;
  assert.equal((await request(env,'/api/status')).status,200);assert.equal((await request(env,'/api/status').then(r=>r.json())).configured,false);
  const r=await request(env,'/api/entries');assert.equal(r.status,503);assert.match((await r.json()).error,/NOTION_TOKEN/);
});
test('数据源配置错误、分页过长和未知接口均返回 JSON 错误',async()=>{
  const {env}=fixture();assert.equal((await request(env,'/api/entries?cursor='+'a'.repeat(1001))).status,400);
  assert.equal((await request(env,'/api/missing')).status,404);
  env.NOTION_DATA_SOURCE_ID='bad';assert.equal((await request(env,'/api/schema')).status,503);
});
test('Notion 限流和授权错误不返回笔记或密钥',async()=>{
  const {env}=fixture();
  for(const [upstream,status] of [[429,429],[401,502],[403,502]]){
    env.FETCH=async()=>new Response('private note + secret',{status:upstream});
    const r=await request(env,'/api/entries');assert.equal(r.status,status);assert.ok(!(await r.text()).includes('private note'));
  }
});
test('页面和静态资源正常转发到 ASSETS',async()=>{
  const {env}=fixture();assert.equal(await (await request(env,'/')).text(),'static page');assert.equal(await (await request(env,'/app.js')).text(),'static page');
});
