const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
    meta: { nextUid: 1 },
    users: [],
    keys: [],
    promos: [],
    sessions: {},
    hwidResets: []
};

function loadDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(raw);
            if (!db.meta) db.meta = { nextUid: 1 };
            if (!db.users) db.users = [];
            if (!db.keys) db.keys = [];
            if (!db.promos) db.promos = [];
            if (!db.sessions) db.sessions = {};
            if (!db.hwidResets) db.hwidResets = [];

            // Ensure admin user exists with admin123
            let admin = db.users.find(u => u.uid === 1 || u.username.toLowerCase() === 'admin');
            if (!admin) {
                const { hash, salt } = hashPassword('admin123');
                admin = {
                    uid: 1,
                    username: 'admin',
                    email: 'admin@gmail.com',
                    passwordHash: hash,
                    passwordSalt: salt,
                    role: 'admin',
                    avatar: '/avatars/default.svg',
                    telegram: '',
                    hwid: null,
                    lastHwidReset: 0,
                    isBanned: false,
                    banReason: '',
                    createdAt: Date.now(),
                    subscription: { active: true, type: 'lifetime', expiresAt: 'lifetime' },
                    activity: [{ action: 'Регистрация аккаунта', timestamp: Date.now() }]
                };
                db.users.unshift(admin);
                if (db.meta.nextUid <= 1) db.meta.nextUid = 2;
                saveDb();
            } else {
                // Ensure admin credentials are admin / admin123
                const { hash, salt } = hashPassword('admin123');
                admin.passwordHash = hash;
                admin.passwordSalt = salt;
                admin.role = 'admin';
                if (!admin.subscription) {
                    admin.subscription = { active: true, type: 'lifetime', expiresAt: 'lifetime' };
                }
                if (!admin.avatar || admin.avatar.includes('dicebear.com')) {
                    admin.avatar = '/avatars/default.svg';
                }
                saveDb();
            }

            // Ensure all users have activity array, role, and proper default avatar
            db.users.forEach(u => {
                if (!u.activity) u.activity = [];
                if (!u.role) u.role = 'user';
                if (!u.email) u.email = `${u.username}@gmail.com`;
                if (!u.avatar || u.avatar.includes('dicebear.com')) {
                    u.avatar = '/avatars/default.svg';
                }
                if (u.activity.length === 0) {
                    u.activity.push({
                        action: 'Регистрация аккаунта',
                        timestamp: u.createdAt || Date.now()
                    });
                    u.activity.push({
                        action: 'Авторизация в аккаунте',
                        timestamp: Date.now()
                    });
                }
            });
        } else {
            saveDb();
        }
    } catch (e) {
        console.error('Failed to load db, using defaults:', e.message);
    }
}

function saveDb() {
    try {
        const tmp = DB_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
        fs.renameSync(tmp, DB_FILE);
    } catch (e) {
        console.error('Failed to save db:', e.message);
    }
}

loadDb();

// Cryptography helpers
function hashPassword(password, salt) {
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
    return calculated === hash;
}

function generateToken() {
    return 'starlite_' + crypto.randomBytes(32).toString('hex');
}

function generateKeyCode() {
    const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p3 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `STAR-${p1}-${p2}-${p3}`;
}

function logUserActivity(uid, action) {
    const user = findUserByUid(uid);
    if (!user) return;
    if (!user.activity) user.activity = [];
    user.activity.unshift({
        action,
        timestamp: Date.now()
    });
    if (user.activity.length > 20) {
        user.activity = user.activity.slice(0, 20);
    }
    saveDb();
}

// User methods
function findUserByUsername(username) {
    return db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
}

function findUserByUid(uid) {
    return db.users.find(u => u.uid === parseInt(uid, 10));
}

function findUserByToken(token) {
    if (!token) return null;
    const uid = db.sessions[token];
    if (!uid) return null;
    return findUserByUid(uid);
}

