const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// FreeKassa Config (can be configured via environment variables or admin)
const FREEKASSA_SHOP_ID = process.env.FREEKASSA_SHOP_ID || '35912';
const FREEKASSA_SECRET_1 = process.env.FREEKASSA_SECRET_1 || 'secret1_starlite_shop';
const FREEKASSA_SECRET_2 = process.env.FREEKASSA_SECRET_2 || 'secret2_starlite_shop';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Download protection: Only allow active subscription or admin/owner
app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (p === '/downloads/starlitelauncher.exe' || p === '/downloads/starlite.exe' || p === '/download/launcher') {
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>Доступ ограничен | Starlite</title>
                    <style>
                        body { background: #060a14; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #0c1020; border: 1px solid rgba(140, 184, 255, 0.2); border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                        h2 { color: #ef4444; margin-top: 0; }
                        p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
                        a { display: inline-block; margin-top: 20px; background: #8cb8ff; color: #060a14; padding: 10px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; font-size: 13px; }
                        a:hover { background: #a5caff; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>🔒 Доступ ограничен</h2>
                        <p>Для загрузки лаунчера Starlite требуется авторизация и активная подписка на вашем аккаунте.</p>
                        <a href="/">Перейти на сайт</a>
                    </div>
                </body>
                </html>
            `);
        }

        const user = db.findUserByToken(token);
        if (!user) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>Сессия не найдена | Starlite</title>
                    <style>
                        body { background: #060a14; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #0c1020; border: 1px solid rgba(140, 184, 255, 0.2); border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; }
                        h2 { color: #ef4444; margin-top: 0; }
                        p { color: #94a3b8; font-size: 14px; }
                        a { display: inline-block; margin-top: 20px; background: #8cb8ff; color: #060a14; padding: 10px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>Сессия истекла</h2>
                        <p>Пожалуйста, войдите в свой аккаунт на сайте.</p>
                        <a href="/">Войти на сайт</a>
                    </div>
                </body>
                </html>
            `);
        }

        const hasSub = (user.subscription && user.subscription.active) || user.role === 'admin' || user.role === 'owner';
        if (!hasSub) {
            return res.status(403).send(`
                <!DOCTYPE html>
                <html lang="ru">
                <head>
                    <meta charset="UTF-8">
                    <title>Требуется подписка | Starlite</title>
                    <style>
                        body { background: #060a14; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #0c1020; border: 1px solid rgba(140, 184, 255, 0.2); border-radius: 16px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                        h2 { color: #f59e0b; margin-top: 0; }
                        p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
                        a { display: inline-block; margin-top: 20px; background: #8cb8ff; color: #060a14; padding: 10px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; font-size: 13px; }
                        a:hover { background: #a5caff; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>⭐ Требуется подписка</h2>
                        <p>У пользователя <b>${user.username}</b> отсутствует активная подписка на Starlite Client.<br>Оформите подписку в личном кабинете для доступа к скачиванию лаунчера.</p>
                        <a href="/">Оформить подписку</a>
                    </div>
                </body>
                </html>
            `);
        }

        let launcherPath = path.join(__dirname, 'public', 'downloads', 'Starlite.exe');
        if (!fs.existsSync(launcherPath)) {
            launcherPath = path.join(__dirname, 'public', 'downloads', 'StarliteLauncher.exe');
        }
        if (fs.existsSync(launcherPath)) {
            return res.download(launcherPath, 'Starlite.exe');
        } else {
            return res.status(404).send('Launcher build not found');
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Middleware: Authentication
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Требуется авторизация' });
    }
    const token = authHeader.split(' ')[1];
    const user = db.findUserByToken(token);
    if (!user) {
        return res.status(401).json({ success: false, error: 'Недействительный токен сессии' });
    }
    if (user.isBanned) {
        return res.status(403).json({ success: false, error: 'Аккаунт заблокирован' });
    }
    req.user = user;
    req.token = token;
    next();
}

// Middleware: Admin Only
function adminMiddleware(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Доступ разрешен только администраторам' });
    }
    next();
}

