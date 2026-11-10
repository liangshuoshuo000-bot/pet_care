import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const base=path.dirname(fileURLToPath(import.meta.url));
export const publicDir=path.resolve(base,'../public');
export const privateDir=process.env.DATA_DIR||path.resolve(base,'../data');
fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
export function read(name,fallback){try{return JSON.parse(fs.readFileSync(path.join(privateDir,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
export function write(name,value){const dest=path.join(privateDir,name);fs.writeFileSync(dest+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(dest+'.tmp',dest)}
export const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function xmlText(s=''){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>String.fromCodePoint(v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()}
export const rules={
 '分子与细胞工程':/molecular|cellular|cell engineer|synthetic biology|organoid|gene edit|crispr|protein design|cell assembl/i,
 '生物材料与组织工程':/biomaterial|tissue engineer|hydrogel|regenerat|scaffold|extracellular matrix|wound|biofabricat/i,
 '药物、基因与细胞递送系统':/deliver|nanocarrier|lipid nanoparticle|drug|mrna|gene therap|cell therap|car.t/i,
 '免疫工程':/immun|vaccin|antibod|macrophag|t.cell|inflamm/i,
 '生物力学与力学生物学':/mechanobiolog|biomechan|mechanotransduc|stiffness|mechanical|cell force/i,
 '热科学与工程':/thermal|thermo|heat|photothermal|cryotherap|hypertherm|ablation|temperature/i,
 '生物医学器件与生物传感器':/bioelect|biosens|sensor|wearable|implant|device|neurostim|neuromodul|magnetoelectric|vagus/i,
 '医疗机器人、人工智能与远程医疗':/robot|artificial intelligence|machine learn|deep learn|telemed|remote monitor|neural network|clinical trial|AI.enabled/i,
 '生物医学成像':/imag|microscop|tomograph|ultrasound|magnetic resonance|photoacoustic|fluorescen/i
};
export function defaultConfig(){return {topicSchema:2,journals:[['Nature Biomedical Engineering','natbiomedeng'],['Nature Reviews Bioengineering','natrevbioeng'],['Nature Nanotechnology','nnano'],['Nature Communications','ncomms'],['Nature Reviews Materials','natrevmats']].map(([name,slug])=>({name,url:`https://www.nature.com/${slug}/`,enabled:true})),topics:Object.fromEntries(Object.keys(rules).map(t=>[t,5])),time:'09:30',max:5,exclude:'',explore:true,saved:[],feedback:[]}}
export function config(){return read('settings.json',defaultConfig())}
export function rank(articles,c=config()){
 const medical=/biomed|medicin|patient|clinic|therap|cancer|tumou?r|disease|biolog|tissue|cell|neural|neuro|brain|heart|cardiac|immun|vaccine|drug|diagnos|health|organ|gut|bone|wound|blood/i;
 return articles.map(a=>{const text=a.title+' '+a.sourceSummary;let topics=Object.entries(rules).filter(([,r])=>r.test(text)).map(([t])=>t);const excludes=c.exclude.split(/[,，;；\n]+/).map(x=>x.trim()).filter(Boolean);let score=topics.reduce((s,t)=>s+Number(c.topics[t]??5),0);for(const f of c.feedback||[]){if(topics.includes(f.topic))score+=f.action==='more'?1:f.action==='less'?-1:0}const core=/Biomedical Engineering|Reviews Bioengineering/.test(a.journal);if(core)score+=3;const excluded=/correction|retraction|publisher correction|author correction/i.test(a.title)||excludes.some(t=>text.toLowerCase().includes(t.toLowerCase()));const relevant=!excluded&&topics.length>0&&(core||medical.test(text));return {...a,topics,topic:topics[0]||'其他',score,relevant,reason:relevant?`命中关注方向：${topics.join('、')}。当前为关键词辅助初筛，入选简报需核读来源。`:'不符合当前主题范围或属于更正/撤稿/排除项。'}}).sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date))
}
export async function collect(){
 const c=config(),old=read('catalog.json',{articles:[]}),byId=new Map(old.articles.map(a=>[a.id,a]));const sources=[];
 for(const j of c.journals.filter(j=>j.enabled)){
  const u=new URL(j.url);let slug=u.pathname.split('/').filter(Boolean)[0];if(slug==='nbio')slug='natbiomedeng';
  if(u.hostname!=='www.nature.com'||!Object.keys(rules).length){sources.push({journal:j.name,status:'unconfigured',message:'新增来源需要核验官方订阅源'});continue}
  const feed=`https://www.nature.com/${slug}.rss`;
  try{const r=await fetch(feed,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const body=await r.text();if(!/<rdf:RDF|<rss[\s>]/.test(body))throw Error('响应不是有效订阅源');let count=0;
   for(const match of body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)){
    const b=match[1],tag=n=>xmlText(b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`))?.[1]||'');const title=tag('title'),url=tag('link'),doi=tag('prism:doi')||tag('dc:identifier').replace(/^doi:/,'');const date=tag('dc:date').slice(0,10);if(!title||!/^https:\/\/www\.nature\.com\/articles\//.test(url)||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const id=doi||url;let summary=tag('description')||tag('content:encoded');summary=summary.replace(/^.*?Published online:.*?doi:10\.\S+?\s(?=[A-Z])/,'');if(summary.startsWith(j.name))summary=summary.slice(summary.indexOf(doi)+doi.length).trim();
    byId.set(id,{...byId.get(id),id,title,url,doi,date,journal:j.name,sourceSummary:summary,sourceBasis:'官方RSS导语（不是全文）',fetchedAt:new Date().toISOString()});count++;
   }if(!count)throw Error('订阅源未解析出文章');sources.push({journal:j.name,feed,status:'ok',count,checkedAt:new Date().toISOString()});
  }catch(e){sources.push({journal:j.name,feed,status:'error',message:e.message,checkedAt:new Date().toISOString()})}
 }
 const articles=[...byId.values()];write('catalog.json',{articles});let cutoff=new Date(day()+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()-7);const min=cutoff.toISOString().slice(0,10);const active=new Set(c.journals.filter(j=>j.enabled).map(j=>j.name));const candidates=rank(articles.filter(a=>active.has(a.journal)&&a.date>=min&&a.date<=day()),c);const data={collectedAt:new Date().toISOString(),window:'最近7天（用于补漏；发送按DOI去重）',sources,candidateCount:candidates.length,articles:candidates.filter(a=>a.relevant),allCandidates:candidates};write('collection.json',data);fs.writeFileSync(path.join(publicDir,'采集状态.json'),JSON.stringify({collectedAt:data.collectedAt,sources,candidateCount:data.candidateCount,relevantCount:data.articles.length},null,2));return data;
}
export function view(){const c=config(),collection=read('collection.json',null),digest=read('digest.json',null);return {config:c,collection,digest,wechat:{configured:!!read('wechat-secret.json',null),...read('wechat-status.json',{})},schedule:read('schedule.json',null)}}
export async function pushDigest(test=false){const secret=read('wechat-secret.json',null);if(!secret?.token)throw Error('尚未配置微信接收令牌');if(!test&&!secret.confirmedAt)throw Error('微信尚未完成测试接收确认');const digest=read('digest.json',null);if(!test&&(!digest?.articles?.length||digest.date!==day()))throw Error('没有当天已核验的中文简报，不发送旧简报');const priorDeliveries=read('deliveries.json',[]);if(!test){const blocked=new Set(priorDeliveries.filter(d=>['accepted','confirmed','unknown'].includes(d.status)).flatMap(d=>d.ids||[]));digest.articles=digest.articles.filter(a=>!blocked.has(a.id));if(!digest.articles.length)return {status:'no-new-articles',message:'本期论文均已提交或待核查，不重复发送'}}const content=test?'研究工作台微信接收测试。收到后请回到工作台点击“我已收到”。':digest.articles.map((a,i)=>`${i+1}. ${a.zhTitle}\n${a.journal} · ${a.date}\n${a.summary}\n推荐理由：${a.reason}\n证据局限：${a.limitation}\n${a.url}`).join('\n\n');const key=createHash('sha256').update(test?`test-${Date.now()}`:digest.date+digest.articles.map(a=>a.id).join('|')).digest('hex');const ledger=read('deliveries.json',[]);if(!test&&ledger.some(x=>x.key===key&&['accepted','confirmed','unknown'].includes(x.status)))return {status:'already-submitted',message:'本期已提交，避免重复发送'};
 const entry={key,date:day(),test,ids:test?[]:digest.articles.map(a=>a.id),status:'unknown',createdAt:new Date().toISOString()};ledger.push(entry);write('deliveries.json',ledger);
 try{const r=await fetch('https://www.pushplus.plus/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:secret.token,title:test?'研究工作台 · 接收测试':`研究之间 · ${digest.date}研究简报`,content,template:'txt',channel:'wechat'}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('推送服务HTTP '+r.status);const v=await r.json();if(v.code!==200){entry.status='rejected';write('deliveries.json',ledger);throw Error('推送服务拒绝请求，返回码 '+v.code)}entry.status='accepted';entry.serial=v.data;write('deliveries.json',ledger);const status={state:'accepted',message:'服务已受理，尚未确认微信送达',serial:v.data,test,updatedAt:new Date().toISOString()};write('wechat-status.json',{...status,confirmedAt:secret.confirmedAt});return status}catch(e){write('wechat-status.json',{state:entry.status,message:entry.status==='unknown'?'请求结果不明，请先查微信或服务流水，勿盲目重发':e.message,updatedAt:new Date().toISOString()});throw e}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const task=process.argv[2];try{if(task==='collect'){let d=await collect();console.log(JSON.stringify({sources:d.sources,candidates:d.candidateCount,relevant:d.articles.length}))}else if(task==='send'){console.log(JSON.stringify(await pushDigest()))}else{console.log(JSON.stringify(view()))}}catch(e){console.error(e.message);process.exitCode=1}}
