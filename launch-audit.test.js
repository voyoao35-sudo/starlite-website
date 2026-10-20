'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createLaunchAudit, createTelegram, loadTelegramConfig } = require('./launch-audit');

function fixture(t, telegramEnabled = true) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlite-audit-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const user = { uid: 42, username: 'User42', role: 'user', subscription: { active: true, expiresAt: 'lifetime' } };
    const calls = [];
    const telegram = telegramEnabled ? { ownerId: '123', chatId: '123', async call(method, body) {
        calls.push({ method, body }); return { message_id: 10 };
    } } : null;
    let time = 1800000000000;
    const options = { db: { findUserByUid: uid => uid === user.uid ? user : null }, directory, telegram, now: () => time };
    const audit = createLaunchAudit(options);
    return { audit, options, user, calls, directory, advance: ms => time += ms };
}
function query(data, { from = 123, chat = 123, message = 10 } = {}) {
    return { id: 'callback-fixture', data, from: { id: from }, message: { message_id: message, chat: { id: chat } } };
}

test('notifications-only deployment sends minimal launch notice without remote control buttons', async t => {
    const { options, user, calls } = fixture(t);
    options.telegram.notificationsOnly = true;
    const audit = createLaunchAudit(options);
    const session = audit.create(user, '1.16.5', 'launch-audit-v1');
    await audit.started(session.id, session.token);
    const notification = calls.find(call => call.method === 'sendMessage');
    assert.ok(notification);
    assert.equal(notification.body.reply_markup, undefined);
    assert.match(notification.body.text, /UID: 42/);
    assert.doesNotMatch(JSON.stringify(notification.body), /screenshot|hardware|sendPhoto|password/i);
    const count = calls.length;
    await audit.callback(query('ask:' + session.id + ':0000000000000000'));
    assert.equal(calls.length, count);
});

test('authentic account identity, explicit notice, versions, subscription and rate limit', t => {
    const { audit, user } = fixture(t);
    assert.throws(() => audit.create(user, '1.21.11', false), /подтвердить/);
    assert.throws(() => audit.create(user, 'injected', 'launch-audit-v1'), /версия/);
    assert.throws(() => audit.create({ ...user, isBanned: true }, '1.21.11', 'launch-audit-v1'), /лицензии/);
    assert.throws(() => audit.create({ ...user, subscription: { active: true, expiresAt: 1 } }, '1.21.11', 'launch-audit-v1'), /лицензии/);
    for (let i = 0; i < 5; i++) audit.create(user, '1.21.11', 'launch-audit-v1');
    assert.throws(() => audit.create(user, '1.21.11', 'launch-audit-v1'), /частые/);
});

test('one notification per start, minimal payload, capability isolation and persistence', async t => {
    const { audit, user, calls, directory, options } = fixture(t);
    const session = audit.create(user, '1.16.5', 'launch-audit-v1');
    assert.equal(calls.length, 0, 'prepared session must not report a successful process start');
    await Promise.all([audit.started(session.id, session.token), audit.started(session.id, session.token)]);
    await audit.started(session.id, session.token);
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.text, /UID: 42\nЛогин: User42\nВерсия: 1.16.5/);
    assert.ok(!/screenshot|hardware|password|email|hwid/i.test(JSON.stringify(calls)));
    const stored = fs.readFileSync(path.join(directory, 'launch-sessions.json'), 'utf8');
    assert.ok(!stored.includes(session.token));
    assert.throws(() => audit.status(session.id, 'f'.repeat(64)), /не найдена/);
    const other = audit.create(user, '1.21.11', 'launch-audit-v1');
    assert.throws(() => audit.status(other.id, session.token), /не найдена/);
    const restarted = createLaunchAudit(options);
    assert.equal(restarted.status(session.id, session.token).state, 'running');
});

