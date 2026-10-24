import { DEFAULT_MAP, LABELS, EMPTY, text, values, matches, due, field, review, REVIEW_MAP, REVIEW_ROLES } from './core.js';
import { demoData } from './demo.js';

const $ = id=>document.getElementById(id);
const escape = x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('gm.'+key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem('gm.'+key,JSON.stringify(value));return true;}catch{toast('浏览器无法暂存设置，请确认云同步成功后再关闭页面');return false;}};
const initialSettings={map:{...DEFAULT_MAP},front:'chinese',back:'german',display:['example','germanContext','chineseContext','grammar','explanation','family','mnemonic','insight','error','correction','formality','frequency','spoken']};
const settings={...initialSettings,...read('settings',{}),map:{...DEFAULT_MAP,...read('settings',{}).map}};
const s={connectionError:'',cloudReady:false,sharedDirty:false,prefGeneration:0,prefTimer:null,writeChain:Promise.resolve(),pendingReview:read('cloudReview',null),entries:[],properties:[],settings,rules:read('rules',[]),logic:read('logic','and'),search:read('search',''),mode:read('mode','browse'),sort:read('sort','priority'),presets:read('presets',[]),session:[],index:0,revealed:false,limit:40,demo:false,loading:false,busy:false};
let toastTimer;
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
async function api(path,options={}) {
  const r=await fetch('/api/'+path,{...options,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',...options.headers}});
  const raw=await r.text();let data;
  try{data=JSON.parse(raw);}catch{
    throw new Error(raw.trim()==='Hello world'?'线上仍在运行 Hello world 示例后端，请检查 Cloudflare 的构建命令和 src/worker.js 入口':'后端返回了非 JSON 内容，请检查 Cloudflare 部署日志');
  }
  if(!r.ok)throw new Error(data.error||'连接失败');
  return data;
}
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)});
function cloudPost(path,data){const task=s.writeChain.catch(()=>{}).then(()=>post(path,data));s.writeChain=task;return task;}
function applyLearning(e,learning){
  e.learning=Object.fromEntries(Object.entries({...e.learning,...learning}).filter(([k])=>REVIEW_ROLES.includes(k)));
  e.props={...(e.rawProps||e.props),...Object.fromEntries(Object.entries(e.learning).filter(([k])=>mapping()[k]).map(([k,v])=>[mapping()[k],v]))};
}
function sharedPayload(){return {settings:s.settings,presets:s.presets,filter:{rules:s.rules,logic:s.logic,search:s.search,sort:s.sort,mode:s.mode},...(read('resume',null)?{resume:read('resume',null)}:{})};}
function applyPreferences(p){
  if(!p)return;
  resetSession();
  if(p.settings)s.settings={...initialSettings,...p.settings,map:{...DEFAULT_MAP,...p.settings.map}};
  if(p.presets)s.presets=p.presets;
  if(p.filter){Object.assign(s,p.filter);persistFilters(false);}
  save('resume',p.resume||null);
  save('settings',s.settings);save('presets',s.presets);
  $('search').value=s.search;$('sort').value=s.sort;
}
function sharedChanged(){
  if(s.demo||!s.cloudReady)return;
  s.sharedDirty=true;s.prefGeneration++;save('sharedDraft',sharedPayload());
  $('cloud-save-status').textContent='设置待同步';
  clearTimeout(s.prefTimer);s.prefTimer=setTimeout(flushPreferences,700);
}
async function flushPreferences(){
  if(s.demo||!s.cloudReady||!s.sharedDirty)return;
  clearTimeout(s.prefTimer);
  const generation=s.prefGeneration,payload=sharedPayload();
  try{
    await cloudPost('preferences',payload);
    if(generation===s.prefGeneration){s.sharedDirty=false;save('sharedDraft',null);$('cloud-save-status').textContent='设置已云同步';}
  }catch(e){$('cloud-save-status').textContent='设置尚未云同步';toast(e.message+'；设置已暂存在本机，点击同步可重试');}
}
function persistFilters(shared=true){save('rules',s.rules);save('logic',s.logic);save('search',s.search);save('mode',s.mode);save('sort',s.sort);if(shared)sharedChanged();}
function saveResume(value){const old=read('resume',null);save('resume',value);if(JSON.stringify(old)!==JSON.stringify(value))sharedChanged();}
function mapping(){return {...s.settings.map,...REVIEW_MAP};}
function val(e,role){return field(e,role,mapping());}
function chips(e){return ['topic','subtopic','usage','priority','mastery'].map(k=>val(e,k)?`<span class="chip ${k==='priority'?'gold':''}">${escape(k==='priority'?'优先级 '+val(e,k):val(e,k))}</span>`:'').join('');}
function filtered(){
  return s.entries.filter(e=>matches(e,s.rules,s.logic,s.search)&&(s.mode!=='due'||due(e,mapping())))
    .sort((a,b)=>s.sort==='german'?text(val(a,'german')).localeCompare(text(val(b,'german')),'de'):s.sort==='updated'?text(b.edited).localeCompare(text(a.edited)):s.sort==='due'?text(val(a,'nextReview')||'9999').localeCompare(text(val(b,'nextReview')||'9999')):text(val(a,'priority')||'Z').localeCompare(text(val(b,'priority')||'Z')));
}
function detailHTML(e){
  const shown=new Set();
  return s.settings.display.map(role=>{
    const content=text(val(e,role));if(!content||shown.has(content))return '';shown.add(content);
    return `<section class="detail-block ${escape(role)}"><h4>${escape(LABELS[role]||role)}</h4><p>${escape(content)}</p></section>`;
  }).join('');
}
function empty(title,description){return `<div class="empty"><div class="symbol">W.</div><h2>${escape(title)}</h2><p>${escape(description)}</p></div>`;}
function render(){
  const found=filtered();
  $('total').textContent=s.entries.length;$('due-count').textContent=s.entries.filter(e=>due(e,mapping())).length;
  $('result-count').textContent=`${s.loading?'正在读取 · ':''}筛选出 ${found.length} / ${s.entries.length} 条`;
  $('rule-count').textContent=s.rules.length;
  $('pending-banner').hidden=!s.pendingReview||s.demo;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===s.mode));
  if(!s.demo&&!s.entries.length&&(s.connectionError||s.checking)){
    $('content').innerHTML=s.connectionError?empty('学习内容加载失败',s.connectionError):'<p class="loading">正在检查 Notion 连接…</p>';return;
  }
  if(s.mode==='browse'){
    $('content').innerHTML=found.length?found.slice(0,s.limit).map(e=>`<article class="entry" data-id="${escape(e.id)}"><div class="entry-top"><div>${chips(e)}</div></div><h2>${escape(val(e,'german')||'（德语字段为空）')}</h2><p class="translation">${escape(val(e,'chinese')||'（暂无中文）')}</p><details><summary>展开语境、例句与记忆点</summary>${detailHTML(e)||'<p class="muted">暂无辅助内容，可在 Notion 中补充。</p>'}</details><div class="entry-bottom"><button data-speak="${escape(e.id)}">▷ 德语朗读</button><button data-learn="${escape(e.id)}">练这张卡片 →</button>${safeLink(e.url)}</div></article>`).join('')+(found.length>s.limit?'<button id="load-more" class="load-more">显示更多条目</button>':''):empty(s.loading?'正在读取 Notion…':'没有匹配的条目',s.mode==='due'?'暂时没有到期卡片。':'可减少筛选条件，或检查字段映射。');
  }else renderCard(found);
}
function safeLink(url){try{const u=new URL(url);if(u.protocol==='https:'&&(u.hostname==='www.notion.so'||u.hostname==='app.notion.com'||u.hostname.endsWith('.notion.site')))return `<a href="${escape(u.href)}" target="_blank" rel="noreferrer noopener">查看原笔记 ↗</a>`;}catch{}return '';}
function resetSession(){s.session=[];s.index=0;s.revealed=false;}
function renderCard(found){
  if(!s.session.length){
    s.session=found.map(e=>e.id);
    const resume=read('resume',null);
    if(resume?.mode===s.mode&&resume.completed)s.index=s.session.length;else if(resume?.mode===s.mode&&s.session.includes(resume.id))s.index=s.session.indexOf(resume.id);else s.index=0;
  }
  const e=s.entries.find(e=>e.id===s.session[s.index]);
  if(!e){$('content').innerHTML=empty(s.session.length?'本轮复习完成':'没有可学习的卡片',s.session.length?'本轮卡片已完成，原始内容仍在。可返回全部内容或重新开始。':s.mode==='due'?'没有到期复习。新内容可以在「记忆卡片」中开始学习。':'调整筛选，选出你现在想记住的内容。')+'<button data-mode="browse" class="reveal">返回全部内容（保留筛选）</button><button id="restart" class="reveal primary">重新开始当前筛选结果</button>';return;}
  saveResume({mode:s.mode,id:e.id});
  const front=val(e,s.settings.front),back=val(e,s.settings.back);
  $('content').innerHTML=`<div class="card-shell"><div class="card-meta"><span>${s.mode==='due'?'到期复习':'主动回忆'} · ${s.index+1} / ${s.session.length}</span><button id="reverse" class="quiet">⇄ 切换方向</button></div><article class="card" data-id="${escape(e.id)}"><div>${chips(e)}</div><p class="eyebrow spaced">${s.settings.front==='chinese'?'看到中文，试着说出德语':'看到德语，回忆含义'}</p><div class="card-prompt">${escape(front||'此字段为空，请在设置中更换卡片正面')}</div>${s.revealed?`<div class="card-answer">${escape(back||'此字段为空')}</div><button data-speak="${escape(e.id)}" class="quiet spaced">▷ 德语朗读</button>${detailHTML(e)}<div class="card-actions"><button data-rate="again">不记得<small>10 分钟后再见</small></button><button data-rate="hard">模糊<small>明天再复习</small></button><button data-rate="good" class="primary">记住了<small>逐步延长间隔</small></button></div>`:'<button id="reveal" class="reveal primary">想好了吗？查看答案</button>'}</article><div class="card-meta spaced"><button id="previous" class="quiet" ${s.index===0?'disabled':''}>← 上一张</button><span>${s.demo?'演示进度':'仅学习记录列保存复习 · 跨设备共享'}</span><button id="skip" class="quiet">跳过 →</button></div></div>`;
  if(s.busy)document.querySelectorAll('[data-rate]').forEach(b=>b.disabled=true);
}
function renderFilters(){
  const opened=[...document.querySelectorAll('.facet[open]')].map(e=>e.dataset.role);
  const all=s.properties.map(p=>p.name);
  // Original Notion fields and separate, read-only review projections.
  const names=[...new Set([...all,...Object.values(REVIEW_MAP),...s.rules.map(r=>r.field)])];
  $('filter-content').innerHTML=facetHTML()+`<div class="filter-controls"><select id="logic" aria-label="条件组合方式"><option value="and" ${s.logic==='and'?'selected':''}>同时满足（AND）</option><option value="or" ${s.logic==='or'?'selected':''}>满足任意（OR）</option></select><button id="reset-filters" class="quiet">清空</button></div>${s.rules.map((r,i)=>`<div class="rule" data-rule="${i}"><div class="rule-header"><select data-rule-field aria-label="筛选字段">${names.map(n=>`<option value="${escape(n)}" ${n===r.field?'selected':''}>${escape(n)}${all.includes(n)?'':'（网页复习状态）'}</option>`).join('')}</select><button data-remove-rule="${i}" aria-label="删除条件">×</button></div><select data-rule-op aria-label="筛选方式">${[['in','多选匹配'],['contains','包含文字'],['range','数字范围'],['empty','未分类／未评分（空）'],['notempty','已填写']].map(([v,l])=>`<option value="${v}" ${r.op===v?'selected':''}>${l}</option>`).join('')}</select>${ruleValueHTML(r,i)}</div>`).join('')}<button id="add-rule" class="filter-action">＋ 添加筛选条件</button><p class="rating-help">评分范围仅匹配明确的数字。原文含星级或说明文字时，可按原文多选筛选，或手动补充数字评分。</p><div class="preset-list"><h3>常用筛选</h3>${s.presets.length?s.presets.map((p,i)=>`<div class="preset-item"><button data-preset="${i}">${escape(p.name)}</button><button data-delete-preset="${i}" aria-label="删除此筛选">×</button></div>`).join(''):'<p class="muted small">保存一组筛选，下次一键进入。</p>'}</div>`;
  if(opened.length)document.querySelectorAll('.facet').forEach(e=>e.open=opened.includes(e.dataset.role));
  $('quick-filters').innerHTML='<button data-quick="active">积极词汇</button><button data-quick="passive">消极词汇</button><button data-quick="ab">优先级 A / B</button><button data-quick="unclassified">尚未分类</button>';
}
function filterOptions(name,declared=[],selected=[]){
  return [...new Set([EMPTY,...declared,...s.entries.flatMap(e=>values(e.props[name])),...selected])].sort((a,b)=>a===EMPTY?-1:b===EMPTY?1:a.localeCompare(b,'zh'));
}
function facetHTML(){
  return ['topic','topicGroup','priority','usage','formality','frequency','formalScore','frequencyScore'].map(role=>{
    const name=mapping()[role],prop=s.properties.find(p=>p.name===name),rule=s.rules.find(r=>r.field===name&&r.op==='in');
    const declared=role==='priority'?['A','B','C','D']:prop?.options||[];
    const options=filterOptions(name,declared,rule?.values||[]);
    const choices=options.map(v=>`<label><input type="checkbox" data-facet="${escape(name)}" data-choice="${escape(v)}" ${rule?.values?.includes(v)?'checked':''}>${escape(v===EMPTY?'未分类':v)} <span class="muted">${s.entries.filter(e=>values(e.props[name]).includes(v)).length}</span></label>`).join('');
    const warning=!prop?'Notion 未配置此字段；请在 Notion 补充或在设置中映射。':role==='priority'&&['C','D'].some(v=>!prop.options.includes(v))?'Notion 目前未定义完整 A/B/C/D 选项，请在原表补充。':'';
    return `<details class="facet" data-role="${role}" ${['topic','priority'].includes(role)?'open':''}><summary>${escape(LABELS[role])}</summary>${role==='usage'?'<p class="small muted">积极：主动说写；消极：理解即可。</p>':''}<p class="small muted">来源：${escape(name)}${prop?'（'+escape(prop.type)+'）':''}</p>${warning?`<p class="small">${escape(warning)}</p>`:''}<div class="choices">${choices}</div></details>`;
  }).join('');
}
function ruleValueHTML(r,i){
  if(r.op==='range')return `<div class="range"><input type="number" data-min value="${escape(r.min??'')}" placeholder="最小" aria-label="最小值"><span>至</span><input type="number" data-max value="${escape(r.max??'')}" placeholder="最大" aria-label="最大值"></div>`;
  if(r.op==='contains')return `<input data-rule-text value="${escape(r.value||'')}" placeholder="包含的文字" aria-label="匹配文字">`;
  if(r.op!=='in')return '';
  const prop=s.properties.find(p=>p.name===r.field);
  const options=filterOptions(r.field,prop?.options||[],r.values||[]);
  return `<div class="choices">${options.map(v=>`<label><input type="checkbox" data-value="${escape(v)}" ${r.values?.includes(v)?'checked':''}>${escape(v===EMPTY?'未分类／未评分（空）':v)} <span class="muted">${s.entries.filter(e=>values(e.props[r.field]).includes(v)).length}</span></label>`).join('')}</div>`;
}
function filtersChanged(rebuild=false){saveResume(null);persistFilters();resetSession();s.limit=40;if(rebuild)renderFilters();render();}
function setQuick(key){
  const r=key==='active'?{field:mapping().usage,op:'in',values:['积极词汇']}:key==='passive'?{field:mapping().usage,op:'in',values:['消极词汇']}:key==='ab'?{field:mapping().priority,op:'in',values:['A','B']}:{field:mapping().usage,op:'empty'};
  s.rules=s.rules.filter(x=>x.field!==r.field);s.rules.push(r);filtersChanged(true);
}
async function sync(){
  if(s.demo){toast('示例模式不会连接 Notion');return;}
  if(s.loading||s.busy){toast('请等当前操作完成');return;}
  s.loading=true;$('refresh').disabled=true;$('sync-status').textContent='正在读取…';
  const collected=[];
  try {
    if(s.sharedDirty)await flushPreferences();
    const schema=await api('schema');s.properties=schema.properties;
    let shared={preferences:null},settingsError='';
    try{shared=await api('preferences');}catch(e){settingsError=e.message;}
    const draft=read('sharedDraft',null);
    if(draft){applyPreferences(draft);s.sharedDirty=true;}else if(!s.sharedDirty)applyPreferences(shared.preferences);
    let cursor=null;const seenCursors=new Set();
    do {const page=await api('entries'+(cursor?'?cursor='+encodeURIComponent(cursor):''));collected.push(...page.entries);cursor=page.hasMore?page.cursor:null;if(page.hasMore&&(!cursor||seenCursors.has(cursor)))throw new Error('分页游标缺失或重复，未替换当前数据');if(cursor)seenCursors.add(cursor);$('sync-status').textContent=`已读取 ${collected.length} 条…`;}while(cursor);
    // Replace only after every page succeeds; avoid showing incomplete results as a full sync.
    if(new Set(collected.map(e=>e.id)).size!==collected.length)throw new Error('分页出现重复记录，未替换当前数据');
    s.entries=collected.map(e=>{e.rawProps={...e.props};applyLearning(e,e.learning||{});return e;});s.cloudReady=true;
    s.connectionError='';$('connection-notice').hidden=true;
    $('data-notice').hidden=!settingsError&&!collected.some(e=>e.legacyStatePresent||e.reviewError);
    $('data-notice').textContent=settingsError?'设置云同步暂不可用：'+settingsError+'；学习内容仍可浏览，设置暂存在本机。':collected.some(e=>e.reviewError)?'部分学习记录格式异常，原始内容仍可浏览；异常记录不会被覆盖。':'检测到旧 WortgartenState：已停止使用其中分类、设置和进度，旧列保持原样。本版复习记录使用“学习记录”列。';
    $('sync-status').textContent='已同步 '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    renderFilters();render();
    if(s.sharedDirty)await flushPreferences();
  }catch(e){s.connectionError=e.message;$('sync-status').textContent='同步失败';$('connection-notice').hidden=false;$('connection-message').textContent=e.message+'；当前学习界面保持打开。';toast(e.message+'；当前结果未被覆盖');}
  finally{s.loading=false;$('refresh').disabled=false;render();}
}
function startApp(demo=false){
  s.demo=demo;if(demo)s.connectionError='';$('demo-banner').hidden=!demo;$('connection-notice').hidden=demo;
  $('search').value=s.search;$('sort').value=s.sort;
  if(demo){const d=demoData();s.entries=d.entries;s.properties=d.properties;$('sync-status').textContent='示例模式';renderFilters();render();}
  else checkStatus();
}
async function rate(result){
  if(s.busy||s.loading)return;
  if(s.pendingReview&&!s.demo){toast('还有一次复习待保存，请点击“重试保存”或“同步后重学”');return;}
  const e=s.entries.find(x=>x.id===s.session[s.index]);if(!e)return;
  if(s.demo){const previous=e.learning||{};applyLearning(e,review(previous,result));s.index++;s.revealed=false;render();return;}
  s.pendingReview={id:e.id,result,eventId:crypto.randomUUID(),expectedLastReviewed:e.learning?.lastReviewed||null};
  save('cloudReview',s.pendingReview);await sendReview();
}
async function sendReview(){
  if(!s.pendingReview||s.busy)return;s.busy=true;render();
  try{
    const result=await cloudPost('review',s.pendingReview),e=s.entries.find(e=>e.id===s.pendingReview.id);
    if(e)applyLearning(e,result.learning);
    if(s.session[s.index]===s.pendingReview.id){s.index++;s.revealed=false;if(s.index>=s.session.length)saveResume({mode:s.mode,id:'',completed:true});}
    s.pendingReview=null;save('cloudReview',null);toast('复习进度已保存到云端');
  }catch(e){toast(e.message+'；尚未确认保存，可重试');}
  finally{s.busy=false;render();}
}
function openSettings(){
  const form=$('settings-form');form.elements.front.value=s.settings.front;form.elements.back.value=s.settings.back;
  $('mapping-fields').innerHTML=Object.entries(s.settings.map).filter(([role])=>!REVIEW_ROLES.includes(role)&&!['eventId','classification'].includes(role)).map(([role,name])=>`<label>${escape(LABELS[role]||role)}<select name="map.${escape(role)}"><option value="">不使用</option>${[...new Set([name,...s.properties.map(p=>p.name)])].filter(Boolean).map(n=>`<option value="${escape(n)}" ${n===name?'selected':''}>${escape(n)}${s.properties.some(p=>p.name===n)?'':'（Notion 缺少此字段）'}</option>`).join('')}</select></label>`).join('');
  renderDisplayFields();$('settings-dialog').showModal();
}
function renderDisplayFields(){
  const roles=[...s.settings.display,...initialSettings.display.filter(k=>!s.settings.display.includes(k))];
  $('display-fields').innerHTML=roles.map(role=>`<div class="display-field"><label><input type="checkbox" data-display="${role}" ${s.settings.display.includes(role)?'checked':''}>${escape(LABELS[role]||role)}</label><button type="button" data-up="${role}" aria-label="上移${escape(LABELS[role]||role)}">↑</button><button type="button" data-down="${role}" aria-label="下移${escape(LABELS[role]||role)}">↓</button></div>`).join('');
}
function speak(id){
  const e=s.entries.find(e=>e.id===id);if(!e)return;
  if(!('speechSynthesis' in window))return toast('当前浏览器不支持朗读');
  speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text(val(e,'german')));u.lang='de-DE';u.rate=.88;speechSynthesis.speak(u);
}
// Events use delegation; no inline handlers or HTML from Notion is executed.
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  try{
    if(b.hasAttribute('data-close')){if(!s.busy)b.closest('dialog').close();return;}
    if(b.dataset.mode){saveResume(null);s.mode=b.dataset.mode;resetSession();persistFilters();render();return;}
    if(b.dataset.quick){setQuick(b.dataset.quick);return;}
    if(b.dataset.speak){speak(b.dataset.speak);return;}
    if(b.dataset.learn){saveResume(null);s.mode='cards';s.session=[b.dataset.learn];s.index=0;s.revealed=false;persistFilters();render();return;}
    if(b.dataset.rate){await rate(b.dataset.rate);return;}
    if(b.dataset.removeRule!==undefined){s.rules.splice(Number(b.dataset.removeRule),1);filtersChanged(true);return;}
    if(b.dataset.preset!==undefined){const p=s.presets[Number(b.dataset.preset)];s.rules=structuredClone(p.rules);s.logic=p.logic;s.search=p.search;s.sort=p.sort||'priority';$('search').value=s.search;$('sort').value=s.sort;filtersChanged(true);return;}
    if(b.dataset.deletePreset!==undefined){s.presets.splice(Number(b.dataset.deletePreset),1);save('presets',s.presets);sharedChanged();renderFilters();return;}
    if(b.dataset.up||b.dataset.down){const role=b.dataset.up||b.dataset.down,i=s.settings.display.indexOf(role),j=i+(b.dataset.up?-1:1);if(i>=0&&j>=0&&j<s.settings.display.length)[s.settings.display[i],s.settings.display[j]]=[s.settings.display[j],s.settings.display[i]];renderDisplayFields();return;}
    switch(b.id){
      case 'demo':startApp(true);break;
      case 'leave-demo':s.demo=false;s.entries=[];s.properties=[];resetSession();$('demo-banner').hidden=true;await checkStatus();break;
      case 'refresh':await sync();break;
      case 'settings-open':openSettings();break;
      case 'filters-open':$('filters').classList.add('open');$('filters-close').focus();break;
      case 'filters-close':$('filters').classList.remove('open');$('filters-open').focus();break;
      case 'add-rule':s.rules.push({field:mapping().topic,op:'in',values:[]});filtersChanged(true);break;
      case 'reset-filters':s.rules=[];s.search='';s.logic='and';$('search').value='';filtersChanged(true);break;
      case 'save-filter':$('preset-dialog').showModal();break;
      case 'load-more':s.limit+=40;render();break;
      case 'reveal':s.revealed=true;render();break;
      case 'reverse':[s.settings.front,s.settings.back]=[s.settings.back,s.settings.front];s.revealed=false;save('settings',s.settings);sharedChanged();render();break;
      case 'skip':if(!s.busy){s.index++;s.revealed=false;render();}break;
      case 'previous':if(!s.busy){s.index=Math.max(0,s.index-1);s.revealed=false;render();}break;
      case 'restart':save('resume',null);resetSession();render();break;
      case 'connect':await checkStatus();break;
      case 'retry-review':await sendReview();break;
      case 'reset-review':if(!s.busy&&window.confirm('重新读取云端进度并放弃此条尚未确认的本机事件？')){s.pendingReview=null;save('cloudReview',null);resetSession();await sync();}break;
    }
  }catch(e){toast(e.message);}
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.dataset.facet){
    const name=el.dataset.facet,choice=el.dataset.choice;
    let r=s.rules.find(r=>r.field===name&&r.op==='in');
    if(!r){r={field:name,op:'in',values:[]};s.rules.push(r);}
    r.values=el.checked?[...new Set([...r.values,choice])]:r.values.filter(v=>v!==choice);
    if(!r.values.length)s.rules=s.rules.filter(x=>x!==r);
    filtersChanged(true);return;
  }
  if(el.dataset.display){s.settings.display=el.checked?[...s.settings.display,el.dataset.display]:s.settings.display.filter(k=>k!==el.dataset.display);return;}
  if(el.id==='logic'){s.logic=el.value;filtersChanged();return;}
  if(el.id==='sort'){s.sort=el.value;filtersChanged();return;}
  const container=el.closest('[data-rule]');if(!container)return;const r=s.rules[Number(container.dataset.rule)];
  if(el.hasAttribute('data-rule-field')){r.field=el.value;r.values=[];r.value='';r.min='';r.max='';filtersChanged(true);}
  else if(el.hasAttribute('data-rule-op')){r.op=el.value;r.values=[];r.value='';r.min='';r.max='';filtersChanged(true);}
  else if(el.dataset.value!==undefined){r.values||=[];r.values=el.checked?[...r.values,el.dataset.value]:r.values.filter(v=>v!==el.dataset.value);filtersChanged(true);}
});
document.addEventListener('input',event=>{
  const el=event.target;if(el.id==='search'){s.search=el.value;filtersChanged();return;}
  const container=el.closest('[data-rule]');if(!container)return;const r=s.rules[Number(container.dataset.rule)];
  if(el.hasAttribute('data-min'))r.min=el.value;else if(el.hasAttribute('data-max'))r.max=el.value;else if(el.hasAttribute('data-rule-text'))r.value=el.value;else return;filtersChanged();
});
$('preset-form').addEventListener('submit',event=>{event.preventDefault();const name=new FormData(event.target).get('name').trim();if(!name)return;s.presets.push({name,rules:structuredClone(s.rules),logic:s.logic,search:s.search,sort:s.sort});save('presets',s.presets);sharedChanged();$('preset-dialog').close();event.target.reset();renderFilters();toast(s.demo?'示例筛选已保存到此浏览器':'筛选已暂存，正在云同步');});
$('settings-form').addEventListener('submit',event=>{
  event.preventDefault();const data=new FormData(event.target);if(data.get('front')===data.get('back'))return toast('正面和背面请选择不同内容');
  s.settings.front=data.get('front');s.settings.back=data.get('back');for(const [key,value]of data)if(key.startsWith('map.'))s.settings.map[key.slice(4)]=value;
  save('settings',s.settings);sharedChanged();$('settings-dialog').close();resetSession();s.entries.forEach(e=>applyLearning(e,e.learning||{}));renderFilters();render();toast(s.demo?'示例设置已保存':'设置已暂存，正在云同步');
});

for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('cancel',event=>{if(s.busy)event.preventDefault();});
async function checkStatus(){
  if(s.checking)return;
  s.checking=true;s.connectionError='';
  $('connection-notice').hidden=false;$('connection-message').textContent='正在连接 Notion…';
  $('search').value=s.search;$('sort').value=s.sort;renderFilters();render();
  try{
    const status=await api('status');
    if(status.version!=='review-only-v4'||!status.learningShared)throw new Error('线上后端尚未更新，请检查 Cloudflare 是否部署了 GitHub 最新提交');
    if(!status.configured)throw new Error('请在 Cloudflare 配置 NOTION_TOKEN；无需 APP_PASSWORD。');
    await sync();
  }catch(e){s.connectionError=e.message;$('connection-message').textContent=e.message;$('sync-status').textContent='连接失败';}
  finally{s.checking=false;render();}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&s.cloudReady&&!s.demo&&!s.busy)sync();});
startApp();
