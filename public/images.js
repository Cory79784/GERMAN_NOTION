import {normalizedRect} from './core.js';
export function initImageViewer({api,post,getEntry,getField,getSource,toast,isDemo}){
 const dialog=document.getElementById('image-dialog'),view=document.getElementById('image-viewport'),stage=document.getElementById('image-stage'),img=document.getElementById('study-image'),overlay=document.getElementById('image-overlay'),message=document.getElementById('image-status');
 let entry=null,files=[],index=0,rects=[],version=0,loaded=false,ready=false,dirty=false,editing=false,reading=true,revealed=new Set(),start=null,drag=null,seq=0,zoom=1,busy=false,imageError=false,source='text',field='截图';
 const button=id=>document.getElementById(id);
 const current=()=>files[index];
 const data=()=>({id:entry.id,field,image:current().key});
 const controls=()=>{button('mask-save').disabled=!ready||busy;button('mask-edit').disabled=!ready||!loaded||busy;button('image-prev').disabled=index===0||busy;button('image-next').disabled=index===files.length-1||busy;button('mask-mode').textContent=reading?'切换为遮挡回忆':'切换为直接阅读';button('mask-edit').textContent=editing?'结束绘制':'绘制遮挡';};
 function draw(){
  overlay.replaceChildren();overlay.classList.toggle('drawing',editing);
  for(const [i,r]of rects.entries()){
   const b=document.createElement('button');b.type='button';b.className='image-mask'+(revealed.has(i)?' revealed':'');b.setAttribute('aria-label',revealed.has(i)?'重新遮住答案':'揭开答案');b.textContent=revealed.has(i)?'':'点击揭开';
   Object.assign(b.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});b.hidden=reading&&!editing;
   b.onclick=()=>{if(editing)return;revealed.has(i)?revealed.delete(i):revealed.add(i);draw();};overlay.append(b);
  }
  controls();
 }
 function abandon(){return !dirty||window.confirm('遮挡尚未保存，确定放弃这次编辑？');}
 async function load(){
  const token=++seq;loaded=false;imageError=false;ready=false;dirty=false;editing=false;rects=[];revealed.clear();zoom=1;stage.style.width='100%';button('image-zoom').value='1';draw();
  message.textContent='正在读取图片与遮挡…';button('image-counter').textContent=`${index+1} / ${files.length} · ${current().name}`;
  img.alt=current().name;img.src='/api/image?'+new URLSearchParams({...data(),source,reload:String(Date.now())});
  if(isDemo()){ready=true;message.textContent='示例图片不保存到云端';draw();return;}
  try{const result=await api('masks?'+new URLSearchParams(data()),{},source);if(token!==seq)return;rects=result.rects;version=result.version;ready=true;message.textContent=imageError?'图片加载失败，请重新加载图片。':rects.length?'已有遮挡；切换到回忆模式可练习':'暂无遮挡，可以直接阅读，也可绘制答案遮挡';draw();}
  catch(e){if(token===seq){message.textContent=e.message+'；可继续看图，重新加载后再编辑';controls();}}
 }
 img.addEventListener('load',()=>{loaded=true;imageError=false;controls();});
 img.addEventListener('error',()=>{loaded=false;imageError=true;message.textContent='图片加载失败，点击“重新加载图片”获取新链接。HEIC 请转为 JPG／PNG。';controls();});
 async function open(id,position=0){if(busy)return;const e=getEntry(id);if(!e)return;const list=e.media?.[getField()]||[];if(!list.length)return toast('这条记录还没有截图，请在 Notion 的截图列上传');if(dialog.open&&!abandon())return;entry=e;files=list;index=Math.min(position,list.length-1);source=getSource();field=getField();reading=true;if(!dialog.open)dialog.showModal();await load();}
 const point=e=>{const box=img.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))};};
 overlay.addEventListener('pointerdown',e=>{
  if(!editing||!loaded||!ready||busy||e.isPrimary===false||e.button>0)return;
  e.preventDefault();start=point(e);drag=document.createElement('div');drag.className='image-mask drawing-preview';overlay.append(drag);overlay.setPointerCapture?.(e.pointerId);
 });
 overlay.addEventListener('pointermove',e=>{if(!start||!drag)return;const r=normalizedRect(start,point(e));Object.assign(drag.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});});
 overlay.addEventListener('pointerup',e=>{if(!start)return;const r=normalizedRect(start,point(e));start=null;drag=null;if(r.w>=.005&&r.h>=.005){if(rects.length>=40)toast('每张图片最多 40 个遮挡');else{rects.push(r);dirty=true;}}draw();});
 overlay.addEventListener('pointercancel',()=>{start=null;drag=null;draw();});
 button('image-close').onclick=()=>{if(!busy&&abandon()){seq++;dialog.close();}};
 dialog.addEventListener('close',()=>{if(document.fullscreenElement===dialog)document.exitFullscreen?.().catch(()=>{});});
 dialog.addEventListener('cancel',e=>{if(busy||!abandon())e.preventDefault();else seq++;});
 button('image-prev').onclick=async()=>{if(index>0&&abandon()){index--;await load();}};
 button('image-next').onclick=async()=>{if(index<files.length-1&&abandon()){index++;await load();}};
 button('image-retry').onclick=async()=>{if(!busy&&abandon())await load();};
 button('mask-mode').onclick=()=>{reading=!reading;editing=false;revealed.clear();draw();};
 button('mask-edit').onclick=()=>{editing=!editing;reading=false;draw();message.textContent=editing?'在图片上拖动绘制；结束后点“保存遮挡”。绘制时暂停图片滚动。':'点击遮挡可揭开答案。';};
 button('mask-undo').onclick=()=>{if(!ready||busy)return;rects.pop();dirty=true;draw();};
 button('mask-clear').onclick=()=>{if(!ready||busy)return;rects=[];dirty=true;revealed.clear();draw();};
 button('mask-save').onclick=async()=>{
  if(!ready||busy)return;if(isDemo()){dirty=false;return toast('示例遮挡仅供体验');}
  busy=true;controls();try{const result=await post('masks',{...data(),rects,expectedVersion:version},source);version=result.version;rects=result.rects;dirty=false;editing=false;message.textContent='遮挡已保存到 Cloudflare，可跨设备读取';draw();}catch(e){message.textContent=e.message+'；当前编辑尚未保存，请勿关闭';}finally{busy=false;controls();}
 };
 button('image-zoom').oninput=e=>{zoom=Number(e.target.value);stage.style.width=zoom*100+'%';};
 button('image-fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await dialog.requestFullscreen?.();else await document.exitFullscreen?.();}catch{toast('已使用全屏图片窗口；也可双指缩放');}};
 return {open,canLeave:()=>!dialog.open||(!busy&&abandon()),close:()=>{seq++;dialog.close();},isBusy:()=>busy};
}
