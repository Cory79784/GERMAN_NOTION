import {STATE_FIELD} from '../src/state.js';
export const SOURCE='2aaff02b-8ca6-41bc-9c61-fb482528ccf3',ONE='11111111-1111-4111-8111-111111111111',TWO='22222222-2222-4222-8222-222222222222';
const prop=(type,value)=>({type,[type]:type==='title'||type==='rich_text'?[{text:{content:value},plain_text:value}]:type==='select'?{name:value}:type==='date'?value?{start:value}:null:value});
export function fixture(){
  const calls=[],properties={German:{type:'title',title:{}},Chinese:{type:'rich_text',rich_text:{}},Priority:{type:'select',select:{options:[{name:'A'},{name:'B'}]}}};
  const pages=new Map([ONE,TWO].map((id,i)=>[id,{id,parent:{type:'data_source_id',data_source_id:SOURCE},url:'https://www.notion.so/'+id,last_edited_time:'2026-10-24',properties:{German:prop('title',i?'einen Beitrag leisten':'sich erholen'),Chinese:prop('rich_text',i?'作出贡献':'恢复'),Priority:prop('select',i?'B':'A'),Mastery:prop('select','New'),ReviewCount:prop('number',0),ReviewInterval:prop('number',0),LastReviewed:prop('date',null)}}]));
  const env={NOTION_TOKEN:'test-only-token',NOTION_DATA_SOURCE_ID:SOURCE,ASSETS:{fetch:async()=>new Response('static page')},FETCH:async(url,init)=>{
    const path=new URL(url).pathname,data=init.body?JSON.parse(init.body):null;calls.push({path,method:init.method,data});
    if(path.endsWith('/query')){
      let results=[...pages.values()];
      if(data.filter)results=results.filter(p=>(p.properties[STATE_FIELD]?.rich_text?.map(x=>x.text?.content||x.plain_text).join('')||'').includes(data.filter.rich_text.contains));
      if(data.filter||data.sorts)return Response.json({results:results.slice(0,1),has_more:false,next_cursor:null});
      return Response.json({results:[results[data.start_cursor?1:0]].filter(Boolean),has_more:!data.start_cursor&&results.length>1,next_cursor:!data.start_cursor&&results.length>1?'page-2':null});
    }
    if(path.includes('/data_sources/')){if(init.method==='PATCH')for(const [name,value]of Object.entries(data.properties)){const type=Object.keys(value)[0];properties[name]={type,...value};}return Response.json({properties});}
    const page=pages.get(path.split('/').at(-1));if(!page)return new Response('not found',{status:404});
    if(init.method==='PATCH')for(const [name,value]of Object.entries(data.properties)){const type=Object.keys(value)[0];page.properties[name]={type,...value};}
    return Response.json(page);
  }};
  return {env,calls,pages,properties};
}
export const request=(env,path,data,origin='https://memory.example')=>{
  const method=data===undefined?'GET':'POST';
  return import('../src/worker.js').then(({default:worker})=>worker.fetch(new Request('https://memory.example/api/'+path,{method,headers:data===undefined?{}:{Origin:origin,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env));
};
