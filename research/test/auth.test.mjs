import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createAuth} from '../src/auth.mjs';
const origin='https://desk.example';
const password='private-test-password-only';
function response(){return {status:null,headers:{},body:'',writeHead(status,headers={}){this.status=status;this.headers=headers},end(body=''){this.body=body}}}
function request(url,method='GET',body='',headers={}){const r=Readable.from([body]);Object.assign(r,{url,method,headers,socket:{remoteAddress:'127.0.0.1'}});return r}
test('refuses startup without private login configuration',()=>{assert.throws(()=>createAuth({origin}),/启动前需配置/)});
test('protects both the page and JSON before login',async()=>{const auth=createAuth({origin,password,sessionSecret:'x'.repeat(48)});let s=response();assert.equal(await auth(request('/'),s),false);assert.equal(s.status,303);assert.equal(s.headers.Location,'/login');s=response();await auth(request('/api/state'),s);assert.equal(s.status,401)});
test('rejects cross-origin login, accepts valid password, and rejects tampered session',async()=>{const auth=createAuth({origin,password,sessionSecret:'x'.repeat(48)});let s=response();await auth(request('/login','POST','password='+password,{origin:'https://evil.example'}),s);assert.equal(s.status,403);s=response();await auth(request('/login','POST','password=incorrect',{origin}),s);assert.equal(s.status,401);s=response();await auth(request('/login','POST','password='+password,{origin}),s);assert.equal(s.status,303);const cookie=s.headers['Set-Cookie'];assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);s=response();assert.equal(await auth(request('/api/state','GET','',{cookie:cookie.split(';')[0]}),s),true);s=response();assert.equal(await auth(request('/api/state','GET','',{cookie:cookie.split(';')[0]+'x'}),s),false);assert.equal(s.status,401)});
test('refuses non-local plaintext HTTP deployments',()=>{assert.throws(()=>createAuth({origin:'http://desk.example',password,sessionSecret:'x'.repeat(48)}),/HTTPS/)});
