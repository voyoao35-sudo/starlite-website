const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLaunchAudit } = require('./launch-audit');
const { createHandler } = require('./netlify/functions/telegram-commands');
test('account policy launch records only authenticated account identity and version', async t => {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'starlite-policy-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const user={uid:77,username:'Fixture',role:'admin'};const calls=[];
 const audit=createLaunchAudit({directory,db:{findUserByUid:()=>user},telegram:{notificationsOnly:true,chatId:'123',call:async(method,body)=>{calls.push({method,body});return {message_id:1}}}});
 const session=audit.create(user,'1.21.11','account-policy-v1');await audit.started(session.id,session.token);
 assert.equal(calls.length,1);assert.equal(calls[0].method,'sendMessage');
 assert.match(calls[0].body.text,/UID: 77/);assert.match(calls[0].body.text,/Fixture/);
 assert.doesNotMatch(JSON.stringify(calls),/подтвердил|sendPhoto|hardware|screenshot/);
 assert.equal(calls[0].body.reply_markup,undefined);
});
test('Render bot status uses authenticated private owner commands and current host',async()=>{
 const sent=[];const key='d'.repeat(64);
 const handler=createHandler({STARLITE_TELEGRAM_HOST:'Render',STARLITE_TELEGRAM_RELAY_KEY:key,STARLITE_TELEGRAM_CHAT_ID:'123',STARLITE_TELEGRAM_TOKEN:'fixture'},async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})}});
 const event={httpMethod:'POST',headers:{'x-telegram-bot-api-secret-token':key},body:JSON.stringify({message:{from:{id:123},chat:{id:123,type:'private'},text:'/status'}})};
 assert.equal((await handler({...event,headers:{}})).statusCode,401);assert.equal(sent.length,0);
 assert.equal((await handler(event)).statusCode,200);assert.match(sent[0].text,/Render/);assert.doesNotMatch(sent[0].text,/Netlify|не подтверждена/);
});