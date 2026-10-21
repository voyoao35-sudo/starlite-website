'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseKeyDuration } = require('./key-duration');

test('custom days validate strictly; existing durations remain supported', () => {
    for (const days of [1,7,30,45,180,365,36500]) assert.equal(parseKeyDuration(`${days}d`).days,days);
    assert.equal(parseKeyDuration('lifetime').days,null);
    for (const invalid of ['0d','-1d','1.5d','36501d','abc','30d<script>','',null,30,'07d']) assert.throws(() => parseKeyDuration(invalid));
});
test('created custom key activates exact duration, extends subscription and rejects invalid key before use', () => {
    const now = Date.UTC(2026,9,21), day=86400000;
    const fakeFs = { existsSync:()=>false,mkdirSync(){},writeFileSync(){},renameSync(){} };
    const context = vm.createContext({ module:{exports:{}},__dirname:__dirname,console,Buffer,
        process:{env:{}},Date:class extends Date { static now(){return now;} },
        require(name) { if(name==='fs')return fakeFs; if(name==='dns')return {setServers(){}}; if(name==='mongodb')throw new Error('No network in fixture'); return require(name); } });
    vm.runInContext(fs.readFileSync('database.js','utf8'),context);
    vm.runInContext('db.users=[{uid:42,username:"Fixture",role:"user",subscription:{active:false},activity:[]}];',context);
    const db=context.module.exports;
    const key=db.createKeys(1,'7d')[0];
    assert.equal(key.duration,'7d');
    assert.equal(db.redeemKey(key.code,42).user.subscription.expiresAt,now+7*day);
    const extension=db.createKeys(1,'45d')[0];
    assert.equal(db.redeemKey(extension.code,42).user.subscription.expiresAt,now+52*day);
    const count=db.getAllKeys().length;
    assert.throws(()=>db.createKeys(1,'nonsense'));
    assert.equal(db.getAllKeys().length,count);
    vm.runInContext('db.keys.unshift({code:"INVALID",duration:"0d",isUsed:false})',context);
    assert.throws(()=>db.redeemKey('INVALID',42));
    assert.equal(db.getAllKeys()[0].isUsed,false);
    assert.equal(db.redeemKey(db.createKeys(1,'lifetime')[0].code,42).user.subscription.expiresAt,'lifetime');
});
test('generator sends entered days and refuses old server silent 30-day fallback', async () => {
    let days='7',supported=false;
    const sent=[],errors=[];
    const context=vm.createContext({document:{addEventListener(){},getElementById(id){return {value:id==='gen-duration'?days:id==='gen-count'?'1':''};}},
        window:{addEventListener(){},api:{adminGetKeys:async()=>({customDuration:supported}),adminGenerateKeys:async(...args)=>{sent.push(args);return {keys:[{}]};}}},
        localStorage:{},setInterval(){},lucide:{createIcons(){}} });
    vm.runInContext(fs.readFileSync('public/js/app.js','utf8'),context);
    context.showToast=(message,type)=>{if(type==='error')errors.push(message);};context.loadAdminData=()=>{};
    const run=()=>context.handleAdminGenKeys({preventDefault(){}});
    await run();assert.equal(sent.length,0);assert.match(errors[0],/Сервер ещё не обновлён/);
    supported=true;await run();assert.equal(sent[0][1],'7d');
    days='0';await run();assert.equal(sent[1][1],'lifetime');
    for(const invalid of ['', '-1','1.5','36501']) {days=invalid;await run();}
    assert.equal(sent.length,2);
});
