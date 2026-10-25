import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,request,ONE,TWO,SOURCE} from '../test-support/notion.js';
import {imageFiles} from '../src/media.js';import {isNew,isTrouble,makeRound,roundSummary,normalizedRect} from '../public/core.js';
const SHOT='a104f734-ef60-4daf-896b-12c7d9c806bd';
const file=(signature='old')=>({name:'screenshot.png',type:'file',file:{url:'https://prod-files-secure.s3.us-west-2.amazonaws.com/workspace/stable-file/screenshot.png?signature='+signature,expiry_time:'2026-10-25T10:00:00Z'}});
function mediaFixture(){
 const f=fixture();f.properties['截图']={type:'files',files:{}};f.pages.get(ONE).properties.German.title=[];f.pages.get(ONE).properties.Chinese.rich_text=[];f.pages.get(ONE).properties['截图']={type:'files',files:[file()]};
 const original=f.env.FETCH;let downloads=0;
 f.env.FETCH=async(url,init)=>{if(new URL(url).hostname.endsWith('amazonaws.com')){assert.equal(init.headers?.Authorization,undefined);downloads++;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});}return original(url,init);};
 return {...f,downloads:()=>downloads};
}
test('图片记录不要求德语中文；签名刷新不改变图片身份，替换图片改变身份',async()=>{
 const {env,pages}=mediaFixture();const first=await(await request(env,'entries')).json(),e=first.entries[0];assert.equal(e.props.German,'');assert.equal(e.props.Chinese,'');assert.equal(e.media['截图'].length,1);assert.ok(!JSON.stringify(first).includes('signature='));
 const key=e.media['截图'][0].key;pages.get(ONE).properties['截图'].files=[file('new')];assert.equal((await imageFiles(pages.get(ONE),'截图'))[0].key,key);
 pages.get(ONE).properties['截图'].files[0].file.url=pages.get(ONE).properties['截图'].files[0].file.url.replace('stable-file','replaced-file');assert.notEqual((await imageFiles(pages.get(ONE),'截图'))[0].key,key);
});
test('图片按需下载，每次重新读取 Notion，过期链接更新；不代理任意网址或外部记录',async()=>{
 const f=mediaFixture(),{env,pages,calls}=f;const key=(await imageFiles(pages.get(ONE),'截图'))[0].key;assert.equal(f.downloads(),0);
 const path='image?'+new URLSearchParams({id:ONE,field:'截图',image:key});assert.equal((await request(env,path)).status,200);pages.get(ONE).properties['截图'].files=[file('fresh')];assert.equal((await request(env,path)).status,200);assert.equal(f.downloads(),2);assert.equal(calls.filter(c=>c.path.endsWith(ONE)).length,2);
 pages.get(ONE).parent.data_source_id=SHOT;assert.equal((await request(env,path)).status,403);pages.get(ONE).parent.data_source_id=SOURCE;
 pages.get(ONE).properties['截图'].files=[{name:'bad.png',type:'external',external:{url:'https://127.0.0.1/private.png'}}];const bad=(await imageFiles(pages.get(ONE),'截图'))[0].key;assert.equal((await request(env,'image?'+new URLSearchParams({id:ONE,field:'截图',image:bad}))).status,403);
 assert.equal((await request(env,path)).status,404);
});
test('遮挡只存 Cloudflare；坐标跨设备一致，版本冲突保留，越界拒绝',async()=>{
 const {env,pages,calls}=mediaFixture(),image=(await imageFiles(pages.get(ONE),'截图'))[0].key,base={id:ONE,field:'截图',image};
 const path='masks?'+new URLSearchParams(base);assert.deepEqual(await(await request(env,path)).json(),{rects:[],version:0});
 const rects=[{x:.1,y:.2,w:.3,h:.15},{x:.2,y:.7,w:.4,h:.1}];const saved=await(await request(env,'masks',{...base,rects,expectedVersion:0})).json();assert.equal(saved.version,1);
 assert.deepEqual((await(await request({...env},path)).json()).rects,rects);
 assert.equal((await request(env,'masks',{...base,rects:[],expectedVersion:0})).status,409);
 assert.equal((await request(env,'masks',{...base,rects:[{x:.9,y:0,w:.2,h:.1}],expectedVersion:1})).status,400);
 assert.equal(calls.some(c=>c.method==='PATCH'),false);
});
test('表格选择白名单与记录归属隔离，设置和遮挡不跨表混用',async()=>{
 const {env,pages}=mediaFixture();env.NOTION_SCREENSHOT_DATA_SOURCE_ID=SHOT;
 assert.equal((await request(env,'entries?source=arbitrary-id')).status,400);assert.equal((await request(env,'review?source=screenshots',{id:ONE,result:'good',eventId:'11111111-2222-4333-8444-555555555555'})).status,403);
 await request(env,'preferences',{presets:[{name:'文字表预设',rules:[],logic:'and',search:'',sort:'priority'}]});assert.equal((await(await request(env,'preferences?source=screenshots')).json()).preferences,null);
 const image=(await imageFiles(pages.get(ONE),'截图'))[0].key;assert.equal((await request(env,'masks?source=screenshots',{id:ONE,field:'截图',image,rects:[],expectedVersion:0})).status,403);
 delete env.NOTION_SCREENSHOT_DATA_SOURCE_ID;assert.equal((await request(env,'entries?source=screenshots')).status,503);
});
test('新内容不属于错误，随机抽取不重不漏，统计与比例坐标准确',()=>{
 assert.equal(isNew({learning:{}}),true);assert.equal(isTrouble({learning:{}}),false);assert.equal(isTrouble({learning:{reviewCount:1,lastResult:'Hesitant'}}),true);
 const entries=Array.from({length:50},(_,i)=>({id:String(i)}));assert.equal(makeRound(entries,10).length,10);const ids=makeRound(entries,20,'random',()=>.3);assert.equal(new Set(ids).size,20);assert.ok(ids.every(id=>entries.some(e=>e.id===id)));assert.throws(()=>makeRound(entries,201));
 assert.deepEqual(roundSummary({one:'again',two:'hard',three:'good'}),{again:1,hard:1,good:1});
 const rect=normalizedRect({x:.8,y:.9},{x:.2,y:.3});assert.ok(Math.abs(rect.x-.2)<1e-8);assert.ok(Math.abs(rect.w-.6)<1e-8);assert.equal(normalizedRect({x:-1,y:0},{x:2,y:1}).w,1);
});
test('记号笔与擦除参数校验，版本冲突保护，旧矩形保持兼容',async()=>{
 const {env,pages,calls}=mediaFixture(),image=(await imageFiles(pages.get(ONE),'截图'))[0].key,base={id:ONE,field:'截图',image};
 const strokes=[{tool:'pen',color:'#ff0000',width:.1,points:[[.25,.25],[.75,.5]]},{tool:'erase',color:'#202020',width:.05,points:[[.3,.3],[.4,.4]]}];
 assert.equal((await request(env,'masks',{...base,rects:[],strokes,expectedVersion:0})).status,200);
 const path='masks?'+new URLSearchParams(base);assert.deepEqual((await(await request(env,path)).json()).strokes,strokes);
 assert.equal((await request(env,'masks',{...base,rects:[],strokes:[],expectedVersion:0})).status,409);
 // A stale UI that only understands rectangles must not erase new brush strokes.
 await request(env,'masks',{...base,rects:[],expectedVersion:1});assert.deepEqual((await(await request(env,path)).json()).strokes,strokes);
 assert.equal((await request(env,'masks',{...base,rects:[],strokes:[{...strokes[0],points:[[2,0]]}],expectedVersion:2})).status,400);
 await request(env,'masks',{...base,rects:[],strokes:[],expectedVersion:2});assert.deepEqual((await(await request(env,path)).json()).strokes,[]);assert.equal(calls.some(c=>c.method==='PATCH'),false);
});
test('图片队列跨记录展开且保持筛选顺序；羽化与擦除使用正确合成方式',async()=>{
 const {imageQueue,paintInk}=await import('../public/ink.js');const entries=[{id:'a',media:{截图:[{key:'a1'},{key:'a2'}]}},{id:'b',media:{截图:[{key:'b1'}]}}];assert.deepEqual(imageQueue(entries,'截图').map(x=>[x.entry.id,x.file.key]),[['a','a1'],['a','a2'],['b','b1']]);
 const ops=[],ctx={clearRect(){},save(){},restore(){},fillRect(){},beginPath(){},arc(){},fill(){ops.push([this.globalCompositeOperation,this.shadowBlur]);},moveTo(){},lineTo(){},stroke(){ops.push([this.globalCompositeOperation,this.shadowBlur]);}};
 paintInk(ctx,[],[{tool:'pen',color:'#000000',width:.1,points:[[.1,.2],[.2,.3]]},{tool:'erase',color:'#000000',width:.1,points:[[.2,.2]]}],400,1600);assert.equal(ops[0][0],'source-over');assert.equal(ops[1][0],'destination-out');assert.ok(ops.every(x=>x[1]>0));
});