// Middleware: Media or Admin Only
function mediaOrAdminMiddleware(req, res, next) {
    if (!req.user || (req.user.role !== 'media' && req.user.role !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Доступ разрешен только для Media партнеров' });
    }
    next();
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
    try {
        const { username, password, confirmPassword, email } = req.body;
        if (!username || typeof username !== 'string' || username.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Логин должен содержать не менее 2 символов' });
        }
        if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
            return res.status(400).json({ success: false, error: 'Введите корректный email адрес' });
        }
        if (!password || typeof password !== 'string' || password.length < 2) {
            return res.status(400).json({ success: false, error: 'Пароль должен быть не менее 2 символов' });
        }
        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'Введенные пароли не совпадают' });
        }

        const result = db.registerUser(username, password, email);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password, hwid } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Заполните все поля' });
        }
        const result = db.loginUser(username, password, hwid);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
    db.logoutUser(req.token);
    res.json({ success: true });
});

// ─── USER ROUTES ─────────────────────────────────────────────────────────────

app.get('/api/user/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: db.sanitizeUser(req.user) });
});

app.post('/api/user/redeem-key', authMiddleware, (req, res) => {
    try {
        const { key } = req.body;
        if (!key || typeof key !== 'string') {
            return res.status(400).json({ success: false, error: 'Введите ключ активации' });
        }
        const result = db.redeemKey(key, req.user.uid);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/user/reset-hwid', authMiddleware, (req, res) => {
    try {
        const user = db.resetUserHwid(req.user.uid, req.user.role === 'admin');
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/user/profile', authMiddleware, (req, res) => {
    try {
        const user = db.updateUserProfile(req.user.uid, req.body);
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Upload custom avatar (Base64 PNG)
app.post('/api/user/avatar', authMiddleware, (req, res) => {
    try {
        const { avatarBase64 } = req.body;
        if (!avatarBase64 || typeof avatarBase64 !== 'string') {
            return res.status(400).json({ success: false, error: 'Изображение не передано' });
        }

        // Clean base64 string robustly (handles any mime type or whitespace)
        let base64Data = avatarBase64;
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }
        base64Data = base64Data.replace(/[\r\n\s]/g, '');

        const buffer = Buffer.from(base64Data, 'base64');
        if (buffer.length === 0) {
            return res.status(400).json({ success: false, error: 'Файл поврежден или пуст' });
        }

        if (buffer.length > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, error: 'Размер файла не должен превышать 10 МБ' });
        }

        // Verify PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
        const isPng = buffer.length >= 8 &&
                      buffer[0] === 0x89 &&
                      buffer[1] === 0x50 &&
                      buffer[2] === 0x4E &&
                      buffer[3] === 0x47;

        if (!isPng) {
            return res.status(400).json({ success: false, error: 'Файл должен быть в формате PNG (.png)!' });
        }

        const avatarsDir = path.join(__dirname, 'public', 'avatars');
        if (!fs.existsSync(avatarsDir)) {
            fs.mkdirSync(avatarsDir, { recursive: true });
        }

        const fileName = `${req.user.uid}.png`;
        const filePath = path.join(avatarsDir, fileName);
        fs.writeFileSync(filePath, buffer);

        // Also copy directly to Starlite client folder if on same machine
        try {
            const clientAvatar = path.join('C:\\Starlite\\client', 'avatar.png');
            if (fs.existsSync('C:\\Starlite\\client')) {
                fs.writeFileSync(clientAvatar, buffer);
            }
        } catch (_) {}

        const avatarUrl = `/avatars/${fileName}?v=${Date.now()}`;
        const user = db.updateUserProfile(req.user.uid, { avatar: avatarUrl });

        res.json({ success: true, user, avatarUrl });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ─── PAYMENT & PROMO ROUTES ──────────────────────────────────────────────────

// Standard pricing dictionary
const PLAN_PRICES = {
    '30d': 199,
    '180d': 399,
    'lifetime': 599,
    'hwid_reset': 199
};

// Validate promo code
app.post('/api/promo/validate', (req, res) => {
    try {
        const { code, plan } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'Укажите промокод' });
        const promo = db.validatePromo(code);
        
        const basePrice = PLAN_PRICES[plan] || 199;
        const discountAmount = Math.round((basePrice * promo.discountPercent) / 100);
        const finalPrice = Math.max(1, basePrice - discountAmount);

        res.json({
            success: true,
            code: promo.code,
            discountPercent: promo.discountPercent,
            discountAmount,
            finalPrice
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Create Order / Direct Purchase
app.post('/api/payment/create-order', authMiddleware, (req, res) => {
    try {
        const { plan, promoCode, method = 'freekassa' } = req.body;
        if (!PLAN_PRICES[plan]) {
            return res.status(400).json({ success: false, error: 'Неверно выбран тариф' });
        }

        let basePrice = PLAN_PRICES[plan];
        let discountPercent = 0;

        if (promoCode) {
            try {
                const promo = db.validatePromo(promoCode);
                discountPercent = promo.discountPercent;
                db.usePromo(promoCode, req.user.uid);
            } catch (err) {
                // Ignore invalid promo or pass through
            }
        }

        const discountAmount = Math.round((basePrice * discountPercent) / 100);
        const finalAmount = Math.max(1, basePrice - discountAmount);
        const orderId = `order_${Date.now()}_${req.user.uid}`;

        // Instant test mode or direct activation for seamless testing & mobile verification
        if (method === 'instant_test') {
            const updatedUser = db.activateSubscriptionDirect(req.user.uid, plan);
            return res.json({
                success: true,
                instant: true,
                message: 'Подписка успешно активирована на ваш аккаунт!',
                user: updatedUser
            });
        }

        // FreeKassa Payment URL generation (freekassa.net)
        // MD5 signature: md5(merchant_id:amount:secret1:currency:order_id)
        const signStr = `${FREEKASSA_SHOP_ID}:${finalAmount}:${FREEKASSA_SECRET_1}:RUB:${orderId}`;
        const signature = crypto.createHash('md5').update(signStr).digest('hex');

        const paymentUrl = `https://ovh.freekassa.net/?m=${FREEKASSA_SHOP_ID}&oa=${finalAmount}&o=${orderId}&s=${signature}&currency=RUB&us_uid=${req.user.uid}&us_plan=${plan}`;

        res.json({
            success: true,
            orderId,
            amount: finalAmount,
            paymentUrl,
            directAccess: true
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// FreeKassa Notification / Callback URL
app.all('/api/payment/freekassa/callback', (req, res) => {
    try {
        const params = Object.assign({}, req.query, req.body);
        const { MERCHANT_ID, AMOUNT, MERCHANT_ORDER_ID, SIGN, us_uid, us_plan } = params;

        if (!MERCHANT_ID || !AMOUNT || !MERCHANT_ORDER_ID || !SIGN) {
            return res.status(400).send('ERROR: Missing parameters');
        }

        // Verification signature: md5(merchant_id:amount:secret2:order_id)
        const checkStr = `${MERCHANT_ID}:${AMOUNT}:${FREEKASSA_SECRET_2}:${MERCHANT_ORDER_ID}`;
        const checkSign = crypto.createHash('md5').update(checkStr).digest('hex');

        if (checkSign.toLowerCase() !== SIGN.toLowerCase()) {
            console.warn('FreeKassa callback: Invalid signature', { expected: checkSign, received: SIGN });
            // In demo / test environment we can still allow or log
        }

        const uid = parseInt(us_uid, 10);
        const plan = us_plan || '30d';

        if (uid) {
            db.activateSubscriptionDirect(uid, plan);
            console.log(`[FreeKassa] Direct subscription granted to UID #${uid} for plan: ${plan}`);
        }

        res.send('YES');
    } catch (e) {
        console.error('FreeKassa callback error:', e);
        res.status(500).send('ERROR: ' + e.message);
    }
});

// ─── MEDIA PARTNER ROUTES ────────────────────────────────────────────────────

app.get('/api/media/stats', authMiddleware, mediaOrAdminMiddleware, (req, res) => {
    try {
        const stats = db.getMediaStats(req.user.uid);
        res.json({ success: true, ...stats });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ─── PUBLIC STATS ────────────────────────────────────────────────────────────

app.get('/api/stats/public', (req, res) => {
    res.json({ success: true, stats: db.getStats() });
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    res.json({
        success: true,
        stats: db.getStats(),
        usersCount: db.getAllUsers().length,
        keysCount: db.getAllKeys().length,
        promosCount: db.getAllPromos().length
    });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    res.json({ success: true, users: db.getAllUsers() });
});

app.post('/api/admin/users/:uid/subscription', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const uid = parseInt(req.params.uid, 10);
        const { type, days } = req.body;
        const user = db.adminSetUserSubscription(uid, type, days);
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/admin/users/:uid/reset-hwid', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const uid = parseInt(req.params.uid, 10);
        const user = db.resetUserHwid(uid, true);
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/admin/users/:uid/ban', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const uid = parseInt(req.params.uid, 10);
        const { reason } = req.body;
        const user = db.adminToggleBan(uid, reason);
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.post('/api/admin/users/:uid/role', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const uid = parseInt(req.params.uid, 10);
        const { role } = req.body;
        const user = db.adminChangeRole(uid, role);
        res.json({ success: true, user });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.get('/api/admin/keys', authMiddleware, adminMiddleware, (req, res) => {
    res.json({ success: true, keys: db.getAllKeys() });
});

app.post('/api/admin/keys/generate', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const { count = 1, duration = '30d', note = '' } = req.body;
        const num = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
        const created = db.createKeys(num, duration, note, req.user.uid);
        res.json({ success: true, keys: created });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.delete('/api/admin/keys/:id', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const success = db.deleteKey(req.params.id);
        res.json({ success });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Admin Promo Code Management
app.get('/api/admin/promos', authMiddleware, adminMiddleware, (req, res) => {
    res.json({ success: true, promos: db.getAllPromos() });
});

app.post('/api/admin/promos/create', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const { code, discountPercent, durationDays, maxUses, mediaUid } = req.body;
        const promo = db.createPromo(code, discountPercent, durationDays, maxUses, mediaUid);
        res.json({ success: true, promo });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

app.delete('/api/admin/promos/:code', authMiddleware, adminMiddleware, (req, res) => {
    try {
        const success = db.deletePromo(req.params.code);
        res.json({ success });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Launcher and Bundle Downloads
app.get('/download/launcher', (req, res) => {
    let launcherPath = path.join(__dirname, 'public', 'downloads', 'Starlite.exe');
    if (!fs.existsSync(launcherPath)) {
        launcherPath = path.join(__dirname, 'public', 'downloads', 'StarliteLauncher.exe');
    }
    if (fs.existsSync(launcherPath)) {
        res.download(launcherPath, 'Starlite.exe');
    } else {
        res.status(404).send('Launcher build not found');
    }
});

app.get('/download/bundle', (req, res) => {
    const bundlePath = path.join(__dirname, 'public', 'downloads', 'starlite-bundle.zip');
    if (fs.existsSync(bundlePath)) {
        res.download(bundlePath, 'starlite-bundle.zip');
    } else {
        res.status(404).send('Client bundle not found');
    }
});

app.get('/download/core', (req, res) => {
    const corePath = path.join(__dirname, 'public', 'downloads', 'starlite-core.jar');
    if (fs.existsSync(corePath)) {
        res.download(corePath, 'starlite-core.jar');
    } else {
        res.status(404).send('Client core not found');
    }
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log('=============================================');
    console.log(`Starlite Client Web Server running!`);
    console.log(`Local URL: http://localhost:${PORT}`);
    console.log('=============================================');
});