function registerUser(username, password, email) {
    const cleanUser = username ? username.trim() : '';
    const cleanEmail = email ? email.trim() : '';
    if (!cleanUser) {
        throw new Error('Введите логин');
    }
    if (cleanUser.length < 2) {
        throw new Error('Логин должен содержать не менее 2 символов');
    }
    if (!cleanEmail) {
        throw new Error('Введите действующий email адрес');
    }
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
        throw new Error('Введите корректный адрес электронной почты');
    }
    if (!password || password.length < 2) {
        throw new Error('Пароль должен содержать не менее 2 символов');
    }

    const existing = findUserByUsername(cleanUser);
    if (existing) {
        if (existing.username.toLowerCase() === 'admin') {
            throw new Error('Логин "admin" зарезервирован для администратора. Перейдите во вкладку "Вход" (пароль: admin123)');
        }
        throw new Error('Пользователь с таким логином уже существует. Попробуйте войти или выберите другой логин');
    }

    const emailExisting = db.users.find(u => (u.email || '').toLowerCase() === cleanEmail.toLowerCase());
    if (emailExisting) {
        throw new Error('Пользователь с таким email уже зарегистрирован');
    }

    const uid = db.meta.nextUid++;
    const { hash, salt } = hashPassword(password);
    const isFirstUser = uid === 1;

    const user = {
        uid,
        username: cleanUser,
        email: cleanEmail,
        passwordHash: hash,
        passwordSalt: salt,
        role: isFirstUser ? 'admin' : 'user',
        avatar: '/avatars/default.svg',
        telegram: '',
        hwid: null,
        lastHwidReset: 0,
        isBanned: false,
        banReason: '',
        createdAt: Date.now(),
        subscription: {
            active: isFirstUser,
            type: isFirstUser ? 'lifetime' : null,
            expiresAt: isFirstUser ? 'lifetime' : 0
        },
        activity: [
            {
                action: 'Регистрация аккаунта',
                timestamp: Date.now()
            },
            {
                action: 'Авторизация в аккаунте',
                timestamp: Date.now()
            }
        ]
    };

    db.users.push(user);
    saveDb();

    const token = generateToken();
    db.sessions[token] = user.uid;
    saveDb();

    return { user: sanitizeUser(user), token };
}

function loginUser(username, password, hwid = null) {
    const user = findUserByUsername(username);
    if (!user) {
        throw new Error('Неверный логин или пароль');
    }
    if (user.isBanned) {
        throw new Error(`Ваш аккаунт заблокирован! Причина: ${user.banReason || 'Нарушение правил'}`);
    }
    if (!verifyPassword(password, user.passwordHash, user.passwordSalt)) {
        throw new Error('Неверный логин или пароль');
    }

    if (hwid && user.role !== 'admin') {
        if (!user.hwid) {
            user.hwid = hwid;
        } else if (user.hwid !== hwid) {
            throw new Error('HWID не совпадает с вашим ПК! Приобретите сброс HWID в магазине на сайте.');
        }
    }

    logUserActivity(user.uid, 'Авторизация в аккаунте');

    const token = generateToken();
    db.sessions[token] = user.uid;
    saveDb();

    return { user: sanitizeUser(user), token };
}

function logoutUser(token) {
    if (db.sessions[token]) {
        delete db.sessions[token];
        saveDb();
    }
}

function sanitizeUser(user) {
    if (!user) return null;
    const now = Date.now();
    let isSubActive = Boolean(user.subscription && user.subscription.active);
    if (isSubActive && user.subscription.expiresAt !== 'lifetime') {
        if (typeof user.subscription.expiresAt === 'number' && user.subscription.expiresAt < now) {
            isSubActive = false;
        }
    }

    let avatarUrl = user.avatar;
    if (!avatarUrl || avatarUrl.includes('dicebear.com')) {
        avatarUrl = '/avatars/default.svg';
    }

    return {
        uid: user.uid,
        username: user.username,
        email: user.email || `${user.username.toLowerCase()}@gmail.com`,
        role: user.role || 'user',
        avatar: avatarUrl,
        telegram: user.telegram || '',
        hwid: user.hwid || null,
        hasHwid: Boolean(user.hwid),
        lastHwidReset: user.lastHwidReset || 0,
        isBanned: Boolean(user.isBanned),
        createdAt: user.createdAt || Date.now(),
        subscription: {
            active: isSubActive,
            type: user.subscription ? user.subscription.type : null,
            expiresAt: user.subscription ? user.subscription.expiresAt : 0
        },
        activity: (user.activity || []).slice(0, 10)
    };
}

// Key system
function createKeys(count, duration, note = '', creatorUid = 1) {
    const created = [];
    const validDurations = ['30d', '180d', 'lifetime'];
    const dur = validDurations.includes(duration) ? duration : '30d';

    for (let i = 0; i < count; i++) {
        let code = generateKeyCode();
        while (db.keys.some(k => k.code === code)) {
            code = generateKeyCode();
        }

        const keyObj = {
            id: 'k_' + crypto.randomBytes(6).toString('hex'),
            code,
            duration: dur,
            note: note.trim(),
            createdUid: creatorUid,
            createdAt: Date.now(),
            isUsed: false,
            usedByUid: null,
            usedByUsername: null,
            usedAt: null
        };
        db.keys.unshift(keyObj);
        created.push(keyObj);
    }

    saveDb();
    return created;
}

