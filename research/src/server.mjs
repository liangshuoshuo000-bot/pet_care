import http from 'node:http';
import {createAuth} from './auth.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {publicDir,read,write,view,collect,pushDigest,config} from './runtime.mjs';
const port=Number(process.env.PORT||4318),origin=process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;let collecting=false,lastTest=0;
const json=(s,status,value)=>{s.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});s.end(JSON.stringify(value))};
const authorize=createAuth({origin,password:process.env.WORKBENCH_PASSWORD,sessionSecret:process.env.SESSION_SECRET});
const server=http.createServer(async(q,s)=>{try{
 if(q.headers.host!==new URL(origin).host)return json(s,403,{error:'本地访问限制'});
 if(!await authorize(q,s))return;
 const pathname=new URL(q.url,origin).pathname;
 if(q.method==='GET'&&pathname==='/api/state')return json(s,200,view());
 if(q.method==='POST'){
  if(q.headers.origin!==origin||!q.headers['content-type']?.startsWith('application/json'))return json(s,403,{error:'仅接受工作台本地页面请求'});
  let body='';for await(const chunk of q){body+=chunk;if(body.length>150000)return json(s,413,{error:'内容过大'})}const data=JSON.parse(body||'{}');
  if(pathname==='/api/settings'){
   const c=config();if(data.topics&&Object.values(data.topics).every(x=>Number.isFinite(x)&&x>=0&&x<=10))c.topics=data.topics;
   if(Array.isArray(data.journals)&&data.journals.length<=100&&data.journals.every(j=>typeof j.name==='string'&&j.name.length<200&&/^https:\/\/www\.nature\.com\/[a-z0-9-]+\/$/.test(j.url)))c.journals=data.journals;
   if([3,5,8].includes(Number(data.max)))c.max=Number(data.max);if(typeof data.exclude==='string')c.exclude=data.exclude.slice(0,2000);if(typeof data.explore==='boolean')c.explore=data.explore;
   if(Array.isArray(data.saved))c.saved=data.saved.slice(0,5000);if(Array.isArray(data.feedback))c.feedback=data.feedback.slice(-10000);c.topicSchema=2;
   // Schedule changes must go through the scheduler; don't silently change delivery time.
   c.browserImported=true;write('settings.json',c);return json(s,200,{ok:true,config:c,scheduleTime:c.time});
  }
  if(pathname==='/api/collect'){if(collecting)return json(s,409,{error:'采集中，请稍候'});collecting=true;try{return json(s,200,await collect())}finally{collecting=false}}
  if(pathname==='/api/wechat/configure'){if(typeof data.token!=='string'||!/^[a-zA-Z0-9_-]{16,200}$/.test(data.token))return json(s,400,{error:'请核对接收令牌格式'});if(data.consent!==true)return json(s,400,{error:'请确认由pushplus处理并发送你的论文简报'});write('wechat-secret.json',{token:data.token});write('wechat-status.json',{state:'configured',message:'令牌已保存，等待测试'});return json(s,200,{ok:true})}
  if(pathname==='/api/wechat/test'){if(Date.now()-lastTest<60000)return json(s,429,{error:'请等待一分钟后再测试'});lastTest=Date.now();return json(s,200,await pushDigest(true))}
  if(pathname==='/api/wechat/confirm'){const prev=read('wechat-status.json',{});if(prev.state!=='accepted')return json(s,409,{error:'请先发送测试消息'});const secret=read('wechat-secret.json',{});secret.confirmedAt=new Date().toISOString();write('wechat-secret.json',secret);write('wechat-status.json',{...prev,state:'confirmed',message:'用户确认微信已收到测试消息',confirmedAt:new Date().toISOString()});return json(s,200,{ok:true})}
  return json(s,404,{error:'未知操作'});
 }
 if(q.method!=='GET'&&q.method!=='HEAD')return json(s,405,{error:'不支持此方法'});
 // Only explicitly public assets are served. No runtime files or credentials.
 const files={'/':'index.html','/index.html':'index.html','/live.js':'live.js','/采集状态.json':'采集状态.json'};const name=files[decodeURIComponent(pathname)];if(!name)return json(s,404,{error:'未找到'});const b=fs.readFileSync(path.join(publicDir,name));s.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'"});s.end(q.method==='HEAD'?'':b);
 }catch(e){json(s,500,{error:e.message.includes('token')?'接收配置错误':e.message})}});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Local: ${origin}`));
