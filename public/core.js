// Shared pure functions: no framework and no network dependencies.
export const DEFAULT_MAP = {
  german: 'German', chinese: 'Chinese', topicGroup:'Topic', topic: '学习主题', subtopic: '子主题',
  tags: '标签', type: 'Type', usage: '学习用途', priority: 'Priority',
  formality: '书面程度', formalScore: '书面程度评分', frequency: '常用度',
  frequencyScore: '常用度评分', spoken: '口语程度', mastery: 'Mastery',
  example: 'Example', germanContext: '德语上下文', chineseContext: '中文上下文',
  grammar: 'Grammar', explanation: '词项讲解', family: '词族路线',
  mnemonic: '记忆点', insight: 'MyInsight', error: 'MyError', correction: 'CorrectVersion',
  nextReview: 'NextReview', lastReviewed: 'LastReviewed', reviewCount: 'ReviewCount',
  interval: 'ReviewInterval', lastResult: 'LastResult', streak: 'IndependentStreak',
  errorCount: 'ErrorCount', eventId: 'ReviewEventID', classification: '分类状态'
};
export const LABELS = {
  german:'德语',chinese:'中文',topicGroup:'主题大类',topic:'学习主题',subtopic:'子主题',tags:'标签',type:'内容类型',
  usage:'积极／消极词汇',priority:'优先级 A–D',formality:'书面程度（原文）',formalScore:'书面程度评分 1–5',
  frequency:'常用度（原文）',frequencyScore:'常用度评分 1–5',spoken:'口语程度',mastery:'掌握程度',
  example:'例句',germanContext:'德语上下文',chineseContext:'中文上下文',grammar:'语法',
  explanation:'词项讲解',family:'词族路线',mnemonic:'记忆点',insight:'我的心得',error:'我的错误',
  correction:'正确表达',nextReview:'下次复习',classification:'分类确认状态'
};
export const REVIEW_ROLES=['interval','nextReview','lastReviewed','reviewCount','errorCount','streak','mastery','lastResult'];
export const REVIEW_MAP=Object.fromEntries(REVIEW_ROLES.map(k=>[k,'复习·'+k]));
export const EMPTY = '__empty__';
export function text(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).join(' · ');
  return String(value);
}
export function values(value) {
  if (value == null || value === '' || (typeof value === 'string' && !value.trim())) return [EMPTY];
  return (Array.isArray(value) && value.length ? value : Array.isArray(value) ? [EMPTY] : [value]).map(String);
}
export function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = text(value).trim();
  // Unknown and prose are never silently converted into zero or guessed ratings.
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
export function field(entry, role, mapping = DEFAULT_MAP) { return entry.props[mapping[role]]; }
export function matches(entry, rules = [], logic = 'and', search = '') {
  if (search && !Object.values(entry.props).some(v => text(v).toLocaleLowerCase().includes(search.toLocaleLowerCase()))) return false;
  const enabled=[];
  for(const r of rules){
    if(!r.field||!(r.op==='empty'||r.op==='notempty'||(r.op==='in'?r.values?.length:r.op==='range'?[r.min,r.max].some(v=>v!==undefined&&v!==''):typeof r.value==='string'&&r.value!=='')))continue;
    const same=r.op==='in'&&enabled.find(x=>x.op==='in'&&x.field===r.field);
    if(same)same.values=[...new Set([...same.values,...r.values])];else enabled.push({...r,...(r.values?{values:[...r.values]}:{})});
  }
  if (!enabled.length) return true;
  const check = r => {
    const v = entry.props[r.field];
    if (r.op === 'empty') return values(v).includes(EMPTY);
    if (r.op === 'notempty') return !values(v).includes(EMPTY);
    if (r.op === 'in') return values(v).some(x => r.values.includes(x));
    if (r.op === 'contains') return text(v).toLocaleLowerCase().includes(String(r.value).toLocaleLowerCase());
    if (r.op === 'range') {
      const n = number(v);
      return n !== null && (r.min == null || r.min === '' || n >= Number(r.min)) && (r.max == null || r.max === '' || n <= Number(r.max));
    }
    return false;
  };
  return logic === 'or' ? enabled.some(check) : enabled.every(check);
}
export function due(entry, mapping, now = new Date()) {
  const date = field(entry, 'nextReview', mapping);
  return !!date && !Number.isNaN(Date.parse(date)) && Date.parse(date) <= now.getTime();
}
export function review(previous, result, now = new Date()) {
  if (!['again','hard','good'].includes(result)) throw new Error('无效复习结果');
  const old = Number(previous.interval) || 0;
  const interval = result === 'again' ? 0 : result === 'hard' ? 1 : old < 1 ? 1 : Math.min(180, Math.round(old * 2.3));
  const next = new Date(now.getTime() + (result === 'again' ? 10 * 60000 : interval * 86400000));
  const streak = result === 'good' ? (Number(previous.streak) || 0) + 1 : 0;
  return { interval, nextReview:next.toISOString(), lastReviewed:now.toISOString(),
    reviewCount:(Number(previous.reviewCount)||0)+1, errorCount:(Number(previous.errorCount)||0)+(result==='again'?1:0),
    streak, mastery:streak>=3?'Mastered':'Learning', lastResult:{again:'Incorrect',hard:'Hesitant',good:'Independent'}[result] };
}
export function plainProperty(p) {
  if (!p) return null;
  switch(p.type) {
    case 'title': case 'rich_text': return (p[p.type] || []).map(t=>t.plain_text ?? t.text?.content ?? '').join('');
    case 'select': case 'status': return p[p.type]?.name ?? null;
    case 'multi_select': return p.multi_select.map(x=>x.name);
    case 'number': case 'checkbox': case 'url': case 'email': case 'phone_number': return p[p.type];
    case 'date': return p.date?.start ?? null;
    case 'created_time': case 'last_edited_time': return p[p.type];
    case 'formula': return p.formula?.type === 'date' ? p.formula.date?.start ?? null : p.formula?.[p.formula.type] ?? null;
    case 'rollup': return p.rollup?.type === 'array' ? p.rollup.array.map(plainProperty) : p.rollup?.[p.rollup.type] ?? null;
    default: return null;
  }
}
