import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {DEFAULT_MAP} from '../public/core.js';

const SOURCE='2aaff02b-8ca6-41bc-9c61-fb482528ccf3',PAGE='11111111-1111-4111-8111-111111111111';
function fixture(){
  const types={usage:'select',priority:'select',formalScore:'number',frequencyScore:'number',classification:'select',mastery:'select',nextReview:'date',lastReviewed:'date',reviewCount:'number',interval:'number',lastResult:'select',streak:'number',errorCount:'number',eventId:'rich_text'};
  const properties=Object.fromEntries(Object.entries(types).map(([role,type])=>[DEFAULT_MAP[role],{id:role,name:DEFAULT_MAP[role],type,[type]:type==='select'?{options:[]}:{}}]));
  properties.German={id:'title',type:'title',title:{}};
  const page={id:PAGE,parent:{type:'data_source_id',data_source_id:SOURCE},properties:{LastReviewed:{type:'date',date:null},ReviewCount:{type:'number',number:0}}};
  const calls=[];let queryPage=0;
  const env={APP_PASSWORD:'test-only-passphrase',NOTION_TOKEN:'test-only-notion-token',NOTION_DATA_SOURCE_ID:SOURCE,FETCH:async(url,init)=>{
    const data=init.body?JSON.parse(init.body):null;calls.push({url,method:init.method,data});
    if(url.endsWith('/query')){queryPage++;return Response.json({results:[{...page,url:'https://www.notion.so/'+PAGE,last_edited_time:'2026-10-24',properties:{German:{type:'title',title:[{plain_text:'testen'}]}}}],has_more:queryPage===1,next_cursor:queryPage===1?'next-cursor':null});}
    if(url.includes('/data_sources/'))return Response.json({properties});
    if(init.method==='PATCH'){for(const [name,v]of Object.entries(data.properties)){const type=Object.keys(v)[0];page.properties[name]={type,...v};}return Response.json(page);}
    return Response.json(page);
  }};
  return {env,calls,page,properties};
}
async function request(env,path,body,cookie,origin='https://memory.example'){
  return worker.fetch(new Request('https://memory.example/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body!==undefined?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
}
async function login(env){const r=await request(env,'login',{password:env.APP_PASSWORD});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
test('未配置时关闭 API，不泄露密钥；登录前不返回笔记',async()=>{
  const {env,calls}=fixture();assert.equal((await request(env,'entries')).status,401);assert.equal(calls.length,0);
  assert.equal((await request({...env,NOTION_TOKEN:''},'entries')).status,503);
  const r=await request(env,'status'),raw=await r.text();assert.ok(!raw.includes(env.NOTION_TOKEN));assert.ok(!raw.includes(env.APP_PASSWORD));
});
test('登录口令、HttpOnly Cookie、防跨站写入及退出',async()=>{
  const {env}=fixture();assert.equal((await request(env,'login',{password:'wrong'})).status,401);
  const r=await request(env,'login',{password:env.APP_PASSWORD});assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await request(env,'schema',undefined,cookie)).status,200);
  assert.equal((await request(env,'setup',{},cookie,'https://evil.example')).status,403);
  assert.equal((await request(env,'schema',undefined,cookie+'tampered')).status,401);
  assert.match((await request(env,'logout',{},cookie)).headers.get('set-cookie'),/Max-Age=0/);
});
test('分页游标透传，字段值保持准确',async()=>{
  const {env,calls}=fixture(),cookie=await login(env);
  const p=await (await request(env,'entries',undefined,cookie)).json();assert.equal(p.hasMore,true);assert.equal(p.entries[0].props.German,'testen');
  await request(env,'entries?cursor=next-cursor',undefined,cookie);
  assert.equal(calls.at(-1).data.start_cursor,'next-cursor');
});
test('分类只修改明确选择的字段，并记录人工确认',async()=>{
  const {env,calls}=fixture(),cookie=await login(env);
  const r=await request(env,'classify',{id:PAGE,changes:{usage:'积极词汇',priority:'D',formalScore:5}},cookie);
  assert.equal(r.status,200);const patch=calls.find(c=>c.method==='PATCH');assert.deepEqual(Object.keys(patch.data.properties).sort(),['学习用途','Priority','书面程度评分','分类状态'].sort());
  assert.equal((await request(env,'classify',{id:PAGE,changes:{formalScore:0}},cookie)).status,400);
  assert.equal((await request(env,'classify',{id:PAGE,changes:{mastery:'Mastered'}},cookie)).status,400);
});
test('拒绝写到其他数据库、只读公式和重复映射',async()=>{
  const {env,page,properties}=fixture(),cookie=await login(env);page.parent.data_source_id=PAGE;
  assert.equal((await request(env,'classify',{id:PAGE,changes:{priority:'A'}},cookie)).status,403);
  page.parent.data_source_id=SOURCE;properties.Priority.type='formula';
  assert.equal((await request(env,'classify',{id:PAGE,changes:{priority:'A'}},cookie)).status,409);
  assert.equal((await request(env,'classify',{id:PAGE,changes:{priority:'A'},mapping:{usage:'Priority'}},cookie)).status,400);
});
test('复习成功回写；同一事件重试不重复计数；其他设备进度变更提示冲突',async()=>{
  const {env,calls}=fixture(),cookie=await login(env),data={id:PAGE,result:'good',eventId:'11111111-2222-4333-8444-555555555555',expectedLastReviewed:null};
  const r=await (await request(env,'review',data,cookie)).json();assert.equal(r.props.ReviewCount,1);assert.equal(r.props.Mastery,'Learning');
  const again=await (await request(env,'review',data,cookie)).json();assert.equal(again.duplicate,true);assert.equal(calls.filter(c=>c.method==='PATCH').length,1);
  assert.equal((await request(env,'review',{...data,eventId:'22222222-2222-4333-8444-555555555555'},cookie)).status,409);
});
test('初始化保留已有选项并补充 C/D；不批量修改记录值',async()=>{
  const {env,properties,calls}=fixture(),cookie=await login(env);properties.Priority.select.options=[{id:'old-a',name:'A',color:'red'},{id:'custom',name:'自定义',color:'blue'}];
  delete properties['学习用途'];const r=await request(env,'setup',{mapping:DEFAULT_MAP},cookie);assert.equal(r.status,200);
  const patch=calls.find(c=>c.method==='PATCH');assert.ok(patch.url.includes('/data_sources/'));
  assert.deepEqual(patch.data.properties.Priority.select.options.map(x=>x.name),['A','自定义','B','C','D']);
  assert.equal(patch.data.properties.Priority.select.options[0].id,'old-a');assert.equal(calls.some(c=>c.url.includes('/pages/')&&c.method==='PATCH'),false);
});
test('Notion 限流及上游错误不返回私有内容',async()=>{
  const {env}=fixture(),cookie=await login(env);env.FETCH=async()=>new Response('private note + token',{status:429});
  const r=await request(env,'entries',undefined,cookie);assert.equal(r.status,429);assert.ok(!(await r.text()).includes('private note'));
});