function redeemKey(code, uid) {
    const cleanCode = code.trim().toUpperCase();
    const key = db.keys.find(k => k.code === cleanCode);
    if (!key) {
        throw new Error('Указанный ключ не существует');
    }
    if (key.isUsed) {
        throw new Error(`Ключ уже был активирован (UID #${key.usedByUid})`);
    }

    const user = findUserByUid(uid);
    if (!user) {
        throw new Error('Пользователь не найден');
    }

    const now = Date.now();
    let days = 0;
    if (key.duration === '30d') days = 30;
    else if (key.duration === '180d') days = 180;
    else if (key.duration === '365d') days = 365;

    if (key.duration === 'lifetime') {
        user.subscription = {
            active: true,
            type: 'lifetime',
            expiresAt: 'lifetime'
        };
        logUserActivity(user.uid, 'Активация ключа (Навсегда)');
    } else {
        const msToAdd = days * 24 * 60 * 60 * 1000;
        let baseTime = now;
        if (user.subscription && user.subscription.active && typeof user.subscription.expiresAt === 'number' && user.subscription.expiresAt > now) {
            baseTime = user.subscription.expiresAt;
        }
        user.subscription = {
            active: true,
            type: key.duration,
            expiresAt: baseTime + msToAdd
        };
        logUserActivity(user.uid, `Активация ключа (${days} дней)`);
    }

    key.isUsed = true;
    key.usedByUid = user.uid;
    key.usedByUsername = user.username;
    key.usedAt = now;

    saveDb();
    return { key, user: sanitizeUser(user) };
}

// Direct subscription activation on purchase
function activateSubscriptionDirect(uid, plan) {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');

    const now = Date.now();
    if (plan === 'hwid_reset') {
        user.hwid = null;
        user.lastHwidReset = now;
        logUserActivity(user.uid, 'Покупка сброса HWID (199 руб)');
        saveDb();
        return sanitizeUser(user);
    } else if (plan === 'lifetime') {
        user.subscription = {
            active: true,
            type: 'lifetime',
            expiresAt: 'lifetime'
        };
        logUserActivity(user.uid, 'Покупка подписки (Навсегда)');
    } else {
        let days = 30;
        if (plan === '180d') days = 180;
        else if (plan === '30d') days = 30;

        const msToAdd = days * 24 * 60 * 60 * 1000;
        let baseTime = now;
        if (user.subscription && user.subscription.active && typeof user.subscription.expiresAt === 'number' && user.subscription.expiresAt > now) {
            baseTime = user.subscription.expiresAt;
        }

        user.subscription = {
            active: true,
            type: `${days}d`,
            expiresAt: baseTime + msToAdd
        };
        logUserActivity(user.uid, `Покупка подписки (${days} дней)`);
    }

    saveDb();
    return sanitizeUser(user);
}

function deleteKey(idOrCode) {
    const idx = db.keys.findIndex(k => k.id === idOrCode || k.code === idOrCode);
    if (idx !== -1) {
        db.keys.splice(idx, 1);
        saveDb();
        return true;
    }
    return false;
}

function resetUserHwid(uid, byAdmin = false) {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');

    if (!byAdmin) {
        throw new Error('Бесплатный сброс HWID отключен. Приобретите сброс в магазине за 199 руб.');
    }

    const now = Date.now();
    user.hwid = null;
    user.lastHwidReset = now;
    logUserActivity(user.uid, 'Сброс HWID администратором');
    saveDb();
    return sanitizeUser(user);
}

function updateUserProfile(uid, updates) {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');

    if (typeof updates.avatar === 'string' && updates.avatar.trim()) {
        user.avatar = updates.avatar.trim();
    }
    if (typeof updates.telegram === 'string') {
        user.telegram = updates.telegram.trim().replace('@', '');
    }
    if (typeof updates.email === 'string' && updates.email.trim()) {
        user.email = updates.email.trim();
    }
    if (updates.newPassword) {
        if (updates.newPassword.length < 5) throw new Error('Пароль должен быть не менее 5 символов');
        const { hash, salt } = hashPassword(updates.newPassword);
        user.passwordHash = hash;
        user.passwordSalt = salt;
    }

    saveDb();
    return sanitizeUser(user);
}

// ─── PROMO CODE SYSTEM ────────────────────────────────────────────────────────

function createPromo(code, discountPercent, durationDays = 30, maxUses = 100, mediaUid = null) {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) throw new Error('Код промокода не может быть пустым');
    
    if (db.promos.some(p => p.code === cleanCode)) {
        throw new Error('Промокод с таким названием уже существует');
    }

    const discount = parseInt(discountPercent, 10);
    if (isNaN(discount) || discount < 1 || discount > 90) {
        throw new Error('Скидка должна быть от 1% до 90%');
    }

    const days = parseInt(durationDays, 10) || 30;
    const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

    const promo = {
        code: cleanCode,
        discountPercent: discount,
        durationDays: days,
        expiresAt,
        maxUses: parseInt(maxUses, 10) || 100,
        usedCount: 0,
        mediaUid: mediaUid ? parseInt(mediaUid, 10) : null,
        createdAt: Date.now()
    };

    db.promos.push(promo);
    saveDb();
    return promo;
}

