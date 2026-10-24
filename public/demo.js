import { DEFAULT_MAP } from './core.js';
export function demoData() {
  const rows = [
    ['einen Beitrag zu etwas leisten','为某事作出贡献','学术表达','影响与作用','Ausdruck','积极词汇','A',4,5,'Diese Maßnahmen leisten einen wichtigen Beitrag zum Klimaschutz.','这些措施为气候保护作出了重要贡献。','Beitrag 是“贡献”，leisten 表示“做出”；zu + Dativ。'],
    ['in Betracht ziehen','考虑某种选择','学术表达','决定与考虑','Ausdruck','积极词汇','A',4,4,'Wir sollten auch andere Möglichkeiten in Betracht ziehen.','我们也应考虑其他可能性。','把一个选项拉进“观察范围”，也就是纳入考虑。'],
    ['sich mit etwas auseinandersetzen','深入研究／认真探讨某事','学习与职场','研究与讨论','Ausdruck','积极词汇','B',4,4,'Im Seminar setzen wir uns mit den Folgen der Digitalisierung auseinander.','研讨课上，我们深入探讨数字化的影响。','sich + Akk；mit + Dativ。'],
    ['nichtsdestotrotz','尽管如此','学术表达','转折与让步','Wort','消极词汇','C',4,3,'Die Aufgabe ist anspruchsvoll. Nichtsdestotrotz wollen wir sie gemeinsam lösen.','任务很有挑战，尽管如此，我们仍想一起解决。','可以先主动掌握 trotzdem，再识别这个较长的替换表达。'],
    ['die Lieferkette','供应链','学习与职场','物流与供应链','Wort','积极词汇','A',3,4,'Eine stabile Lieferkette ist für die Produktion entscheidend.','稳定的供应链对生产至关重要。','liefern 交付 + Kette 链条。'],
    ['etwas in Anspruch nehmen','使用／享用某项服务','日常生活','服务与办理','Ausdruck','积极词汇','B',4,4,'Bei Bedarf können Sie unsere Beratung in Anspruch nehmen.','如有需要，您可以使用我们的咨询服务。','搭配服务、帮助、时间；表达“占用时间”时意思有所不同。'],
    ['Die Ergebnisse deuten darauf hin, dass …','结果表明／暗示……','学术表达','转述研究','Schreibmuster','积极词汇','B',5,4,'Die Ergebnisse deuten darauf hin, dass regelmäßige Pausen die Konzentration fördern.','结果表明，定期休息有助于集中注意力。','deuten auf + Akk；darauf 指向后面的 dass 从句。'],
    ['Einerseits erleichtern soziale Netzwerke den Austausch. Andererseits können sie dazu führen, dass wir uns ständig mit anderen vergleichen. Entscheidend ist daher, wie bewusst wir diese Angebote nutzen.','一方面，社交网络促进交流；另一方面，它们可能导致我们不断与他人比较。因此，关键在于我们如何有意识地使用这些服务。','社会与科技','社交网络','Schreibmuster',null,null,null,null,null,null,'先提出好处，再补充风险，最后给出判断标准。'],
    ['sich erholen','休息恢复／康复','健康与运动','身体与休息','Wort','积极词汇','A',1,5,'Am Wochenende möchte ich mich gut erholen.','周末我想好好休息恢复一下。','erholen → 把精力“找回来”。'],
    ['infolgedessen','因此／其结果是','学术表达','因果与结果','Wort','消极词汇','D',5,2,'Die Nachfrage ist gestiegen. Infolgedessen wurden die Lieferzeiten länger.','需求上升了，因此交货时间变长了。','in + Folge + dessen：“作为这件事的结果”。']
  ];
  const entries=rows.map((r,i)=>({id:`demo-${i}`,edited:new Date().toISOString(),props:{
    German:r[0],Chinese:r[1],'学习主题':r[2],'子主题':r[3],Type:r[4],'学习用途':r[5],Priority:r[6],
    '书面程度评分':r[7],'常用度评分':r[8],Example:r[9],'德语上下文':r[9],'中文上下文':r[10],
    '记忆点':r[11],'标签':['示例',i===4?'工作德语':'学术德语'],Mastery:i<2?'Learning':'New',
    NextReview:i<2?new Date(Date.now()-86400000).toISOString():null,ReviewCount:i<2?1:0,ReviewInterval:i<2?1:0,
    '书面程度':r[7]?`${r[7]} / 5`:null,'常用度':r[8]?`${r[8]} / 5`:null,'分类状态':r[5]?'人工确认':null
  }}));
  const properties=[...new Set([...Object.values(DEFAULT_MAP),...entries.flatMap(e=>Object.keys(e.props))])].map(name=>({name,type:['书面程度评分','常用度评分','ReviewCount','ReviewInterval','ErrorCount','IndependentStreak'].includes(name)?'number':['标签'].includes(name)?'multi_select':['Priority','Type','学习用途','Mastery','分类状态'].includes(name)?'select':'rich_text',options:[]}));
  return {entries,properties};
}
