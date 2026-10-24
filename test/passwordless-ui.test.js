import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Window} from 'happy-dom';
import worker from '../src/worker.js';import {fixture,ONE} from '../test-support/notion.js';
async function browser(env,suffix,hello=false){
 const window=new Window({url:'https://memory.example'}),saved={};window.document.write(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
 for(const name of ['window','document','localStorage','FormData','setTimeout','clearTimeout']){saved[name]=globalThis[name];globalThis[name]=name==='window'?window:name.endsWith('Timeout')?window[name].bind(window):window[name];}
 saved.fetch=globalThis.fetch;globalThis.fetch=async(url,init={})=>hello?new Response('Hello world'):worker.fetch(new Request('https://memory.example'+url,{...init,headers:{...init.headers,...(init.method==='POST'?{Origin:'https://memory.example'}:{})}}),env);
 await import('../public/app.js?'+suffix);
 const wait=async check=>{for(let i=0;i<200&&!check();i++)await new Promise(r=>setTimeout(r,25));assert.ok(check());};
 return {window,$:id=>window.document.getElementById(id),click:selector=>window.document.querySelector(selector).click(),wait,close:async()=>{await window.happyDOM.abort();for(const[k,v]of Object.entries(saved))globalThis[k]=v;}};
}
test('两个独立浏览器：无登录共享进度、界面设置、常用筛选和续学位置',async()=>{
 const {env}=fixture();let b=await browser(env,'device-a');
 try{
  await b.wait(()=>b.$('total').textContent==='2');assert.equal(b.window.document.querySelector('input[type=password]'),null);assert.equal(b.$('gate'),null);assert.equal(b.$('app').hidden,false);
  b.click('[data-mode="cards"]');b.click('#reveal');b.click('[data-rate="good"]');await b.wait(()=>b.$('content').textContent.includes('2 / 2'));
  b.click('[data-mode="browse"]');assert.equal(b.$('batch-dialog'),null);
  b.click('#settings-open');b.$('settings-form').elements.namedItem('front').value='german';b.$('settings-form').elements.namedItem('back').value='chinese';b.$('settings-form').dispatchEvent(new b.window.Event('submit',{bubbles:true,cancelable:true}));
  b.click('#save-filter');b.$('preset-form').elements.namedItem('name').value='跨设备筛选';b.$('preset-form').dispatchEvent(new b.window.Event('submit',{bubbles:true,cancelable:true}));
  b.click('[data-mode="cards"]');b.click('#skip');await b.wait(()=>b.$('cloud-save-status').textContent==='设置已云同步');
 }finally{await b.close();}
 b=await browser(env,'device-b');
 try{
  await b.wait(()=>b.$('total').textContent==='2');assert.match(b.$('content').textContent,/2 \/ 2/);assert.match(b.window.document.querySelector('.card-prompt').textContent,/einen Beitrag/);assert.match(b.$('filter-content').textContent,/跨设备筛选/);
  b.click('[data-mode="browse"]');assert.equal(b.window.document.querySelectorAll('.chip.gold').length,2);assert.match(b.$('content').textContent,/优先级 A/);assert.match(b.$('content').textContent,/Learning/);
  const first=b.window.document.querySelector('[data-id="'+ONE+'"]');assert.ok(first);assert.ok(b.window.localStorage.getItem('gm.localChanges')===null);
 }finally{await b.close();}
});
test('Hello world 返回明确部署提示，没有密码表单',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('Hello world')}};const b=await browser(env,'hello-error',true);
 try{await b.wait(()=>b.$('connection-message').textContent.includes('示例后端'));assert.equal(b.window.document.querySelector('input[type=password]'),null);assert.equal(b.$('gate'),null);assert.equal(b.$('app').hidden,false);}finally{await b.close();}
});
test('Notion 无法连接时保持学习界面可见，显示具体错误，不返回主页',async()=>{const {env}=fixture();env.FETCH=async()=>new Response('private details',{status:401});const b=await browser(env,'notion-connection-failed');try{await b.wait(()=>b.$('connection-message').textContent.includes('密钥无效'));assert.equal(b.$('app').hidden,false);assert.equal(b.$('gate'),null);assert.equal(b.window.document.querySelector('input[type=password]'),null);assert.match(b.$('content').textContent,/学习内容加载失败/);assert.match(b.$('content').textContent,/Notion 连接失败/);}finally{await b.close();}});

