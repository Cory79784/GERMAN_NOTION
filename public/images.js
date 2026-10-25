import {paintInk,imageQueue} from './ink.js';
export function initImageViewer({api,post,getEntry,getEntries,onClose,getField,getSource,toast,isDemo}){
 const $=id=>document.getElementById(id),dialog=$('image-dialog'),view=$('image-viewport'),img=$('study-image'),canvas=$('image-ink'),message=$('image-status');
 let queue=[],index=0,rects=[],strokes=[],version=0,loaded=false,ready=false,dirty=false,mode=null,stroke=null,seq=0,timer=null,saving=null,navigating=false,revision=0,conflict=false,source='text',field='截图';
 const item=()=>queue[index],data=()=>({id:item().entry.id,field,image:item().file.key});
 const draftKey=()=>'gm.inkDraft.'+source+'.'+data().id+'.'+field+'.'+data().image;
 const draft=()=>{try{localStorage.setItem(draftKey(),JSON.stringify({rects,strokes,version}));}catch{}};
 function controls(){
  $('image-prev').disabled=index<=0||navigating||!!stroke;$('image-next').disabled=index>=queue.length-1||navigating||!!stroke;
  for(const id of ['ink-pen','ink-erase','ink-clear'])$(id).disabled=!ready||!loaded||navigating;
  $('ink-pen').setAttribute('aria-pressed',String(mode==='pen'));$('ink-erase').setAttribute('aria-pressed',String(mode==='erase'));
  canvas.classList.toggle('active',!!mode);canvas.style.touchAction=mode?'none':'auto';
 }
 function draw(){paintInk(canvas.getContext('2d'),rects,stroke?[...strokes,stroke]:strokes,canvas.width,canvas.height);controls();}
 function mark(){dirty=true;revision++;draft();message.textContent='正在自动保存…';clearTimeout(timer);timer=setTimeout(()=>flush(),500);}
 async function flush(){
  clearTimeout(timer);if(stroke)finishStroke();if(saving){const ok=await saving;if(!ok)return false;}if(!dirty)return true;if(!ready)return false;
  if(isDemo()){dirty=false;message.textContent='示例涂画仅保留在本次页面';return true;}
  const token=seq,generation=revision,key=draftKey(),payload={...data(),rects:structuredClone(rects),strokes:structuredClone(strokes),expectedVersion:version};
  saving=(async()=>{try{
   const result=await post('masks',payload,source);if(token!==seq)return false;version=result.version;
   if(generation===revision){dirty=false;try{localStorage.removeItem(key);}catch{}message.textContent='已自动保存';}else draft();
   $('image-retry').hidden=true;return true;
  }catch(e){if(token===seq){message.textContent=e.message+'；涂画尚未同步，已暂存本机';conflict=/另一设备/.test(e.message);if(conflict)ready=false;$('image-retry').textContent=conflict?'重新载入':'重试保存';$('image-retry').hidden=false;}return false;}})();
  const ok=await saving;saving=null;if(ok&&dirty)return flush();return ok;
 }
 async function load(){
  const token=++seq;loaded=false;ready=false;dirty=false;conflict=false;rects=[];strokes=[];stroke=null;mode=null;revision=0;controls();draw();view.scrollTop=0;view.scrollLeft=0;$('image-retry').hidden=true;
  $('image-counter').textContent=`${index+1} / ${queue.length} · ${item().file.name}`;message.textContent='正在加载…';img.alt=item().file.name;img.src='/api/image?'+new URLSearchParams({...data(),source,reload:String(Date.now())});
  if(isDemo()){ready=true;message.textContent='示例模式';draw();return;}
  try{
   const result=await api('masks?'+new URLSearchParams(data()),{},source);if(token!==seq)return;rects=result.rects||[];strokes=result.strokes||[];version=result.version;ready=true;
   let cached;try{cached=JSON.parse(localStorage.getItem(draftKey()));}catch{}
   if(cached){rects=cached.rects||[];strokes=cached.strokes||[];dirty=true;revision++;if(cached.version===version){mark();}else{conflict=true;ready=false;message.textContent='另一设备已更新；本机涂画仍保留，重新载入前请确认';$('image-retry').hidden=false;$('image-retry').textContent='重新载入';}}
   else message.textContent='点击记号笔涂画；再点一次即可滚动图片。';draw();
  }catch(e){if(token===seq){message.textContent=e.message;$('image-retry').hidden=false;$('image-retry').textContent='重新载入';controls();}}
 }
 img.addEventListener('load',()=>{loaded=true;const width=Math.min(img.naturalWidth||1200,1200),ratio=(img.naturalHeight||width)/(img.naturalWidth||width),scale=Math.min(1,Math.sqrt(4000000/(width*width*ratio)),12000/(width*ratio));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(canvas.width*ratio));draw();});
 img.addEventListener('error',()=>{loaded=false;message.textContent='图片加载失败';$('image-retry').hidden=false;$('image-retry').textContent=dirty?'重试保存':'重新载入';controls();});
 async function open(id,position=0){
  if(navigating)return;const entry=getEntry(id);if(!entry)return;
  if(dialog.open&&!(await flush()))return;
  field=getField();source=getSource();queue=imageQueue(getEntries?getEntries():[entry],field);
  if(!queue.some(x=>x.entry.id===id))queue.unshift(...imageQueue([entry],field));
  const own=queue.map((x,i)=>({x,i})).filter(({x})=>x.entry.id===id);if(!own.length)return toast('此记录还没有截图');
  index=own[Math.min(position,own.length-1)].i;if(!dialog.open)dialog.showModal();await load();
 }
 async function move(delta){
  if(navigating||!queue[index+delta])return;navigating=true;controls();
  try{if(await flush()){index+=delta;await load();}}finally{navigating=false;controls();}
 }
 async function close(){if(navigating)return;navigating=true;controls();try{if(await flush()){seq++;dialog.close();onClose?.(item().entry.id);}}finally{navigating=false;controls();}}
 const point=e=>{const b=img.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1,(e.clientX-b.left)/b.width))*10000)/10000,Math.round(Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))*10000)/10000];};
 function finishStroke(){if(!stroke)return;strokes.push(stroke);stroke=null;mark();draw();}
 canvas.addEventListener('pointerdown',e=>{
  if(!mode||!loaded||!ready||navigating||e.isPrimary===false||e.button>0)return;
  if(strokes.length>=100||strokes.reduce((n,s)=>n+s.points.length,0)>=3000)return toast('涂画已达上限，请清空后继续');
  e.preventDefault();const width=Math.min(.5,Math.max(.001,Number($('ink-size').value)/img.getBoundingClientRect().width));
  stroke={tool:mode,color:$('ink-color').value,width:Math.round(width*10000)/10000,points:[point(e)]};canvas.setPointerCapture?.(e.pointerId);draw();
 });
 canvas.addEventListener('pointermove',e=>{if(!stroke)return;const p=point(e),last=stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<.002)return;if(stroke.points.length>=1000||strokes.reduce((n,s)=>n+s.points.length,0)+stroke.points.length>=3000)return;stroke.points.push(p);draw();});
 canvas.addEventListener('pointerup',finishStroke);canvas.addEventListener('pointercancel',finishStroke);
 $('ink-pen').onclick=()=>{mode=mode==='pen'?null:'pen';controls();};$('ink-erase').onclick=()=>{mode=mode==='erase'?null:'erase';controls();};
 $('ink-clear').onclick=()=>{if(!ready||navigating)return;stroke=null;rects=[];strokes=[];mark();draw();};
 $('image-prev').onclick=()=>move(-1);$('image-next').onclick=()=>move(1);$('image-close').onclick=()=>close();
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('image-retry').onclick=async()=>{if(navigating)return;if(conflict){if(!window.confirm('重新载入会放弃本机未同步的涂画，继续？'))return;try{localStorage.removeItem(draftKey());}catch{}dirty=false;await load();}else if(dirty)await flush();else await load();};
 return {open,canLeave:()=>!dialog.open||(!dirty&&!saving&&!stroke&&!navigating),close:()=>{seq++;clearTimeout(timer);dialog.close();},isBusy:()=>!!saving||navigating};
}
