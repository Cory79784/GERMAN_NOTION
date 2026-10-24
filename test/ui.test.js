import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

test('页面交互：筛选、主题列表、主动回忆、评分与自定义字段设置',async()=>{
  const window=new Window({url:'https://memory.example'});
  window.document.write(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
  const saved={};
  for(const name of ['window','document','localStorage','FormData']){saved[name]=globalThis[name];globalThis[name]=name==='window'?window:window[name];}
  saved.fetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({configured:false,authenticated:false});
  try{
    await import('../public/app.js?ui-test');
    await new Promise(r=>setTimeout(r,20));
    const $=id=>window.document.getElementById(id);
    const click=selector=>window.document.querySelector(selector).click();
    const change=el=>el.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(window.document.querySelector('input[type=password]'),null);
    click('#demo');assert.equal($('gate'),null);assert.equal(window.document.querySelectorAll('.entry').length,10);
    click('[data-quick="active"]');assert.equal(window.document.querySelectorAll('.entry').length,7);
    click('[data-quick="ab"]');assert.equal(window.document.querySelectorAll('.entry').length,7);
    click('#reset-filters');click('[data-quick="unclassified"]');assert.equal(window.document.querySelectorAll('.entry').length,1);assert.match($('content').textContent,/Einerseits/);
    click('#reset-filters');$('search').value='Lieferkette';$('search').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.document.querySelectorAll('.entry').length,1);
    click('[data-mode="cards"]');assert.match($('content').textContent,/供应链/);assert.ok(!window.document.querySelector('.card-answer'));
    click('#reveal');assert.match(window.document.querySelector('.card-answer').textContent,/Lieferkette/);click('[data-rate="good"]');assert.match($('content').textContent,/本轮复习完成/);
    click('#settings-open');assert.equal($('settings-dialog').open,true);assert.ok($('mapping-fields').querySelector('[name="map.topic"]'));assert.equal($('mapping-fields').querySelector('[name="map.lastReviewed"]'),null);
    const map=$('settings-form').querySelector('[name="map.german"]');assert.equal(map.value,'German');
        $('settings-dialog').close();click('[data-mode="browse"]');click('#reset-filters');
    assert.equal($('batch-dialog'),null);
    click('#filters-open');assert.equal($('filters').classList.contains('open'),true);click('#filters-close');assert.equal($('filters').classList.contains('open'),false);
  }finally{await window.happyDOM.abort();for(const [key,value]of Object.entries(saved))globalThis[key]=value;}
});
