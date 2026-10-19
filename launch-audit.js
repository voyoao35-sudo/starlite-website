'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const validSubscription = (user, now) => user && !user.isBanned &&
    (['admin', 'owner'].includes(user.role) || user.subscription?.active &&
        (user.subscription.expiresAt === 'lifetime' || Number(user.subscription.expiresAt) > now));

function createLaunchAudit({ db, directory, telegram = null, now = Date.now, isReady = () => true }) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'launch-sessions.json');
    let sessions = db.getLaunchAuditSessions ? db.getLaunchAuditSessions() : fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const notifications = new Map();
    function refresh() { if (db.getLaunchAuditSessions) sessions = db.getLaunchAuditSessions(); }
    function save() {
        const cutoff = now() - 30 * 86400000;
        for (const [id, item] of Object.entries(sessions)) if (item.createdAt < cutoff) delete sessions[id];
        if (db.saveLaunchAuditSessions) db.saveLaunchAuditSessions(sessions);
        else {
            fs.writeFileSync(file + '.tmp', JSON.stringify(sessions), { mode: 0o600 });
            fs.renameSync(file + '.tmp', file);
        }
    }
    function lookup(id, token) {
        refresh();
        const session = /^[a-f0-9]{32}$/.test(id || '') && sessions[id];
        if (!session || typeof token !== 'string' || token.length !== 64 || hash(token) !== session.tokenHash) {
            throw Object.assign(new Error('Сессия не найдена'), { status: 401 });
        }
        return session;
    }
    function create(user, version, noticeAccepted) {
        refresh();
        if (!validSubscription(user, now())) throw Object.assign(new Error('Нет активной лицензии'), { status: 403 });
        if (noticeAccepted !== 'launch-audit-v1') throw Object.assign(new Error('Нужно подтвердить уведомление о журнале запусков'), { status: 400 });
        if (!['1.16.5', '1.21.11'].includes(version)) throw Object.assign(new Error('Неизвестная версия клиента'), { status: 400 });
        if (Object.values(sessions).filter(s => s.uid === user.uid && now() - s.createdAt < 60000).length >= 5) {
            throw Object.assign(new Error('Слишком частые запуски'), { status: 429 });
        }
        const id = crypto.randomBytes(16).toString('hex'), token = crypto.randomBytes(32).toString('hex');
        sessions[id] = { id, tokenHash: hash(token), actionNonce: crypto.randomBytes(8).toString('hex'),
            uid: user.uid, login: user.username, version, createdAt: now(), lastSeen: now(), state: 'prepared',
            notice: noticeAccepted, notified: false, screenRequested: false };
        save();
        return { id, token, heartbeatSeconds: 20, telegramEnabled: !!telegram };
    }
    async function notify(session) {
        // Plain notification disabled - launcher sends rich report + screenshot on start
        return;
    }
    async function started(id, token) {
        const session = lookup(id, token);
        if (session.state === 'prepared') { session.state = 'running'; session.startedAt = now(); session.lastSeen = now(); save(); }
        if (!notifications.has(id)) notifications.set(id, notify(session).finally(() => notifications.delete(id)));
        try { await notifications.get(id); } catch { /* Telegram availability never crashes a game. */ }
        return status(id, token);
    }
    function status(id, token) {
        const session = lookup(id, token);
        const user = db.findUserByUid(session.uid);
        if (!validSubscription(user, now()) && !['ended', 'revoked'].includes(session.state)) {
            session.state = 'revoked'; session.revokedAt = now(); session.reason = 'Лицензия или доступ к аккаунту отозваны';
        }
        session.lastSeen = now(); save();
        return { state: session.state, reason: session.state === 'revoked' ? session.reason : null,
            screenRequested: !!session.screenRequested };
    }
    function ended(id, token) {
        const session = lookup(id, token);
        if (session.state !== 'revoked') session.state = 'ended';
        session.endedAt = now(); save(); return { state: session.state };
    }

    // ── /kick <uid> ── мгновенно ревокает все активные сессии указанного UID ──
    function kickByUid(uid) {
        refresh();
        const uidNum = typeof uid === 'string' ? parseInt(uid, 10) : uid;
        if (isNaN(uidNum)) return { kicked: 0, login: null };
        let count = 0, login = null;
        for (const session of Object.values(sessions)) {
            if (session.uid === uidNum && ['prepared', 'running'].includes(session.state)) {
                session.state = 'revoked';
                session.revokedAt = now();
                session.reason = 'kicked';
                login = session.login;
                count++;
            }
        }
        if (count > 0) save();
        return { kicked: count, login };
    }

    // ── /ban <uid> ── банит на сайте + ревокает все сессии + закрывает игру и лаунчер ──
    function banByUid(uid, reason) {
        refresh();
        const uidNum = typeof uid === 'string' ? parseInt(uid, 10) : uid;
        if (isNaN(uidNum)) return { banned: false, kicked: 0, login: null };
        // 1. Ревокаем все активные сессии с reason='banned'
        let count = 0, login = null;
        for (const session of Object.values(sessions)) {
            if (session.uid === uidNum && ['prepared', 'running'].includes(session.state)) {
                session.state = 'revoked';
                session.revokedAt = now();
                session.reason = 'banned';
                login = session.login;
                count++;
            }
        }
        if (count > 0) save();
        // 2. Баним в базе данных сайта
        let banned = false;
        try {
            const user = db.findUserByUid(uidNum);
            if (user) {
                login = login || user.username;
                if (!user.isBanned) {
                    user.isBanned = true;
                    user.banReason = reason || 'Заблокирован администратором через Telegram-бот';
                    if (db.saveLaunchAuditSessions) {
                        // Force full DB save through the sessions mechanism which triggers saveDb
                        db.saveLaunchAuditSessions(sessions);
                    }
                }
                banned = true;
            }
        } catch {}
        return { banned, kicked: count, login };
    }

    // ── /screen <uid> ── запрос скриншота у активных сессий UID ──
    function requestScreen(uid) {
        refresh();
        const uidNum = typeof uid === 'string' ? parseInt(uid, 10) : uid;
        if (isNaN(uidNum)) return { requested: 0, login: null };
        let count = 0, login = null;
        for (const session of Object.values(sessions)) {
            if (session.uid === uidNum && ['prepared', 'running'].includes(session.state)) {
                session.screenRequested = true;
                login = session.login;
                count++;
            }
        }
        if (count > 0) save();
        return { requested: count, login };
    }
    // ── /online ── список активных сессий ──
    function listOnline() {
        refresh();
        const active = Object.values(sessions).filter(s => ['prepared', 'running'].includes(s.state) && (now() - s.lastSeen < 60000));
        return active.map(s => ({ uid: s.uid, login: s.login, version: s.version, startedAt: s.startedAt, lastSeen: s.lastSeen }));
    }

    // ── статистика ──
    function getStats() {
        refresh();
        const all = Object.values(sessions);
        const active = all.filter(s => ['prepared', 'running'].includes(s.state) && (now() - s.lastSeen < 60000));
        return {
            totalSessions: all.length,
            activeCount: active.length,
            usersOnline: new Set(active.map(s => s.uid)).size
        };
    }

    // ── обработка загруженного скриншота от лаунчера ──
    async function handleScreenUpload(id, token, imageBuffer) {
        const session = lookup(id, token);
        session.screenRequested = false;
        save();
        if (!telegram) return;
        const boundary = '----StarliteScreenBoundary' + crypto.randomBytes(8).toString('hex');
        const parts = [];
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${telegram.chatId}\r\n`);
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n📸 Скриншот по запросу\nUID: ${session.uid}\nЛогин: ${session.login}\nСессия: ${session.id}\r\n`);
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="screen.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
        const ending = Buffer.from(`\r\n--${boundary}--\r\n`);
        const headerBufs = parts.map(p => Buffer.from(p));
        const body = Buffer.concat([...headerBufs, imageBuffer, ending]);
        const tgToken = process.env.STARLITE_TELEGRAM_TOKEN || '';
        const localFile = path.join(directory, '.private', 'telegram.json');
        let tkn = tgToken;
        if (!tkn && fs.existsSync(localFile)) {
            try { tkn = JSON.parse(fs.readFileSync(localFile, 'utf8')).token || ''; } catch {}
        }
        if (!tkn) return;
        try {
            const response = await fetch(`https://api.telegram.org/bot${tkn}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body,
                signal: AbortSignal.timeout(15000)
            });
            if (!response.ok) console.error('[Screen upload] Telegram rejected photo');
        } catch { /* Screen delivery is best-effort */ }
    }

    async function callback(query) {
        refresh();
        if (!telegram) return;
        const allowed = String(query.from?.id) === String(telegram.ownerId) &&
            String(query.message?.chat?.id) === String(telegram.chatId);
        const match = /^(ask|revoke):([a-f0-9]{32}):([a-f0-9]{16})$/.exec(query.data || '');
        const item = match && sessions[match[2]];
        if (!allowed || !item || match[3] !== item.actionNonce || query.message?.message_id !== item.messageId) {
            await telegram.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Действие недоступно' }); return;
        }
        if (item.state !== 'running' || now() - item.lastSeen > 120000) {
            await telegram.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Сессия уже завершена или недоступна' }); return;
        }
        if (match[1] === 'revoke') {
            if (!item.confirmUntil || now() > item.confirmUntil) {
                await telegram.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Подтвердите действие заново' }); return;
            }
            item.state = 'revoked'; item.revokedAt = now(); item.reason = 'Сессия отозвана администратором'; save();
        } else { item.confirmUntil = now() + 60000; save(); }
        await telegram.call('answerCallbackQuery', { callback_query_id: query.id,
            text: match[1] === 'revoke' ? 'Сессия отозвана. Клиент покажет уведомление и закроется штатно.' : 'Подтвердите отзыв этой сессии' });
        await telegram.call('editMessageReplyMarkup', { chat_id: telegram.chatId, message_id: item.messageId,
            reply_markup: { inline_keyboard: match[1] === 'revoke' ? [] : [[{
                text: `Подтвердить отзыв · UID ${item.uid}`, callback_data: `revoke:${item.id}:${item.actionNonce}` }]] } });
    }
    function install(app, auth) {
        app.use('/api/launcher/sessions', (req, res, next) => {
            if (!isReady()) return res.status(503).json({ success: false, error: 'Журнал запусков ещё загружается. Повторите запуск через несколько секунд.' });
            next();
        });
        app.post('/api/launcher/sessions', auth, (req, res) => {
            try { res.json({ success: true, session: create(req.user, req.body.version, req.body.noticeAccepted) }); }
            catch (e) { res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Ошибка журнала запусков' }); }
        });
        for (const [suffix, action] of [['started', started], ['heartbeat', status], ['ended', ended]]) {
            app.post(`/api/launcher/sessions/:id/${suffix}`, async (req, res) => {
                try {
                    const token = /^Launch ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
                    res.json({ success: true, ...await action(req.params.id, token) });
                } catch (e) { res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Ошибка журнала запусков' }); }
            });
        }
        app.post('/api/launcher/sessions/:id/screen_done', (req, res) => {
            try {
                const token = /^Launch ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
                const session = lookup(req.params.id, token);
                session.screenRequested = false;
                save();
                res.json({ success: true });
            } catch (e) { res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Error' }); }
        });
        // ── endpoint для загрузки скриншота от лаунчера ──
        app.post('/api/launcher/sessions/:id/screen', async (req, res) => {
            try {
                const token = /^Launch ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
                if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
                // Собираем raw body
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                const body = Buffer.concat(chunks);
                await handleScreenUpload(req.params.id, token, body);
                res.json({ success: true });
            } catch (e) { res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Screen upload error' }); }
        });
    }
    return { create, started, status, ended, callback, kickByUid, banByUid, requestScreen, handleScreenUpload, listOnline, getStats, install };
}

function loadTelegramConfig(directory, env = process.env) {
    const file = path.join(directory, '.private', 'telegram.json');
    const local = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const token = env.STARLITE_TELEGRAM_TOKEN || local.token;
    const ownerId = env.STARLITE_TELEGRAM_OWNER_ID || local.ownerId;
    const chatId = env.STARLITE_TELEGRAM_CHAT_ID || local.chatId;
    if (!token || !/^\d+$/.test(ownerId || '') || !/^\d+$/.test(chatId || '')) return null;
    return { token, ownerId, chatId };
}
function createTelegram(config, fetchImpl = globalThis.fetch) {
    if (!config) return null;
    return { ownerId: config.ownerId, chatId: config.chatId, async call(method, body) {
        try {
            const response = await fetchImpl(`https://api.telegram.org/bot${config.token}/${method}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000) });
            const json = await response.json();
            if (!response.ok || !json.ok) throw new Error('Telegram request failed');
            return json.result;
        } catch { throw new Error('Telegram temporarily unavailable'); }
    } };
}
function startTelegramPolling(telegram, audit) {
    if (!telegram) return () => {};
    let offset = 0, stopped = false, timer;
    async function poll() {
        try {
            const updates = await telegram.call('getUpdates', { offset, timeout: 0, allowed_updates: ['callback_query', 'message'] });
            for (const update of updates) {
                if (update.callback_query) await audit.callback(update.callback_query);
                if (update.message && update.message.text) {
                    const msg = update.message;
                    const isOwner = String(msg.from?.id) === String(telegram.ownerId);
                    if (isOwner) {
                        // /help
                        if (/^\/help\b/i.test(msg.text.trim())) {
                            const helpText = 
                                "🛠 <b>Панель управления Starlite Bot</b>\n\n" +
                                "<b>Команды администратора:</b>\n\n" +
                                "• <code>/screen &lt;uid&gt;</code> — Запросить актуальный скриншот экрана у пользователя\n" +
                                "• <code>/kick &lt;uid&gt;</code> — Моментально закрыть клиент указанного пользователя\n" +
                                "• <code>/ban &lt;uid&gt;</code> — Забанить пользователя: закрыть игру + лаунчер и заблокировать аккаунт на сайте\n" +
                                "• <code>/online</code> — Список всех пользователей, находящихся сейчас в игре\n" +
                                "• <code>/stats</code> — Общая статистика сессий и онлайна\n" +
                                "• <code>/help</code> — Справка по всем командам\n\n" +
                                "<i>Каждый запуск клиента автоматически присылает скриншот + отчет о ПК.</i>";
                            await telegram.call('sendMessage', { chat_id: msg.chat.id, text: helpText, parse_mode: 'HTML' });
                        }

                        // /online
                        if (/^\/online\b/i.test(msg.text.trim())) {
                            const online = audit.listOnline();
                            let reply = `👥 <b>Сейчас в игре (${online.length}):</b>\n\n`;
                            if (online.length === 0) {
                                reply += "<i>Нет активных сессий</i>";
                            } else {
                                online.forEach((s, idx) => {
                                    reply += `${idx + 1}. <b>${s.login}</b> (UID: <code>${s.uid}</code>) — версия: <code>${s.version}</code>\n`;
                                });
                            }
                            await telegram.call('sendMessage', { chat_id: msg.chat.id, text: reply, parse_mode: 'HTML' });
                        }

                        // /stats
                        if (/^\/stats\b/i.test(msg.text.trim())) {
                            const st = audit.getStats();
                            const reply = 
                                "📊 <b>Статистика сессий Starlite:</b>\n\n" +
                                `• Игроков онлайн: <b>${st.usersOnline}</b>\n` +
                                `• Активных процессов: <b>${st.activeCount}</b>\n` +
                                `• Всего сессий в журнале: <b>${st.totalSessions}</b>`;
                            await telegram.call('sendMessage', { chat_id: msg.chat.id, text: reply, parse_mode: 'HTML' });
                        }

                        // /kick <uid>
                        const kickMatch = /^\/kick\s+(\d+)$/.exec(msg.text.trim());
                        if (kickMatch) {
                            const targetUid = parseInt(kickMatch[1], 10);
                            const { kicked, login } = audit.kickByUid(targetUid);
                            const reply = kicked > 0
                                ? `✅ Кикнут UID ${targetUid} (${login || '?'}) — ${kicked} сессий закрыто моментально.`
                                : `⚠️ UID ${targetUid} — активных сессий не найдено.`;
                            await telegram.call('sendMessage', { chat_id: msg.chat.id, text: reply });
                        }

                        // /ban <uid>
                        const banMatch = /^\/ban\s+(\d+)$/.exec(msg.text.trim());
                        if (banMatch) {
                            const targetUid = parseInt(banMatch[1], 10);
                            const { banned, kicked, login } = audit.banByUid(targetUid);
                            let reply;
                            if (banned) {
                                reply = `🚫 <b>Пользователь забанен</b>\n\n` +
                                    `• UID: <code>${targetUid}</code>\n` +
                                    `• Логин: <code>${login || '?'}</code>\n` +
                                    `• Сессий закрыто: <b>${kicked}</b>\n` +
                                    `• Аккаунт заблокирован на сайте ✅\n` +
                                    `• Игра и лаунчер принудительно закрыты ✅`;
                            } else {
                                reply = `⚠️ UID ${targetUid} — пользователь не найден в базе данных.`;
                            }
                            await telegram.call('sendMessage', { chat_id: msg.chat.id, text: reply, parse_mode: 'HTML' });
                        }

                        // /screen <uid>
                        const screenMatch = /^\/screen\s+(\d+)$/.exec(msg.text.trim());
                        if (screenMatch) {
                            const targetUid = parseInt(screenMatch[1], 10);
                            const { requested, login } = audit.requestScreen(targetUid);
                            const reply = requested > 0
                                ? `📸 Запрос скриншота отправлен UID ${targetUid} (${login || '?'}) — ${requested} сессий. Ожидайте...`
                                : `⚠️ UID ${targetUid} — активных сессий не найдено.`;
                            await telegram.call('sendMessage', { chat_id: msg.chat.id, text: reply });
                        }
                    }
                }
                offset = update.update_id + 1;
            }
        } catch { /* No token, URL or private payload is written to logs. */ }
        if (!stopped) { timer = setTimeout(poll, 3000); timer.unref(); }
    }
    poll(); return () => { stopped = true; clearTimeout(timer); };
}
module.exports = { createLaunchAudit, loadTelegramConfig, createTelegram, startTelegramPolling };
