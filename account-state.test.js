const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { TextDecoder } = require('node:util');
const state = require('./public/js/account-state');
const { repairActivityText } = require('./activity-text');
const day = 86400000, now = Date.UTC(2026, 9, 20, 12);
test('days decrease across day boundaries and expire exactly at deadline', () => {
    const sub = { active:true, type:'30d', expiresAt:now+30*day };
    assert.equal(state.subscription(sub,now).remainingDays,30);
    assert.equal(state.subscription(sub,now+day).remainingDays,29);
    assert.equal(state.subscription(sub,now+30*day).active,false);
    assert.equal(state.subscription(sub,now+31*day).remainingDays,0);
    assert.equal(sub.expiresAt,now+30*day);
});
test('legacy ISO, Unix seconds and numeric strings normalize identically', () => {
    const expiry=now+day;
    for(const value of [expiry,String(expiry),expiry/1000,String(expiry/1000),new Date(expiry).toISOString()])
        assert.deepEqual(state.subscription({active:true,expiresAt:value},now),{active:true,type:null,expiresAt:expiry,remainingDays:1});
});
test('invalid dates fail closed; lifetime and revoked subscriptions remain correct', () => {
    for(const value of [undefined,null,'','oops',Infinity,-1,{},'lifetime '])
        assert.equal(state.subscription({active:true,expiresAt:value},now).active,false);
    assert.equal(state.subscription({active:true,expiresAt:'lifetime'},now).active,true);
    assert.equal(state.subscription({active:false,expiresAt:now+day},now).active,false);
});
test('repairs old and double-encoded Cyrillic activity while preserving healthy text', () => {
    const decode = new TextDecoder('windows-1251');
    for(const text of ['Регистрация аккаунта','Авторизация в аккаунте','Активация ключа (30 дней)','Продлена подписка на 30 дн. администратором']) {
        const broken=decode.decode(Buffer.from(text));
        assert.equal(repairActivityText(broken),text);
        assert.equal(repairActivityText(decode.decode(Buffer.from(broken))),text);
        assert.equal(repairActivityText(text),text);
    }
    assert.equal(repairActivityText('РСФСР & test'),'РСФСР & test');
});
test('database response and token authentication enforce legacy expiry', () => {
    const users=[{uid:5,username:'test',subscription:{active:true,type:'30d',expiresAt:new Date(Date.now()-day).toISOString()},activity:[]}];
    const sandbox={module:{exports:{}},console:{log(){},error(){}},process:{env:{}},__dirname:__dirname,Buffer,setTimeout,clearTimeout};
    sandbox.require=name=>{
        if(name==='fs')return {existsSync:()=>false,mkdirSync(){},writeFileSync(){},renameSync(){}};
        if(name==='mongodb')throw Error('disabled');
        return require(name);
    };
    vm.runInNewContext(fs.readFileSync('database.js','utf8')+'\ndb.users=fixture;db.sessions={test:5};',Object.assign(sandbox,{fixture:users}));
    const db=sandbox.module.exports;
    assert.equal(db.sanitizeUser(users[0]).subscription.active,false);
    assert.equal(db.findUserByToken('test').subscription.active,false);
    assert.equal(db.getStats().activeSubs,0);
});
test('open cabinet counts down without reload, expires, and escapes activity HTML', () => {
    let clock = now;
    class Clock extends Date { static now() { return clock; } }
    const nodes = new Map(['cab-sub-type','cab-sub-expiry','cab-sub-remaining','cab-activity-list'].map(id=>[id,{textContent:'',innerHTML:''}]));
    const context = {
        AccountState:state,Date:Clock,console,document:{addEventListener(){},getElementById:id=>nodes.get(id)},
        window:{addEventListener(){}},localStorage:{},setInterval(){},lucide:{createIcons(){}}
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('public/js/app.js','utf8'),context);
    vm.runInContext('currentUser={subscription:{active:true,type:"30d",expiresAt:'+ (now+2*day) +'},activity:[{action:"<img src=x onerror=alert(1)>",timestamp:'+now+'}]};renderSubscriptionCard();renderActivityFeed();',context);
    assert.equal(nodes.get('cab-sub-remaining').textContent,'2 дн.');
    assert.ok(nodes.get('cab-activity-list').innerHTML.includes('&lt;img'));
    clock+=day;vm.runInContext('renderSubscriptionCard()',context);
    assert.equal(nodes.get('cab-sub-remaining').textContent,'1 дн.');
    clock+=day;vm.runInContext('renderSubscriptionCard()',context);
    assert.equal(nodes.get('cab-sub-type').textContent,'Нет подписки');
    assert.equal(nodes.get('cab-sub-remaining').textContent,'—');
});
