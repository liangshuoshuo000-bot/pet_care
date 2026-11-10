import {createHmac,timingSafeEqual,randomBytes,scryptSync} from 'node:crypto';
const sessions=new Map(),attempts=new Map();
const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>研究之间 · 私人登录</title><style>body{background:#f5f3ec;color:#23382f;font:16px system-ui;display:grid;place-items:center;min-height:95vh;margin:0}main{max-width:360px;padding:35px}h1{font-family:serif;font-size:36px}input,button{box-sizing:border-box;width:100%;padding:14px;margin:9px 0;border:1px solid #cad0c1;border-radius:5px}button{background:#23382f;color:white;cursor:pointer}p{color:#76806e;line-height:1.8;font-size:13px}</style><main><h1>研究之间</h1><p>这是你的私人研究工作台。请输入部署时设置的工作台密码。</p><form action="/login" method="POST"><input name="password" type="password" placeholder="工作台密码" autocomplete="current-password" required><button>进入工作台</button></form><p>期刊订阅、偏好及微信接收配置仅在登录后可访问。</p></main></html>`;
export function createAuth({origin,password,sessionSecret}){
 if(!password||password.length<16||!sessionSecret||sessionSecret.length<32)throw Error('启动前需配置WORKBENCH_PASSWORD（至少16字符）和SESSION_SECRET（至少32字符）；默认拒绝无保护启动。');
 const secure=new URL(origin).protocol==='https:';if(!secure&&!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('线上PUBLIC_ORIGIN必须使用HTTPS');
 const salt=randomBytes(16),passwordHash=scryptSync(password,salt,32),cookieFlags=`HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`;
 const sign=id=>createHmac('sha256',sessionSecret).update(id).digest('hex');
 function redirect(s,location,cookie){s.writeHead(303,{Location:location,'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});s.end()}
 return async function auth(q,s){
  const p=new URL(q.url,origin).pathname,token=q.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('rd_session='))?.slice(11)||'';
  const [id,sig]=token.split('.'),record=id&&sessions.get(id);let valid=false;if(record&&record>Date.now()&&sig?.length===64){const expected=Buffer.from(sign(id),'hex');let given;try{given=Buffer.from(sig,'hex')}catch{}valid=given?.length===expected.length&&timingSafeEqual(given,expected)}
  if(sessions.size>1000){for(const [k,v] of sessions)if(v<Date.now())sessions.delete(k)}
  if(p==='/login'&&q.method==='GET'){s.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});s.end(page);return false}
  if(p==='/login'&&q.method==='POST'){
   if(q.headers.origin!==origin){s.writeHead(403);s.end('请从工作台登录页提交');return false}
   // Socket identity only: don't trust client-controlled forwarding headers.
   const ip=q.socket.remoteAddress||'unknown',now=Date.now();const recent=(attempts.get(ip)||[]).filter(t=>t>now-900000);if(recent.length>=10){s.writeHead(429);s.end('尝试过多，请15分钟后重试');return false}recent.push(now);attempts.set(ip,recent);
   let body='';for await(const chunk of q){body+=chunk;if(body.length>4096){s.writeHead(413);s.end();return false}}
   const input=new URLSearchParams(body).get('password')||'';const hash=scryptSync(input,salt,32);if(!timingSafeEqual(hash,passwordHash)){s.writeHead(401,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});s.end('密码不正确，请返回重试。');return false}
   const newId=randomBytes(32).toString('hex');sessions.set(newId,now+43200000);attempts.delete(ip);redirect(s,'/',`rd_session=${newId}.${sign(newId)}; ${cookieFlags}`);return false;
  }
  if(p==='/logout'&&q.method==='POST'){if(q.headers.origin!==origin){s.writeHead(403);s.end();return false}if(id)sessions.delete(id);redirect(s,'/login',`rd_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);return false}
  if(valid)return true;
  if(p.startsWith('/api/')){s.writeHead(401,{'Content-Type':'application/json','Cache-Control':'no-store'});s.end(JSON.stringify({error:'请先登录工作台'}))}else redirect(s,'/login');return false;
 }
}