test('revoke requires owner, correct chat, message, nonce and fresh confirmation; only selected launch', async t => {
    const { audit, user, calls, advance } = fixture(t);
    const one = audit.create(user, '1.21.11', 'launch-audit-v1');
    const two = audit.create(user, '1.16.5', 'launch-audit-v1');
    await audit.started(one.id, one.token);
    const ask = calls[0].body.reply_markup.inline_keyboard[0][0].callback_data;
    const revoke = ask.replace('ask:', 'revoke:');
    for (const q of [query(revoke), query(ask, { from: 999 }), query(ask, { chat: 999 }), query(ask, { message: 999 }), query(ask.slice(0, -1) + 'z')]) {
        await audit.callback(q);
        assert.equal(audit.status(one.id, one.token).state, 'running');
    }
    await audit.callback(query(ask)); advance(61000);
    await audit.callback(query(revoke));
    assert.equal(audit.status(one.id, one.token).state, 'running');
    await audit.callback(query(ask)); await audit.callback(query(revoke));
    assert.equal(audit.status(one.id, one.token).state, 'revoked');
    assert.equal(audit.status(two.id, two.token).state, 'prepared');
    audit.ended(one.id, one.token);
    assert.equal(audit.status(one.id, one.token).state, 'revoked');
});

test('expired subscription revokes session; transient Telegram failure does not invalidate launch', async t => {
    const { audit, user, options } = fixture(t);
    options.telegram.call = async () => { throw new Error('offline'); };
    const session = audit.create(user, '1.21.11', 'launch-audit-v1');
    assert.equal((await audit.started(session.id, session.token)).state, 'running');
    user.subscription.active = false;
    assert.equal(audit.status(session.id, session.token).state, 'revoked');
});

test('HTTP routes reject unauthenticated creation and forged identity; capability never authorizes account APIs', async t => {
    const { audit, user } = fixture(t, false);
    const app = express(); app.use(express.json());
    audit.install(app, (req, res, next) => {
        if (req.headers.authorization !== 'Bearer fixture-account-token') return res.sendStatus(401);
        req.user = user; next();
    });
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/launcher/sessions`;
    const request = (url, auth, body = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body) });
    assert.equal((await request(base, 'bad')).status, 401);
    const created = await (await request(base, 'Bearer fixture-account-token', {
        uid: 1, login: 'admin', version: '1.21.11', noticeAccepted: 'launch-audit-v1', screenshot: 'ignored' })).json();
    const session = created.session;
    assert.equal((await request(`${base}/${session.id}/heartbeat`, 'Bearer fixture-account-token')).status, 401);
    const started = await (await request(`${base}/${session.id}/started`, `Launch ${session.token}`)).json();
    assert.equal(started.state, 'running');
    assert.equal((await request(base, `Launch ${session.token}`)).status, 401);
});

test('Telegram errors never expose credentials; private config is optional', async t => {
    const { directory } = fixture(t);
    assert.equal(loadTelegramConfig(directory, {}), null);
    const telegram = createTelegram({ token: 'TOP-SECRET', ownerId: '123', chatId: '123' }, async url => { throw new Error(url); });
    await assert.rejects(telegram.call('sendMessage', {}), error => !error.message.includes('TOP-SECRET'));
});

test('audit refreshes persistent sessions after the account database restores from MongoDB', async t => {
    const { options, user } = fixture(t, false);
    let remote = {}, saves = 0;
    options.db.getLaunchAuditSessions = () => remote;
    options.db.saveLaunchAuditSessions = value => { remote = structuredClone(value); saves++; };
    const audit = createLaunchAudit(options);
    const session = audit.create(user, '1.21.11', 'launch-audit-v1');
    await audit.started(session.id, session.token);
    remote = structuredClone(remote);
    remote[session.id].state = 'revoked'; remote[session.id].reason = 'Fixture persisted revocation';
    assert.equal(audit.status(session.id, session.token).state, 'revoked');
    assert.ok(saves >= 3);
});

test('cold startup does not accept launch sessions before database restoration finishes', async t => {
    const { options } = fixture(t, false);
    options.isReady = () => false;
    const app = express(); app.use(express.json());
    createLaunchAudit(options).install(app, () => { throw new Error('auth must wait for restored database'); });
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/launcher/sessions`, { method: 'POST' });
    assert.equal(response.status, 503);
});
