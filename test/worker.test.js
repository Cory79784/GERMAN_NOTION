import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/worker.js';import {STATE_FIELD,LEGACY_FIELD,decode} from '../src/state.js';import {DEFAULT_MAP} from '../public/core.js';
import {fixture,request,ONE,TWO} from '../test-support/notion.js';
const reviewData={id:ONE,result:'good',eventId:'11111111-2222-4333-8444-555555555555',expectedLastReviewed:null};
const prefs={settings:{map:DEFAULT_MAP,front:'chinese',back:'german',display:['example','mnemonic']},filter:{rules:[{field:'Priority',op:'in',values:['A','B']}],logic:'and',search:'',sort:'priority',mode:'cards'},presets:[],resume:{mode:'cards',id:TWO}};
test('状态免登录，复习与设置位置明确，不泄露密钥',async()=>{const {env}=fixture();const r=await request(env,'status'),d=await r.json();assert.equal(d.version,'review-only-v4');assert.equal(d.reviewField,'学习记录');assert.equal(d.preferencesStorage,'cloudflare');assert.equal(d.loginRequired,false);assert.ok(!JSON.stringify(d).includes(env.NOTION_TOKEN));assert.equal(r.headers.get('cache-control'),'no-store');});
test('字段与分页读取，旧状态不能覆盖原分类，也不影响整页读取',async()=>{
 const {env,pages}=fixture();pages.get(ONE).properties[LEGACY_FIELD]={type:'rich_text',rich_text:[{text:{content:JSON.stringify({version:1,classification:{priority:'D'},review:{reviewCount:99}})}}]};
 const p=await(await request(env,'entries')).json();assert.equal(p.hasMore,true);assert.equal(p.entries[0].props.Priority,'A');assert.deepEqual(p.entries[0].learning,{});assert.equal(p.entries[0].legacyStatePresent,true);assert.ok(!Object.hasOwn(p.entries[0].props,LEGACY_FIELD));assert.equal((await(await request(env,'entries?cursor=page-2')).json()).entries[0].id,TWO);
});
test('只添加一列；评分与重试仅写学习记录，不改正文、分类或旧状态',async()=>{
 const {env,calls,pages,properties}=fixture(),original=structuredClone([...pages.values()]);
 const first=await(await request(env,'review',reviewData)).json();assert.equal(first.learning.reviewCount,1);assert.equal((await(await request(env,'review',reviewData)).json()).duplicate,true);
 assert.deepEqual(Object.keys(properties).filter(k=>!['German','Chinese','Priority'].includes(k)),[STATE_FIELD]);
 for(const c of calls.filter(c=>c.method==='PATCH')){assert.deepEqual(Object.keys(c.data),['properties']);assert.deepEqual(Object.keys(c.data.properties),[STATE_FIELD]);}
 for(const old of original)for(const [key,value]of Object.entries(old.properties))assert.deepEqual(pages.get(old.id).properties[key],value);
 assert.equal(calls.filter(c=>c.path.includes('/pages/')&&c.method==='PATCH').length,1);
 assert.equal(decode(pages.get(ONE)).lastResultLabel,'记住');
});
test('旧重试事件不会在后续复习后再次计数；过期设备收到冲突',async()=>{
 const {env,pages}=fixture();const a=await(await request(env,'review',reviewData)).json();
 const b={...reviewData,eventId:'22222222-2222-4333-8444-555555555555',expectedLastReviewed:a.learning.lastReviewed,result:'hard'};
 assert.equal((await request(env,'review',b)).status,200);assert.equal((await(await request(env,'review',reviewData)).json()).duplicate,true);assert.equal(decode(pages.get(ONE)).review.reviewCount,2);
 assert.equal((await request(env,'review',{...reviewData,eventId:'33333333-2222-4333-8444-555555555555'})).status,409);
});
test('Cloudflare 设置跨设备共享，不访问或写入 Notion，不创建列或笔记行',async()=>{
 const {env,calls}=fixture();assert.equal((await(await request(env,'preferences')).json()).preferences,null);
 assert.equal((await request(env,'preferences',prefs)).status,200);assert.deepEqual((await(await request({...env},'preferences')).json()).preferences,prefs);assert.deepEqual(calls,[]);
 delete env.SHARED_PREFERENCES;assert.equal((await request(env,'preferences',prefs)).status,503);assert.deepEqual(calls,[]);
});
test('拒绝分类、原字段写入、归档、外部记录、跨站与任意写接口',async()=>{
 const {env,pages,calls}=fixture();assert.equal((await request(env,'classify',{id:ONE,changes:{priority:'D'}})).status,403);
 for(const extra of [{properties:{German:{title:[]}}},{archived:true},{mapping:{german:STATE_FIELD}},{changes:{topic:'x'}}])assert.equal((await request(env,'review',{...reviewData,...extra})).status,400);
 assert.equal((await request(env,'review',reviewData,'https://evil.example')).status,403);
 pages.get(ONE).parent.data_source_id=TWO;assert.equal((await request(env,'review',reviewData)).status,403);
 for(const path of ['pages','delete','archive','setup','login'])assert.equal((await request(env,path,{})).status,404);
 assert.equal(calls.some(c=>c.method==='PATCH'),false);
});
test('坏学习记录不阻止原始笔记读取；写入失败不能覆盖坏状态',async()=>{
 const {env,pages,calls,properties}=fixture();properties[STATE_FIELD]={type:'rich_text',rich_text:{}};pages.get(ONE).properties[STATE_FIELD]={type:'rich_text',rich_text:[{text:{content:'invalid state'}}]};
 const p=await(await request(env,'entries')).json();assert.equal(p.entries[0].props.German,'sich erholen');assert.ok(p.entries[0].reviewError);
 assert.equal((await request(env,'review',reviewData)).status,409);assert.equal(calls.some(c=>c.method==='PATCH'),false);
 properties[STATE_FIELD]={type:'formula',formula:{}};pages.get(ONE).properties[STATE_FIELD]={type:'formula',formula:{type:'string',string:''}};
 assert.equal((await request(env,'schema')).status,200);assert.equal((await request(env,'review',reviewData)).status,409);
});
test('限流、缺配置、静态文件、非法方法与设置校验',async()=>{
 const {env}=fixture();assert.equal((await request(env,'preferences',{...prefs,settings:{...prefs.settings,front:'x'}})).status,400);
 assert.equal(await(await worker.fetch(new Request('https://memory.example/'),env)).text(),'static page');assert.equal((await worker.fetch(new Request('https://memory.example/api/review',{method:'DELETE'}),env)).status,405);
 assert.equal((await request(env,'entries?cursor='+'a'.repeat(1001))).status,400);
 delete env.NOTION_TOKEN;assert.equal((await request(env,'entries')).status,503);env.NOTION_TOKEN='test';env.FETCH=async()=>new Response('private content',{status:429});const r=await request(env,'entries');assert.equal(r.status,429);assert.ok(!(await r.text()).includes('private content'));
});
test('启动实际检查连接，诊断不把 404 武断归因于权限',async()=>{
 const {env}=fixture();env.FETCH=async(url)=>new URL(url).pathname.endsWith('/users/me')?Response.json({name:'German Memory',person:{email:'private@example.com'}}):Response.json({code:'object_not_found',message:'private details'},{status:404});
 const report=await(await request(env,'diagnostics')).json();assert.equal(report.connection.name,'German Memory');assert.equal(report.source.status,404);assert.match(report.conclusion,/尚不能区分/);assert.ok(!JSON.stringify(report).includes('private'));
 env.FETCH=async()=>new Response('private details',{status:401});assert.match((await(await request(env,'status')).json()).error,/密钥无效/);
 env.FETCH=async()=>{throw Error('network');};assert.match((await(await request(env,'status')).json()).error,/网络/);
});
