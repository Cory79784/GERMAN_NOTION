import test from 'node:test';
import assert from 'node:assert/strict';
import {matches,EMPTY,number,values,review,due,plainProperty,DEFAULT_MAP} from '../public/core.js';

const e={props:{Topic:'学术德语',Usage:'积极词汇',Priority:'A',Tags:['写作','高频'],Score:4,Unknown:null,Prose:'未标注',German:'einen Beitrag leisten'}};
test('多字段 AND + 同一字段多选 OR + 全文搜索',()=>{
  const rules=[{field:'Usage',op:'in',values:['积极词汇']},{field:'Priority',op:'in',values:['A','B']},{field:'Score',op:'range',min:4,max:5}];
  assert.equal(matches(e,rules,'and','BEITRAG'),true);
  assert.equal(matches(e,[...rules,{field:'Tags',op:'in',values:['口语']}],'and'),false);
  assert.equal(matches(e,[...rules,{field:'Tags',op:'in',values:['口语']}],'or'),true);
  assert.equal(matches(e,rules,'or','不存在'),false);
});
test('多标签匹配、空值、空数组、缺失列不丢失未分类条目',()=>{
  assert.equal(matches(e,[{field:'Tags',op:'in',values:['高频']}]),true);
  for(const name of ['Unknown','Missing']){
    assert.equal(matches(e,[{field:name,op:'empty'}]),true);
    assert.equal(matches(e,[{field:name,op:'in',values:[EMPTY]}]),true);
    assert.equal(matches(e,[{field:name,op:'notempty'}]),false);
  }
  assert.deepEqual(values([]),[EMPTY]);
  assert.deepEqual(values('  '),[EMPTY]);
  assert.equal(matches(e,[{field:'Unknown',op:'range',min:0,max:5}]),false);
});
test('只使用显式数字，不把说明／星级／未知转成 0 或猜测分数',()=>{
  for(const v of [null,'','未标注','4/5','★★★★','5 常用'])assert.equal(number(v),null);
  assert.equal(number('0'),0);assert.equal(number('4.5'),4.5);
  assert.equal(matches(e,[{field:'Score',op:'range',min:'',max:3}]),false);
  assert.equal(matches(e,[{field:'Prose',op:'range',min:0,max:5}]),false);
});
test('未选择值的条件是草稿，不错误地过滤所有内容',()=>{
  assert.equal(matches(e,[{field:'Priority',op:'in',values:[]}]),true);
  assert.equal(matches(e,[{field:'Score',op:'range',min:'',max:''}]),true);
  assert.equal(matches(e,[],'or'),true);
});
test('复习间隔与掌握程度：连续三次独立回忆才掌握，忘记后降回学习',()=>{
  const now=new Date('2026-10-24T10:00:00Z');
  const first=review({},'good',now),second=review(first,'good',now),third=review(second,'good',now);
  assert.equal(first.interval,1);assert.equal(second.interval,2);assert.equal(third.mastery,'Mastered');
  const again=review(third,'again',now);
  assert.equal(again.nextReview,'2026-10-24T10:10:00.000Z');assert.equal(again.mastery,'Learning');assert.equal(again.errorCount,1);assert.equal(again.streak,0);
  assert.equal(review(third,'hard',now).interval,1);
  assert.equal(review({interval:180},'good',now).interval,180);
  assert.throws(()=>review({},'invalid'));
});
test('新卡不伪装成到期复习，日期无效也不进入队列',()=>{
  const now=new Date('2026-10-24T10:00:00Z');
  assert.equal(due({props:{NextReview:null}},DEFAULT_MAP,now),false);
  assert.equal(due({props:{NextReview:'invalid'}},DEFAULT_MAP,now),false);
  assert.equal(due({props:{NextReview:'2026-10-24T09:00:00Z'}},DEFAULT_MAP,now),true);
});
test('Notion 富文本、公式、数字零、多选、日期结果正确读取',()=>{
  assert.equal(plainProperty({type:'rich_text',rich_text:[{plain_text:'句子一。'},{text:{content:'句子二。'}}]}),'句子一。句子二。');
  assert.equal(plainProperty({type:'formula',formula:{type:'number',number:0}}),0);
  assert.equal(plainProperty({type:'formula',formula:{type:'string',string:'大学学习'}}),'大学学习');
  assert.deepEqual(plainProperty({type:'multi_select',multi_select:[{name:'A'},{name:'B'}]}),['A','B']);
  assert.equal(plainProperty({type:'date',date:{start:'2026-10-24'}}),'2026-10-24');
});

test('同字段重复多选合并为 OR，空范围不启用，其他字段默认 AND',()=>{
 const e={props:{Priority:'B',Topic:['工作','物流']}};
 assert.equal(matches(e,[{field:'Priority',op:'in',values:['A']},{field:'Priority',op:'in',values:['B']},{field:'Topic',op:'in',values:['物流']}]),true);
 assert.equal(matches(e,[{field:'Priority',op:'in',values:['B']},{field:'Topic',op:'in',values:['健康']}]),false);
 assert.equal(matches(e,[{field:'missing',op:'range'}]),true);
});