test('公式主题与多选主题来自完整分页；A–D 独立入口；单卡完成保留所有选项和笔记',async()=>{
 const {env,properties,pages}=fixture();properties['学习主题']={type:'formula',formula:{}};properties['标签']={type:'multi_select',multi_select:{options:[{name:'标签不能混入主题'}]}};
 pages.get(ONE).properties['学习主题']={type:'formula',formula:{type:'string',string:'学业资金'}};
 pages.get('22222222-2222-4222-8222-222222222222').properties['学习主题']={type:'formula',formula:{type:'string',string:'公共健康'}};
 const b=await browser(env,'facets-single-card');try{
  await b.wait(()=>b.$('total').textContent==='2');
  const topics=()=>[...b.window.document.querySelectorAll('[data-facet="学习主题"]')].map(e=>e.dataset.choice);
  assert.deepEqual(new Set(topics()),new Set(['__empty__','学业资金','公共健康']));assert.ok(!topics().includes('标签不能混入主题'));
  for(const v of ['A','B','C','D'])assert.ok(b.window.document.querySelector('[data-facet="Priority"][data-choice="'+v+'"]'));
  const before=topics();b.click('[data-learn="'+ONE+'"]');b.click('#reveal');b.click('[data-rate="good"]');await b.wait(()=>b.$('content').textContent.includes('本轮复习完成'));
  assert.equal(b.$('total').textContent,'2');assert.deepEqual(topics(),before);
  b.click('#content [data-mode="browse"]');assert.equal(b.window.document.querySelectorAll('.entry').length,2);
  const choice=b.window.document.querySelector('[data-facet="学习主题"][data-choice="公共健康"]');choice.checked=true;choice.dispatchEvent(new b.window.Event('change',{bubbles:true}));assert.equal(b.window.document.querySelectorAll('.entry').length,1);assert.deepEqual(topics(),before);
  b.click('#reset-filters');properties['学习主题']={type:'multi_select',multi_select:{options:[]}};pages.get(ONE).properties['学习主题']={type:'multi_select',multi_select:[{name:'运输'},{name:'供应链'}]};
  b.click('#refresh');await b.wait(()=>topics().includes('供应链'));assert.ok(topics().includes('运输'));assert.ok(!topics().includes('运输 · 供应链'));
 }finally{await b.close();}
});
test('保存失败保留当前卡片，重试成功只计一次；刷新与另一设备保持完成状态',async()=>{
 const {env,pages}=fixture(),originalFetch=env.FETCH;let fail=true;
 env.FETCH=async(url,init)=>fail&&init.method==='PATCH'&&new URL(url).pathname.includes('/pages/')?new Response('private',{status:503}):originalFetch(url,init);
 let b=await browser(env,'failed-review');try{
  await b.wait(()=>b.$('total').textContent==='2');b.click('[data-learn="'+ONE+'"]');b.click('#reveal');b.click('[data-rate="good"]');await b.wait(()=>b.$('toast').textContent.includes('可重试'));
  assert.ok(b.window.document.querySelector('.card'));assert.equal(b.$('total').textContent,'2');fail=false;b.click('#retry-review');await b.wait(()=>b.$('content').textContent.includes('本轮复习完成'));await b.wait(()=>b.$('cloud-save-status').textContent==='设置已云同步');
 }finally{await b.close();}
 b=await browser(env,'completed-other-device');try{await b.wait(()=>b.$('total').textContent==='2');assert.match(b.$('content').textContent,/本轮复习完成/);b.click('#content [data-mode="browse"]');assert.equal(b.window.document.querySelectorAll('.entry').length,2);assert.match(b.$('content').textContent,/Learning/);}finally{await b.close();}
});
test('分页中途失败保留完整旧数据；重复游标明确报错不清空',async()=>{
 const {env}=fixture(),original=env.FETCH;const b=await browser(env,'pagination-failure');try{
  await b.wait(()=>b.$('total').textContent==='2');
  env.FETCH=async(url,init)=>init.body&&JSON.parse(init.body).start_cursor?new Response('private',{status:503}):original(url,init);
  b.click('#refresh');await b.wait(()=>b.$('sync-status').textContent==='同步失败');assert.equal(b.$('total').textContent,'2');assert.equal(b.window.document.querySelectorAll('.entry').length,2);
  env.FETCH=async(url,init)=>{if(url.endsWith('/query')){const r=await original(url,init),d=await r.json();d.has_more=true;d.next_cursor='loop';return Response.json(d);}return original(url,init);};
  b.click('#refresh');await b.wait(()=>b.$('connection-message').textContent.includes('重复'));assert.equal(b.$('total').textContent,'2');
 }finally{await b.close();}
});

test('Cloudflare 设置故障不阻止读取 Notion 全部内容',async()=>{
 const {env}=fixture();delete env.SHARED_PREFERENCES;const b=await browser(env,'settings-offline');try{
  await b.wait(()=>b.$('total').textContent==='2');assert.equal(b.window.document.querySelectorAll('.entry').length,2);assert.match(b.$('data-notice').textContent,/设置云同步暂不可用/);assert.equal(b.$('connection-notice').hidden,true);
 }finally{await b.close();}
});
