// Starlite Application Controller (Clean UTF-8)
let currentUser = null;
let currentAuthMode = 'login';
let pendingPlan = null;

// Checkout state
let currentCheckoutPlan = 'lifetime';
let currentCheckoutBasePrice = 599;
let currentDiscountPercent = 0;
let currentAppliedPromo = null;
let currentPaymentMethod = 'freekassa';

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await checkAuth();
    await loadPublicStats();

    // Check URL hash for cabinet
    if (window.location.hash === '#cabinet') {
        if (currentUser) {
            openCabinetView();
        } else {
            openAuthModal('login');
        }
    }

    // Auto-refresh stats every 30s
    setInterval(loadPublicStats, 30000);
});

// ─── TOAST NOTIFICATIONS ─────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    let iconColor = 'text-[#8cb8ff]';
    if (type === 'success') {
        iconName = 'check-circle';
        iconColor = 'text-[#10b981]';
    } else if (type === 'error') {
        iconName = 'alert-circle';
        iconColor = 'text-[#ef4444]';
    }

    toast.innerHTML = `
        <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0 ${iconColor}"></i>
        <div class="text-xs font-semibold flex-1 leading-snug">${message}</div>
    `;

    container.appendChild(toast);
    lucide.createIcons({ root: toast });

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ─── AUTH & USER STATE ───────────────────────────────────────────────────────

async function checkAuth() {
    try {
        if (window.api.token) {
            currentUser = await window.api.getMe();
        }
    } catch (e) {
        currentUser = null;
    }
    renderHeaderAuth();
}

function renderHeaderAuth() {
    const container = document.getElementById('nav-auth-container');
    if (!container) return;

    if (currentUser) {
        let roleBadge = `#${currentUser.uid}`;
        if (currentUser.role === 'admin') roleBadge = 'ROOT';
        else if (currentUser.role === 'media') roleBadge = 'MEDIA';

        const userAv = currentUser.avatar || '/avatars/default.svg';
        container.innerHTML = `
            <div class="flex items-center gap-2">
                <button onclick="openCabinetView()" class="btn-winston text-xs py-1.5 px-3.5 font-semibold flex items-center gap-2">
                    <img id="nav-avatar" src="${userAv}" onerror="this.src='/avatars/default.svg'" alt="avatar" class="w-4 h-4 rounded-full bg-white/20 object-cover">
                    <span>${currentUser.username}</span>
                    <span class="text-[10px] opacity-75 font-mono">${roleBadge}</span>
                </button>
                <button onclick="handleLogout()" title="Выйти" class="text-xs text-slate-400 hover:text-red-400 px-1">
                    <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <button onclick="openAuthModal('login')" class="btn-winston text-xs py-1.5 px-4 font-semibold">
                Кабинет
            </button>
        `;
    }
    lucide.createIcons({ root: container });
}

