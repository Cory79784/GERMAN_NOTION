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
test('两个独立浏览器：无登录共享进度、分类、界面设置、常用筛选和续学位置',async()=>{
 const {env}=fixture();let b=await browser(env,'device-a');
 try{
  await b.wait(()=>b.$('total').textContent==='2');assert.equal(b.window.document.querySelector('input[type=password]'),null);assert.equal(b.$('gate'),null);assert.equal(b.$('app').hidden,false);
  b.click('[data-mode="cards"]');b.click('#reveal');b.click('[data-rate="good"]');await b.wait(()=>b.$('content').textContent.includes('2 / 2'));
  b.click('[data-mode="browse"]');b.click('#select-results');b.click('#batch-open');b.$('batch-form').elements.namedItem('priority').value='D';b.$('batch-form').dispatchEvent(new b.window.Event('submit',{bubbles:true,cancelable:true}));await b.wait(()=>b.$('batch-status').textContent.includes('全部完成'));b.$('batch-dialog').close();
  b.click('#settings-open');b.$('settings-form').elements.namedItem('front').value='german';b.$('settings-form').elements.namedItem('back').value='chinese';b.$('settings-form').dispatchEvent(new b.window.Event('submit',{bubbles:true,cancelable:true}));
  b.click('#save-filter');b.$('preset-form').elements.namedItem('name').value='跨设备筛选';b.$('preset-form').dispatchEvent(new b.window.Event('submit',{bubbles:true,cancelable:true}));
  b.click('[data-mode="cards"]');await b.wait(()=>b.$('cloud-save-status').textContent==='设置已云同步');
 }finally{await b.close();}
 b=await browser(env,'device-b');
 try{
  await b.wait(()=>b.$('total').textContent==='2');assert.match(b.$('content').textContent,/2 \/ 2/);assert.match(b.window.document.querySelector('.card-prompt').textContent,/einen Beitrag/);assert.match(b.$('filter-content').textContent,/跨设备筛选/);
  b.click('[data-mode="browse"]');assert.equal(b.window.document.querySelectorAll('.chip.gold').length,2);assert.match(b.$('content').textContent,/优先级 D/);assert.match(b.$('content').textContent,/Learning/);
  const first=b.window.document.querySelector('[data-id="'+ONE+'"]');assert.ok(first);assert.ok(b.window.localStorage.getItem('gm.localChanges')===null);
 }finally{await b.close();}
});
test('Hello world 返回明确部署提示，没有密码表单',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('Hello world')}};const b=await browser(env,'hello-error',true);
 try{await b.wait(()=>b.$('connection-message').textContent.includes('示例后端'));assert.equal(b.window.document.querySelector('input[type=password]'),null);assert.equal(b.$('gate'),null);assert.equal(b.$('app').hidden,false);}finally{await b.close();}
});