function getPromo(code) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
    return db.promos.find(p => p.code === cleanCode);
}

function validatePromo(code) {
    const promo = getPromo(code);
    if (!promo) {
        throw new Error('Промокод не найден');
    }
    if (promo.expiresAt && promo.expiresAt < Date.now()) {
        throw new Error('Срок действия промокода истёк');
    }
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
        throw new Error('Лимит активаций этого промокода исчерпан');
    }
    return {
        code: promo.code,
        discountPercent: promo.discountPercent,
        mediaUid: promo.mediaUid
    };
}

function usePromo(code, uid) {
    const promo = getPromo(code);
    if (!promo) return null;
    promo.usedCount = (promo.usedCount || 0) + 1;
    saveDb();
    return promo;
}

function deletePromo(code) {
    const cleanCode = code.trim().toUpperCase();
    const idx = db.promos.findIndex(p => p.code === cleanCode);
    if (idx !== -1) {
        db.promos.splice(idx, 1);
        saveDb();
        return true;
    }
    return false;
}

function getAllPromos() {
    return db.promos;
}

function getMediaStats(uid) {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');

    const userPromos = db.promos.filter(p => p.mediaUid === user.uid);
    const totalUses = userPromos.reduce((acc, p) => acc + (p.usedCount || 0), 0);

    return {
        promos: userPromos,
        totalUses,
        earnedEstimate: totalUses * 50 // e.g. 50 RUB commission per use
    };
}

// ─── ADMIN OPERATIONS ────────────────────────────────────────────────────────

function adminSetUserSubscription(uid, type, days) {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');

    if (type === 'lifetime') {
        user.subscription = { active: true, type: 'lifetime', expiresAt: 'lifetime' };
        logUserActivity(user.uid, 'Выдана подписка Lifetime администратором');
    } else if (type === 'none') {
        user.subscription = { active: false, type: null, expiresAt: 0 };
        logUserActivity(user.uid, 'Подписка снята администратором');
    } else if (days && Number(days) > 0) {
        const ms = Number(days) * 24 * 60 * 60 * 1000;
        const base = (user.subscription.active && typeof user.subscription.expiresAt === 'number' && user.subscription.expiresAt > Date.now())
            ? user.subscription.expiresAt
            : Date.now();
        user.subscription = { active: true, type: `${days}d`, expiresAt: base + ms };
        logUserActivity(user.uid, `Продлена подписка на ${days} дн. администратором`);
    }
    saveDb();
    return sanitizeUser(user);
}

function adminToggleBan(uid, reason = '') {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');
    if (user.uid === 1) throw new Error('Нельзя забанить главного администратора');

    user.isBanned = !user.isBanned;
    user.banReason = user.isBanned ? (reason || 'Блокировка администратором') : '';
    saveDb();
    return sanitizeUser(user);
}

function adminChangeRole(uid, role) {
    const user = findUserByUid(uid);
    if (!user) throw new Error('Пользователь не найден');
    if (user.uid === 1 && role !== 'admin') throw new Error('Нельзя изменить роль главного администратора');

    const validRoles = ['user', 'media', 'admin'];
    if (!validRoles.includes(role)) {
        throw new Error('Недопустимая роль');
    }

    user.role = role;
    saveDb();
    return sanitizeUser(user);
}

function getStats() {
    const totalUsers = db.users.length;
    const now = Date.now();
    const activeSubs = db.users.filter(u => {
        if (!u.subscription || !u.subscription.active) return false;
        if (u.subscription.expiresAt === 'lifetime') return true;
        return typeof u.subscription.expiresAt === 'number' && u.subscription.expiresAt > now;
    }).length;
    const totalKeys = db.keys.length;
    const usedKeys = db.keys.filter(k => k.isUsed).length;

    return {
        totalUsers,
        activeSubs,
        totalKeys,
        usedKeys,
        clientVersion: '1.16.5',
        onlineUsers: Math.max(14, Math.floor(activeSubs * 0.4) + 8)
    };
}

module.exports = {
    findUserByUsername,
    findUserByUid,
    findUserByToken,
    registerUser,
    loginUser,
    logoutUser,
    sanitizeUser,
    createKeys,
    redeemKey,
    deleteKey,
    activateSubscriptionDirect,
    resetUserHwid,
    updateUserProfile,
    createPromo,
    getPromo,
    validatePromo,
    usePromo,
    deletePromo,
    getAllPromos,
    getMediaStats,
    adminSetUserSubscription,
    adminToggleBan,
    adminChangeRole,
    getAllUsers: () => db.users.map(sanitizeUser),
    getAllKeys: () => db.keys,
    getStats
};