function handleCabinetNavClick() {
    if (currentUser) {
        openCabinetView();
    } else {
        openAuthModal('login');
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;

    const btn = document.getElementById('auth-submit-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Обработка...`;
    lucide.createIcons({ root: btn });

    try {
        if (currentAuthMode === 'login') {
            const res = await window.api.login(username, password);
            currentUser = res.user;
            showToast(`С возвращением, ${currentUser.username}! (UID #${currentUser.uid})`, 'success');
        } else {
            const email = (document.getElementById('auth-email').value || '').trim();
            const confirmPassword = document.getElementById('auth-confirm-password').value;

            if (!email) {
                showToast('Укажите действующий email адрес!', 'error');
                return;
            }
            if (password !== confirmPassword) {
                showToast('Введенные пароли не совпадают!', 'error');
                return;
            }

            const res = await window.api.register(username, password, confirmPassword, email);
            currentUser = res.user;
            showToast(`Аккаунт успешно создан! Ваш UID #${currentUser.uid}`, 'success');
        }

        closeModal('auth-modal');
        renderHeaderAuth();

        // If user was trying to buy a plan, immediately open checkout
        if (pendingPlan) {
            const p = pendingPlan;
            pendingPlan = null;
            openCheckoutModal(p.plan, p.price, p.title);
        } else {
            openCabinetView();
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        lucide.createIcons({ root: btn });
    }
}

async function handleLogout() {
    await window.api.logout();
    currentUser = null;
    renderHeaderAuth();
    showLandingView();
    showToast('Вы вышли из своего аккаунта', 'info');
}

function openAuthModal(mode = 'login') {
    currentAuthMode = mode;
    switchAuthTab(mode);
    openModal('auth-modal');
}

function switchAuthTab(mode) {
    currentAuthMode = mode;
    const loginBtn = document.getElementById('tab-login-btn');
    const regBtn = document.getElementById('tab-register-btn');
    const submitBtn = document.getElementById('auth-submit-btn');
    const emailGroup = document.getElementById('auth-email-group');
    const confirmGroup = document.getElementById('auth-confirm-password-group');
    const emailInput = document.getElementById('auth-email');
    const confirmInput = document.getElementById('auth-confirm-password');

    if (mode === 'login') {
        loginBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-full bg-[#8cb8ff] text-[#060a14] transition-all';
        regBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-full text-slate-400 hover:text-white transition-all';
        submitBtn.textContent = 'Войти в систему';
        if (emailGroup) emailGroup.classList.add('hidden');
        if (confirmGroup) confirmGroup.classList.add('hidden');
        if (emailInput) emailInput.required = false;
        if (confirmInput) confirmInput.required = false;
    } else {
        regBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-full bg-[#8cb8ff] text-[#060a14] transition-all';
        loginBtn.className = 'flex-1 py-1.5 text-xs font-semibold rounded-full text-slate-400 hover:text-white transition-all';
        submitBtn.textContent = 'Зарегистрироваться';
        if (emailGroup) emailGroup.classList.remove('hidden');
        if (confirmGroup) confirmGroup.classList.remove('hidden');
        if (emailInput) emailInput.required = true;
        if (confirmInput) confirmInput.required = true;
    }
}

// ─── CABINET VIEW CONTROLLER (MATCHING IMAGE 4) ──────────────────────────────

function showLandingView() {
    window.location.hash = '';
    document.getElementById('landing-view').classList.remove('hidden');
    document.getElementById('cabinet-view').classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openCabinetView() {
    if (!currentUser) {
        showToast('Пожалуйста, авторизуйтесь для входа в кабинет', 'info');
        openAuthModal('login');
        return;
    }

    window.location.hash = 'cabinet';
    document.getElementById('landing-view').classList.add('hidden');
    document.getElementById('cabinet-view').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    renderCabinetData();
    switchCabinetSubSection('client');
}

function renderCabinetData() {
    if (!currentUser) return;

    // Header info
    const cabAvatar = document.getElementById('cab-avatar');
    if (cabAvatar) {
        cabAvatar.src = currentUser.avatar || '/avatars/default.svg';
        cabAvatar.onerror = function() { this.src = '/avatars/default.svg'; };
    }
    document.getElementById('cab-username').textContent = currentUser.username;
    document.getElementById('cab-info-username').textContent = currentUser.username;
    document.getElementById('cab-info-uid').textContent = currentUser.uid;
    document.getElementById('cab-uid-badge').textContent = `UID #${currentUser.uid}`;

    // Email / Telegram
    const emailVal = currentUser.telegram ? `@${currentUser.telegram}` : (currentUser.email || `${currentUser.username.toLowerCase()}@gmail.com`);
    document.getElementById('cab-info-email').textContent = emailVal;

    // Date
    const createdDate = new Date(currentUser.createdAt || Date.now());
    const day = String(createdDate.getDate()).padStart(2, '0');
    const month = String(createdDate.getMonth() + 1).padStart(2, '0');
    const year = createdDate.getFullYear();
    document.getElementById('cab-info-created').textContent = `${day}.${month}.${year}`;

    // HWID
    const hwidEl = document.getElementById('cab-info-hwid');
    if (currentUser.hwid) {
        hwidEl.textContent = currentUser.hwid;
        hwidEl.className = 'text-white font-semibold truncate max-w-[220px]';
    } else {
        hwidEl.textContent = 'Не привязан';
        hwidEl.className = 'text-slate-400 font-semibold';
    }

    // Role badge & subnav visibility
    const roleEl = document.getElementById('cab-role-badge');
    const btnMedia = document.getElementById('btn-cab-media');
    const btnAdmin = document.getElementById('btn-cab-admin');

    if (currentUser.role === 'admin' || currentUser.role === 'owner') {
        roleEl.textContent = currentUser.role.toUpperCase();
        roleEl.className = 'uid-badge uid-owner';
        btnAdmin.classList.remove('hidden');
        btnMedia.classList.remove('hidden');
    } else if (currentUser.role === 'media') {
        roleEl.textContent = 'MEDIA';
        roleEl.className = 'uid-badge uid-media';
        btnMedia.classList.remove('hidden');
        btnAdmin.classList.add('hidden');
    } else {
        roleEl.textContent = 'USER';
        roleEl.className = 'uid-badge uid-user';
        btnMedia.classList.add('hidden');
        btnAdmin.classList.add('hidden');
    }

    // Subscription card
    const subTypeEl = document.getElementById('cab-sub-type');
    const subExpiryEl = document.getElementById('cab-sub-expiry');
    const subRemainingEl = document.getElementById('cab-sub-remaining');

    const sub = currentUser.subscription;
    if (sub && sub.active) {
        if (sub.expiresAt === 'lifetime') {
            subTypeEl.textContent = 'Навсегда (Lifetime)';
            subExpiryEl.textContent = 'Бессрочно';
            subRemainingEl.textContent = '∞';
        } else if (typeof sub.expiresAt === 'number') {
            const expDate = new Date(sub.expiresAt);
            const expD = String(expDate.getDate()).padStart(2, '0');
            const expM = String(expDate.getMonth() + 1).padStart(2, '0');
            const expY = expDate.getFullYear();
            subExpiryEl.textContent = `${expD}.${expM}.${expY}`;

            const diffDays = Math.max(0, Math.ceil((sub.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
            subRemainingEl.textContent = `${diffDays} дн.`;
            subTypeEl.textContent = sub.type === '180d' ? '180 Дней' : (sub.type === '30d' ? '30 Дней' : sub.type);
        }
    } else {
        subTypeEl.textContent = 'Нет подписки';
        subExpiryEl.textContent = '—';
        subRemainingEl.textContent = '—';
    }

    // Activity feed
    renderActivityFeed();
    lucide.createIcons();
}

function renderActivityFeed() {
    const list = document.getElementById('cab-activity-list');
    if (!list) return;

    const activities = (currentUser && currentUser.activity) || [];
    if (activities.length === 0) {
        list.innerHTML = `
            <div class="flex items-center justify-between py-1.5 border-b border-white/5">
                <span class="text-white">Авторизация в аккаунте</span>
                <span class="text-slate-500">${formatDateTime(Date.now())}</span>
            </div>
            <div class="flex items-center justify-between py-1.5 border-b border-white/5">
                <span class="text-white">Регистрация аккаунта</span>
                <span class="text-slate-500">${formatDateTime(currentUser ? currentUser.createdAt : Date.now())}</span>
            </div>
        `;
        return;
    }

    list.innerHTML = activities.map(item => `
        <div class="flex items-center justify-between py-1.5 border-b border-white/5">
            <span class="text-white">${item.action}</span>
            <span class="text-slate-500">${formatDateTime(item.timestamp)}</span>
        </div>
    `).join('');
}

async function handleAvatarFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    showToast('Обработка изображения аватара...', 'info');

    const reader = new FileReader();
    reader.onload = function(ev) {
        const img = new Image();
        img.onload = async function() {
            try {
                // Normalize and convert any image format to a clean standard PNG (max 512x512)
                const maxDim = 512;
                let w = img.naturalWidth || img.width;
                let h = img.naturalHeight || img.height;

                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                const cleanPngBase64 = canvas.toDataURL('image/png');

                showToast('Загрузка аватара на сервер...', 'info');
                const res = await window.api.uploadAvatar(cleanPngBase64);
                if (res.success && res.user) {
                    currentUser = res.user;
                    const cabAvatar = document.getElementById('cab-avatar');
                    if (cabAvatar) cabAvatar.src = res.avatarUrl;
                    updateAuthNav(currentUser);
                    showToast('🎉 Аватар успешно сохранен! Он будет отображаться в клиенте и ClickGUI.', 'success');
                }
            } catch (err) {
                showToast(err.message || 'Ошибка загрузки аватара', 'error');
            } finally {
                e.target.value = '';
            }
        };
        img.onerror = function() {
            showToast('Не удалось открыть изображение. Выберите другой файл.', 'error');
            e.target.value = '';
        };
        img.src = ev.target.result;
    };
    reader.onerror = function() {
        showToast('Не удалось прочитать файл', 'error');
        e.target.value = '';
    };
    reader.readAsDataURL(file);
}

function formatDateTime(ts) {
    const d = new Date(ts || Date.now());
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function switchCabinetSubSection(section) {
    const subClient = document.getElementById('cabinet-sub-client');
    const subMedia = document.getElementById('cabinet-sub-media');
    const subAdmin = document.getElementById('cabinet-sub-admin');

    const btnClient = document.getElementById('btn-cab-client');
    const btnMedia = document.getElementById('btn-cab-media');
    const btnAdmin = document.getElementById('btn-cab-admin');

    subClient.classList.add('hidden');
    subMedia.classList.add('hidden');
    subAdmin.classList.add('hidden');

    const isMedia = currentUser && (currentUser.role === 'media' || currentUser.role === 'admin' || currentUser.role === 'owner');
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'owner');

    btnClient.className = 'btn-winston-ghost py-1.5 px-4 text-xs font-semibold';
    btnMedia.className = (isMedia ? '' : 'hidden ') + 'btn-winston-ghost py-1.5 px-4 text-xs font-semibold text-[#f472b6] border-[#f472b6]/30';
    btnAdmin.className = (isAdmin ? '' : 'hidden ') + 'btn-winston-ghost py-1.5 px-4 text-xs font-semibold text-[#fbbf24] border-[#fbbf24]/30';

    if (section === 'client') {
        subClient.classList.remove('hidden');
        btnClient.className = 'btn-winston py-1.5 px-4 text-xs font-semibold';
    } else if (section === 'media' && isMedia) {
        subMedia.classList.remove('hidden');
        btnMedia.className = 'btn-winston py-1.5 px-4 text-xs font-semibold bg-[#f472b6] text-black shadow-[0_4px_18px_rgba(244,114,182,0.3)]';
        loadMediaData();
    } else if (section === 'admin' && isAdmin) {
        subAdmin.classList.remove('hidden');
        btnAdmin.className = 'btn-winston py-1.5 px-4 text-xs font-semibold bg-[#fbbf24] text-black shadow-[0_4px_18px_rgba(251,191,36,0.3)]';
        loadAdminData();
    } else {
        subClient.classList.remove('hidden');
        btnClient.className = 'btn-winston py-1.5 px-4 text-xs font-semibold';
    }

    lucide.createIcons();
}

function showPricingForExtend() {
    showLandingView();
    const el = document.getElementById('pricing');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function handleDownloadClient() {
    if (!currentUser) {
        showToast('Для скачивания лаунчера необходимо войти в аккаунт!', 'warning');
        openAuthModal('login');
        return;
    }

    const hasSub = (currentUser.subscription && currentUser.subscription.active) || currentUser.role === 'admin' || currentUser.role === 'owner';
    if (!hasSub) {
        showToast('У вас нет активной подписки! Оформите подписку для загрузки лаунчера.', 'error');
        handleOpenPricing();
        return;
    }

    showToast('Скачивание Starlite.exe запущено...', 'success');
    const token = window.api ? window.api.token : (localStorage.getItem('starlite_token') || '');
    window.location.href = '/download/launcher?token=' + encodeURIComponent(token);
}

function handleResetHwid() {
    handlePlanBuyClick('hwid_reset', 199, 'Сброс HWID');
}

// ─── PRICING & CHECKOUT (FREEKASSA, DIRECT ACTIVATION & PROMOS) ──────────────

function handlePlanBuyClick(plan, price, title) {
    if (!currentUser) {
        pendingPlan = { plan, price, title };
        showToast('Пожалуйста, авторизуйтесь перед покупкой!', 'info');
        openAuthModal('login');
        return;
    }
    openCheckoutModal(plan, price, title);
}

function openCheckoutModal(plan, price, title) {
    currentCheckoutPlan = plan;
    currentCheckoutBasePrice = price;
    currentDiscountPercent = 0;
    currentAppliedPromo = null;

    document.getElementById('checkout-plan-title').textContent = `Тариф: ${title} (${price} ₽)`;
    document.getElementById('checkout-final-price').textContent = `${price} ₽`;
    document.getElementById('input-checkout-promo').value = '';
    document.getElementById('checkout-promo-info').classList.add('hidden');

    selectPaymentMethod('freekassa');
    openModal('checkout-modal');
}

function selectPaymentMethod(method) {
    currentPaymentMethod = method || 'freekassa';
    const pmFk = document.getElementById('pm-freekassa');
    if (pmFk) {
        pmFk.className = 'w-card p-3.5 flex items-center justify-between border-[#8cb8ff]/50 bg-[#8cb8ff]/10 cursor-pointer transition-all';
    }
    lucide.createIcons();
}

async function handleApplyPromo() {
    const code = document.getElementById('input-checkout-promo').value.trim();
    if (!code) {
        showToast('Введите промокод', 'error');
        return;
    }

    try {
        const res = await window.api.validatePromo(code, currentCheckoutPlan);
        currentDiscountPercent = res.discountPercent;
        currentAppliedPromo = res.code;

        const info = document.getElementById('checkout-promo-info');
        document.getElementById('checkout-discount-percent').textContent = `${res.discountPercent}%`;
        document.getElementById('checkout-discount-amount').textContent = `${res.discountAmount}`;
        document.getElementById('checkout-final-price').textContent = `${res.finalPrice} ₽`;
        info.classList.remove('hidden');

        showToast(`Промокод ${res.code} применен! Скидка ${res.discountPercent}%`, 'success');
        lucide.createIcons({ root: info });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleExecutePayment() {
    if (!currentUser) {
        showToast('Требуется авторизация', 'error');
        return;
    }

    const btn = document.getElementById('btn-pay-now');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Обработка платежа...`;
    lucide.createIcons({ root: btn });

    try {
        if (currentPaymentMethod === 'telegram') {
            window.open('https://t.me/Starlitexxx', '_blank');
            closeModal('checkout-modal');
            return;
        }

        const res = await window.api.createOrder(currentCheckoutPlan, currentAppliedPromo, currentPaymentMethod);

        if (res.instant && res.user) {
            currentUser = res.user;
            closeModal('checkout-modal');
            showToast('🎉 Подписка успешно активирована на ваш аккаунт!', 'success');
            openCabinetView();
        } else if (res.paymentUrl) {
            closeModal('checkout-modal');
            showToast('Перенаправление на FreeKassa...', 'info');
            window.open(res.paymentUrl, '_blank');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
        lucide.createIcons({ root: btn });
    }
}

// ─── KEY REDEEM ──────────────────────────────────────────────────────────────

function openKeyRedeemQuick() {
    if (!currentUser) {
        showToast('Пожалуйста, авторизуйтесь для активации ключа', 'info');
        openAuthModal('login');
        return;
    }
    document.getElementById('input-redeem-key').value = '';
    openModal('key-modal');
}

async function handleRedeemSubmit(e) {
    e.preventDefault();
    const key = document.getElementById('input-redeem-key').value.trim();
    if (!key) return;

    try {
        const res = await window.api.redeemKey(key);
        currentUser = res.user;
        closeModal('key-modal');
        showToast('Ключ успешно активирован на ваш аккаунт!', 'success');
        openCabinetView();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ─── MEDIA PARTNER PANEL ─────────────────────────────────────────────────────

async function loadMediaData() {
    try {
        const res = await window.api.getMediaStats();
        document.getElementById('media-stat-uses').textContent = res.totalUses || 0;
        document.getElementById('media-stat-earned').textContent = `${res.earnedEstimate || 0} ₽`;

        const container = document.getElementById('media-promos-container');
        if (!res.promos || res.promos.length === 0) {
            container.innerHTML = `
                <div class="text-slate-500 py-3 text-center">
                    Администратор еще не назначил вам промокод. Обратитесь к главному администратору.
                </div>
            `;
            return;
        }

        document.getElementById('media-stat-discount').textContent = `${res.promos[0].discountPercent}%`;

        container.innerHTML = res.promos.map(p => `
            <div class="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-white font-bold text-sm tracking-wider text-[#8cb8ff]">${p.code}</span>
                        <span class="bg-[#f472b6]/20 text-[#f472b6] text-[10px] font-bold px-2 py-0.5 rounded">Скидка ${p.discountPercent}%</span>
                    </div>
                    <div class="text-[11px] text-slate-400 mt-1">
                        Активаций: <b>${p.usedCount || 0}</b> • Действует до: ${formatDateTime(p.expiresAt)}
                    </div>
                </div>
                <button onclick="copyPromoCode('${p.code}')" class="btn-winston-ghost py-1.5 px-3 text-xs flex items-center gap-1.5 self-start sm:self-auto">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i> Скопировать
                </button>
            </div>
        `).join('');

        lucide.createIcons({ root: container });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function copyPromoCode(code) {
    navigator.clipboard.writeText(code);
    showToast(`Промокод ${code} скопирован в буфер!`, 'success');
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────

async function loadAdminData() {
    try {
        const [stats, usersRes, keysRes, promosRes] = await Promise.all([
            window.api.adminGetStats(),
            window.api.adminGetUsers(),
            window.api.adminGetKeys(),
            window.api.adminGetPromos()
        ]);

        document.getElementById('adm-stat-users').textContent = stats.usersCount;
        document.getElementById('adm-stat-subs').textContent = stats.stats.activeSubs;
        document.getElementById('adm-stat-promos').textContent = stats.promosCount;
        document.getElementById('adm-stat-keys').textContent = stats.keysCount;

        renderAdminUsers(usersRes.users);
        renderAdminKeys(keysRes.keys);
        renderAdminPromos(promosRes.promos);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function renderAdminUsers(users) {
    const tbody = document.getElementById('admin-users-tbody');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => `
        <tr class="border-b border-white/5 hover:bg-white/[0.02]">
            <td class="py-2.5 font-bold text-slate-300">#${u.uid}</td>
            <td class="py-2.5 text-white font-semibold">${u.username}</td>
            <td class="py-2.5">
                <select onchange="handleAdminChangeRole(${u.uid}, this.value)" class="bg-[#06080e] border border-white/10 rounded px-2 py-0.5 text-[11px] text-white">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="media" ${u.role === 'media' ? 'selected' : ''}>Media</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td class="py-2.5">
                ${u.subscription && u.subscription.active ? '<span class="text-[#10b981]">Активна (' + (u.subscription.type || 'саб') + ')</span>' : '<span class="text-slate-500">Нет</span>'}
            </td>
            <td class="py-2.5 text-slate-400 truncate max-w-[80px]">${u.hwid ? 'Привязан' : '—'}</td>
            <td class="py-2.5 text-right space-x-2">
                <button onclick="handleAdminGiveSub(${u.uid})" class="text-[#8cb8ff] hover:underline text-[11px]">Выдать саб</button>
                <button onclick="handleAdminResetUserHwid(${u.uid})" class="text-slate-300 hover:underline text-[11px]">Сброс HWID</button>
                ${u.uid !== 1 ? `<button onclick="handleAdminToggleBan(${u.uid})" class="${u.isBanned ? 'text-emerald-400' : 'text-red-400'} hover:underline text-[11px]">${u.isBanned ? 'Разбан' : 'Бан'}</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function renderAdminKeys(keys) {
    const tbody = document.getElementById('admin-keys-tbody');
    if (!tbody) return;

    tbody.innerHTML = keys.slice(0, 50).map(k => `
        <tr class="border-b border-white/5 hover:bg-white/[0.02]">
            <td class="py-2.5 text-[#8cb8ff] select-all">${k.code}</td>
            <td class="py-2.5 text-slate-300">${k.duration}</td>
            <td class="py-2.5">${k.isUsed ? '<span class="text-slate-500">Использован</span>' : '<span class="text-[#10b981]">Активен</span>'}</td>
            <td class="py-2.5 text-slate-400">${k.usedByUsername ? k.usedByUsername + ` (#${k.usedByUid})` : '—'}</td>
            <td class="py-2.5 text-right">
                <button onclick="handleAdminDeleteKey('${k.id}')" class="text-red-400 hover:underline text-[11px]">Удалить</button>
            </td>
        </tr>
    `).join('');
}

function renderAdminPromos(promos) {
    const tbody = document.getElementById('adm-promos-tbody');
    if (!tbody) return;

    tbody.innerHTML = promos.map(p => `
        <tr class="border-b border-white/5 hover:bg-white/[0.02]">
            <td class="py-2.5 text-[#8cb8ff] font-bold">${p.code}</td>
            <td class="py-2.5 text-emerald-400">${p.discountPercent}%</td>
            <td class="py-2.5 text-slate-400">${formatDateTime(p.expiresAt)}</td>
            <td class="py-2.5 text-white">${p.usedCount || 0}</td>
            <td class="py-2.5 text-slate-400">${p.mediaUid ? `#${p.mediaUid}` : '—'}</td>
            <td class="py-2.5 text-right">
                <button onclick="handleAdminDeletePromo('${p.code}')" class="text-red-400 hover:underline text-[11px]">Удалить</button>
            </td>
        </tr>
    `).join('');
}

async function handleAdminCreatePromo(e) {
    e.preventDefault();
    const code = document.getElementById('adm-promo-code').value.trim();
    const discountPercent = parseInt(document.getElementById('adm-promo-discount').value, 10);
    const durationDays = parseInt(document.getElementById('adm-promo-duration').value, 10);
    const mediaUid = document.getElementById('adm-promo-media').value.trim() || null;

    try {
        await window.api.adminCreatePromo({ code, discountPercent, durationDays, mediaUid });
        showToast(`Промокод ${code} успешно создан!`, 'success');
        document.getElementById('adm-promo-code').value = '';
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminDeletePromo(code) {
    if (!confirm(`Удалить промокод ${code}?`)) return;
    try {
        await window.api.adminDeletePromo(code);
        showToast('Промокод удален', 'info');
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminChangeRole(uid, role) {
    try {
        await window.api.adminChangeRole(uid, role);
        showToast(`Роль пользователя UID #${uid} изменена на ${role}`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminGenKeys(e) {
    e.preventDefault();
    const duration = document.getElementById('gen-duration').value;
    const count = document.getElementById('gen-count').value;
    const note = document.getElementById('gen-note').value;

    try {
        const res = await window.api.adminGenerateKeys(count, duration, note);
        showToast(`Создано ключей: ${res.keys.length}`, 'success');
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminDeleteKey(id) {
    try {
        await window.api.adminDeleteKey(id);
        showToast('Ключ удален', 'info');
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminGiveSub(uid) {
    const days = prompt('Введите количество дней подписки (или "lifetime" для бессрочной, "none" для снятия):', '30');
    if (!days) return;

    let type = 'custom';
    let d = parseInt(days, 10);
    if (days.toLowerCase() === 'lifetime') {
        type = 'lifetime';
        d = 0;
    } else if (days.toLowerCase() === 'none') {
        type = 'none';
        d = 0;
    }

    try {
        await window.api.adminSetSubscription(uid, type, d);
        showToast(`Подписка для UID #${uid} обновлена!`, 'success');
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminResetUserHwid(uid) {
    try {
        await window.api.adminResetHwid(uid);
        showToast(`HWID пользователя UID #${uid} сброшен`, 'success');
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleAdminToggleBan(uid) {
    const reason = prompt('Причина блокировки (или оставьте пустым для разбана):', 'Нарушение правил');
    try {
        await window.api.adminToggleBan(uid, reason);
        showToast(`Статус блокировки пользователя UID #${uid} изменен`, 'info');
        loadAdminData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function switchAdminSubTab(tab) {
    const tabUsers = document.getElementById('adm-tab-users-view');
    const tabKeys = document.getElementById('adm-tab-keys-view');
    const btnUsers = document.getElementById('btn-adm-tab-users');
    const btnKeys = document.getElementById('btn-adm-tab-keys');

    if (tab === 'users') {
        tabUsers.classList.remove('hidden');
        tabKeys.classList.add('hidden');
        btnUsers.className = 'text-[#8cb8ff] border-b-2 border-[#8cb8ff] pb-1';
        btnKeys.className = 'text-slate-400 hover:text-white pb-1';
    } else {
        tabKeys.classList.remove('hidden');
        tabUsers.classList.add('hidden');
        btnKeys.className = 'text-[#8cb8ff] border-b-2 border-[#8cb8ff] pb-1';
        btnUsers.className = 'text-slate-400 hover:text-white pb-1';
    }
}

// ─── PUBLIC STATS ────────────────────────────────────────────────────────────

async function loadPublicStats() {
    try {
        const res = await window.api.getPublicStats();
        if (res.stats) {
            const u = document.getElementById('stat-users');
            if (u) u.textContent = res.stats.totalUsers.toLocaleString('ru-RU');
        }
    } catch (e) {}
}

// ─── MODAL CONTROLS ──────────────────────────────────────────────────────────

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        lucide.createIcons({ root: modal });
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});
