import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {demoData} from '../public/demo.js';

test('打开即学、复习和分类存本机、刷新同步不覆盖本机进度且不调用写入接口',async()=>{
  const window=new Window({url:'https://memory.example'}),saved={},calls=[];
  window.document.write(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
  for(const name of ['window','document','localStorage','FormData','setTimeout','clearTimeout']){saved[name]=globalThis[name];globalThis[name]=name==='window'?window:name.endsWith('Timeout')?window[name].bind(window):window[name];}
  const data=demoData();saved.fetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('status'))return Response.json({version:'passwordless-v2',configured:true,publicReadOnly:true});
    if(url.endsWith('schema'))return Response.json({properties:data.properties});
    return Response.json({entries:structuredClone(data.entries),hasMore:false,cursor:null});
  };
  try{
    await import('../public/app.js?passwordless-test');await new Promise(r=>setTimeout(r,30));
    const $=id=>window.document.getElementById(id),click=selector=>window.document.querySelector(selector).click();
    assert.equal($('gate').hidden,true);assert.equal($('app').hidden,false);assert.equal(window.document.querySelector('input[type=password]'),null);
    click('[data-mode="cards"]');click('#reveal');click('[data-rate="good"]');
    const changes=JSON.parse(window.localStorage.getItem('gm.localChanges'));const reviewedId=Object.keys(changes)[0];assert.equal(changes[reviewedId].ReviewCount,2);
    click('[data-mode="browse"]');click('#select-results');click('#batch-open');$('batch-form').elements.namedItem('priority').value='D';
    $('batch-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));$('batch-dialog').close();
    assert.ok(window.document.querySelectorAll('.chip.gold').length===10);assert.match($('content').textContent,/优先级 D/);
    click('#refresh');await new Promise(r=>setTimeout(r,25));assert.match($('content').textContent,/优先级 D/);
    assert.equal(JSON.parse(window.localStorage.getItem('gm.localChanges'))[reviewedId].ReviewCount,2);
    assert.ok(calls.every(c=>!c.init?.method||c.init.method==='GET'));
  }finally{await window.happyDOM.abort();for(const [key,value]of Object.entries(saved))globalThis[key]=value;}
});

test('Hello world 部署错误被翻译为具体提示，无密码表单',async()=>{
  const window=new Window({url:'https://memory.example'}),saved={};window.document.write(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
  for(const name of ['window','document','localStorage','FormData','setTimeout','clearTimeout']){saved[name]=globalThis[name];globalThis[name]=name==='window'?window:name.endsWith('Timeout')?window[name].bind(window):window[name];}
  saved.fetch=globalThis.fetch;globalThis.fetch=async()=>new Response('Hello world');
  try{
    await import('../public/app.js?deployment-error-test');await new Promise(r=>setTimeout(r,20));
    assert.match(window.document.getElementById('gate-status').textContent,/Hello world 示例后端/);assert.equal(window.document.querySelector('input[type=password]'),null);
  }finally{await window.happyDOM.abort();for(const [key,value]of Object.entries(saved))globalThis[key]=value;}
});
