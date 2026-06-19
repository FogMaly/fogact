const AppState = {
  currentTab: 'dashboard',
  currentPanel: 'dashboard',
  currentService: 'all',
  users: [],
  codes: [],
  stats: {},
  settings: null,
  filters: {
    users: { status: '', search: '' },
    codes: { status: '', search: '' }
  },
  bindings: {
    users: false,
    codes: false,
    settings: false,
    shell: false
  }
};

const API = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json().catch(() => ({ success: false, message: '响应解析失败' }));
    if (response.status === 401) {
      throw new Error(data.message || '未授权');
    }
    return data;
  },

  checkAuth() {
    return this.request('/api/check-auth', { method: 'GET' });
  },

  login(password) {
    return this.request('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },

  logout() {
    return this.request('/api/logout', { method: 'POST' });
  },

  getStats(params = {}) {
    const query = new URLSearchParams();
    if (params.service) query.set('service', params.service);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/stats${suffix}`, { method: 'GET' });
  },

  getUsers(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.service) query.set('service', params.service);
    return this.request(`/api/users?${query.toString()}`, { method: 'GET' });
  },

  createUser(userData) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  updateUser(id, userData) {
    return this.request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  },

  deleteUser(id) {
    return this.request(`/api/users/${id}`, { method: 'DELETE' });
  },

  getCodes(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.service) query.set('service', params.service);
    return this.request(`/api/codes?${query.toString()}`, { method: 'GET' });
  },

  createCode(codeData) {
    return this.request('/api/codes', {
      method: 'POST',
      body: JSON.stringify(codeData)
    });
  },

  updateCode(id, codeData) {
    return this.request(`/api/codes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(codeData)
    });
  },

  deleteCode(id) {
    return this.request(`/api/codes/${id}`, { method: 'DELETE' });
  },

  getActivity() {
    return this.request('/api/activity', { method: 'GET' });
  },

  getSettings() {
    return this.request('/api/settings', { method: 'GET' });
  },

  updateSettings(settings) {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  testUpstream(upstream) {
    return this.request('/api/settings/upstream/test', {
      method: 'POST',
      body: JSON.stringify({ upstream })
    });
  }
};

function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value, withTime = false) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return withTime ? date.toLocaleString('zh-CN') : date.toLocaleDateString('zh-CN');
}

function getUserStatusMeta(user) {
  const key = user.statusKey || 'inactive';
  const meta = {
    active: { label: user.statusLabel || '活跃', className: 'bg-green-50 text-green-700' },
    inactive: { label: user.statusLabel || '待激活', className: 'bg-amber-50 text-amber-700' },
    disabled: { label: user.statusLabel || '已禁用', className: 'bg-error-container text-on-error-container' }
  };
  return meta[key] || meta.inactive;
}

function getCodeStatusMeta(code) {
  const key = code.status || 'unused';
  const meta = {
    unused: { label: code.statusLabel || '未激活', className: 'bg-amber-50 text-amber-700' },
    active: { label: code.statusLabel || '活跃', className: 'bg-green-50 text-green-700' },
    used: { label: code.statusLabel || '活跃', className: 'bg-green-50 text-green-700' },
    disabled: { label: code.statusLabel || '已禁用', className: 'bg-error-container text-on-error-container' },
    expired: { label: code.statusLabel || '已过期', className: 'bg-error-container text-on-error-container' },
    merged: { label: code.statusLabel || '已注销', className: 'bg-surface-container-high text-on-surface-variant' }
  };
  return meta[key] || meta.unused;
}

function getCodeBillingLabel(code) {
  const billingType = code.billingType || code.quota?.billingType || code.quota?.type || code.type || 'quota';
  const cycleType = code.cycleType || code.quota?.cycleType || code.quota?.type || code.type || 'fixed';
  const unit = code.quotaUnit || code.quota?.unit || 'tokens';
  const billingLabel = { duration: '周期卡', monthly: '周期卡', quota: '额度卡', fixed: '额度卡', count: '次数卡' }[billingType] || billingType;
  const cycleLabel = { monthly: '月度', daily: '日包', fixed: '固定' }[cycleType] || cycleType;
  return `${billingLabel} · ${cycleLabel} · ${unit}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const SERVICE_OPTIONS = [
  { key: 'codex', label: 'Codex', navLabel: 'Codex', icon: 'terminal' },
  { key: 'claude', label: 'Claude Code', navLabel: 'ClaudeCode', icon: 'code_blocks' }
];

const ROUTES = {
  dashboard: { key: 'dashboard', panel: 'dashboard', title: '概览', service: 'all', section: '仪表盘' },
  users: { key: 'users', panel: 'users', title: '用户管理', service: 'all', section: '仪表盘' },
  codes: { key: 'codes', panel: 'codes', title: '激活码管理', service: 'all', section: '仪表盘' },
  'codex-users': { key: 'codex-users', panel: 'users', title: 'Codex 用户管理', service: 'codex', section: 'Codex' },
  'codex-codes': { key: 'codex-codes', panel: 'codes', title: 'Codex 激活码创建', service: 'codex', section: 'Codex' },
  'claude-users': { key: 'claude-users', panel: 'users', title: 'ClaudeCode 用户管理', service: 'claude', section: 'ClaudeCode' },
  'claude-codes': { key: 'claude-codes', panel: 'codes', title: 'ClaudeCode 激活码创建', service: 'claude', section: 'ClaudeCode' },
  logs: { key: 'logs', panel: 'logs', title: '系统日志', service: 'all', section: '系统' },
  settings: { key: 'settings', panel: 'settings', title: '系统设置', service: 'all', section: '系统' }
};

function getRoute(tabName) {
  return ROUTES[tabName] || ROUTES.dashboard;
}

function getActiveService() {
  return AppState.currentService && AppState.currentService !== 'all' ? AppState.currentService : '';
}

function getServiceOption(keyOrLabel) {
  const value = String(keyOrLabel || '').toLowerCase();
  if (value.includes('codex')) return SERVICE_OPTIONS.find((item) => item.key === 'codex');
  if (value.includes('claude')) return SERVICE_OPTIONS.find((item) => item.key === 'claude');
  return null;
}

function getActiveServiceOption() {
  return getServiceOption(getActiveService());
}

function getServiceOptionsForScope(currentValue = '') {
  const active = getActiveServiceOption();
  const selected = getServiceOption(currentValue);
  if (active) return [active];
  if (selected && !SERVICE_OPTIONS.some((item) => item.key === selected.key)) {
    return [...SERVICE_OPTIONS, selected];
  }
  return SERVICE_OPTIONS;
}

const DEFAULT_SETTINGS = {
  site: {
    siteName: 'FogAct',
    siteDescription: '统一管理用户、激活码与订阅配置。',
    siteUrl: 'https://example.com',
    logoUrl: '',
    forceHttps: true,
    stopRegister: false
  },
  security: {
    sessionTimeout: 24,
    loginNotice: '请妥善保管管理员密码。',
    operationConfirm: true,
    ipWhitelist: '',
    auditMode: true
  },
  subscription: {
    subscribeUrl: 'https://example.com/sub',
    tokenLength: 32,
    defaultQuota: 1000000,
    defaultDuration: 30,
    autoDisableExpired: true
  },
  invite: {
    inviteEnabled: true,
    inviteReward: 10,
    commissionRate: 15,
    settleCycle: 'monthly'
  },
  email: {
    smtpHost: '',
    smtpPort: 587,
    senderName: 'FogAct',
    senderEmail: '',
    enableTls: true
  },
  telegram: {
    botToken: '',
    chatId: '',
    notifyNewUser: true,
    notifyLowQuota: true
  },
  app: {
    appName: 'FogAct Client',
    appDownloadUrl: '',
    iosUrl: '',
    androidUrl: '',
    latestVersion: '1.0.0'
  },
  upstream: {
    provider: 'newapi',
    baseUrl: '',
    apiKey: '',
    apiKeyMasked: '',
    apiKeyConfigured: false,
    claudeBaseUrl: '',
    codexBaseUrl: '',
    timeoutMs: 10000,
    configPath: '',
    configured: false
  }
};

const UI = {
  initSidebar() {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        this.switchTab(item.dataset.tab);
      });
    });
    this.updateNavActive(AppState.currentTab);
  },

  updateNavActive(tab) {
    document.querySelectorAll('.nav-item').forEach((item) => {
      const active = item.dataset.tab === tab;
      item.classList.toggle('text-primary', active);
      item.classList.toggle('font-bold', active);
      item.classList.toggle('bg-surface-container-lowest', active);
      item.classList.toggle('shadow-sm', active);
      item.classList.toggle('text-on-surface-variant', !active);
    });
  },

  switchTab(tabName) {
    const route = getRoute(tabName);
    AppState.currentTab = route.key;
    AppState.currentPanel = route.panel;
    AppState.currentService = route.service || 'all';

    this.updateNavActive(route.key);
    document.getElementById('page-title').textContent = route.title;
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
    document.getElementById(`${route.panel}-panel`)?.classList.remove('hidden');
    this.updatePanelContext(route);
    window.location.hash = route.key;
    return this.loadTabData(route.panel);
  },

  updatePanelContext(route) {
    const service = getActiveServiceOption();
    const scopeText = service ? service.navLabel : '全局';
    const usersTitle = document.getElementById('users-panel-title');
    const usersSubtitle = document.getElementById('users-panel-subtitle');
    const codesTitle = document.getElementById('codes-panel-title');
    const codesSubtitle = document.getElementById('codes-panel-subtitle');
    const addUserBtn = document.getElementById('add-user-btn-label');
    const addCodeBtn = document.getElementById('add-code-btn-label');

    if (usersTitle) usersTitle.textContent = service ? `${service.navLabel} 用户列表` : '全局用户列表';
    if (usersSubtitle) usersSubtitle.textContent = service ? `只显示并创建 ${service.label} 用户` : '汇总所有平台用户';
    if (codesTitle) codesTitle.textContent = service ? `${service.navLabel} 激活码` : '全局激活码列表';
    if (codesSubtitle) codesSubtitle.textContent = service ? `此处生成的 CDK 只能用于 ${service.label} 模型` : '查看所有平台 CDK';
    if (addUserBtn) addUserBtn.textContent = service ? `添加 ${scopeText} 用户` : '添加用户';
    if (addCodeBtn) addCodeBtn.textContent = service ? `生成 ${scopeText} CDK` : '生成激活码';
  },

  async loadTabData(panelName) {
    if (panelName === 'dashboard') return Dashboard.render();
    if (panelName === 'users') return UserManagement.render();
    if (panelName === 'codes') return CodeManagement.render();
    if (panelName === 'logs') return LogsManagement.render();
    if (panelName === 'settings') return SettingsManagement.render();
  },

  initThemeToggle() {
    const button = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('fogact_theme') || localStorage.getItem('admin_theme') || 'system';
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = savedTheme === 'dark' || (savedTheme === 'system' && prefersDark);

    html.classList.toggle('dark', initialDark);
    html.style.colorScheme = initialDark ? 'dark' : 'light';
    button.querySelector('.material-symbols-outlined').textContent = initialDark ? 'dark_mode' : 'light_mode';
    button.setAttribute('aria-label', initialDark ? '切换浅色模式' : '切换暗黑模式');

    button.addEventListener('click', () => {
      html.classList.toggle('dark');
      const isDark = html.classList.contains('dark');
      button.querySelector('.material-symbols-outlined').textContent = isDark ? 'dark_mode' : 'light_mode';
      button.setAttribute('aria-label', isDark ? '切换浅色模式' : '切换暗黑模式');
      html.style.colorScheme = isDark ? 'dark' : 'light';
      localStorage.setItem('fogact_theme', isDark ? 'dark' : 'light');
    });
  },

  showNotification(message, type = 'info') {
    const palette = {
      success: 'bg-green-50 border-green-500 text-green-800',
      error: 'bg-error-container border-error text-on-error-container',
      info: 'bg-primary-fixed border-primary text-on-primary-fixed',
      warning: 'bg-warning-container border-warning text-on-surface'
    };

    const icons = {
      success: 'check_circle',
      error: 'error',
      info: 'info',
      warning: 'warning'
    };

    const node = document.createElement('div');
    node.className = `fixed top-4 right-4 z-50 rounded-xl border px-5 py-3 shadow-lg ${palette[type] || palette.info} flex items-center gap-2`;
    node.innerHTML = `
      <span class="material-symbols-outlined">${icons[type] || icons.info}</span>
      <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2500);
  },

  showModal(title, content, actions, onMount) {
    this.hideModal();
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 modal-backdrop';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden modal-content">
        <div class="flex items-center justify-between border-b border-outline-variant/20 p-6">
          <h2 class="text-xl font-bold text-on-surface">${title}</h2>
          <button data-close-modal class="p-2 rounded-xl hover:bg-surface-container transition-all">
            <span class="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">${content}</div>
        ${actions ? `<div class="flex justify-end gap-3 border-t border-outline-variant/20 p-6">${actions}</div>` : ''}
      </div>
    `;

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-close-modal]')) {
        this.hideModal();
      }
    });

    document.getElementById('modal-root').appendChild(modal);

    if (onMount) {
      setTimeout(() => onMount(), 50);
    }
  },

  hideModal() {
    const modal = document.querySelector('#modal-root .fixed');
    if (modal) {
      modal.classList.add('exit');
      modal.querySelector('.modal-content')?.classList.add('exit');
      setTimeout(() => modal.remove(), 150);
    }
  },

  closeModal() {
    this.hideModal();
  }
};

const Dashboard = {
  async render() {
    try {
      const [statsResult, activityResult] = await Promise.all([API.getStats({ service: getActiveService() }), API.getActivity()]);
      if (statsResult.success) {
        AppState.stats = statsResult.data || {};
        this.renderStats();
      }
      if (activityResult.success) {
        this.renderActivity(activityResult.data || []);
      }
      this.bindQuickActions();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('概览加载失败', 'error');
    }
  },

  renderStats() {
    const stats = AppState.stats;
    const cards = [
      { label: '总用户数', value: stats.totalUsers || 0, icon: 'group', color: 'primary', sub: '全部用户' },
      { label: '活跃用户', value: stats.activeUsers || 0, icon: 'trending_up', color: 'tertiary', sub: '当前活跃状态' },
      { label: '总激活码', value: stats.totalCodes || 0, icon: 'key', color: 'secondary', sub: `未激活 ${stats.unusedCodes || 0}` },
      { label: '已过期', value: stats.expiredCodes || 0, icon: 'schedule', color: 'error', sub: `已注销 ${stats.mergedCodes || 0}` }
    ];

    const container = document.querySelector('#dashboard-panel .grid');
    container.innerHTML = cards.map((card, index) => `
      <div class="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/20 interactive-card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">${card.label}</p>
            <h2 class="text-3xl font-bold text-on-surface">${card.value}</h2>
            <p class="text-xs text-on-surface-variant mt-2">${card.sub}</p>
          </div>
          <div class="w-12 h-12 rounded-xl bg-${card.color}-fixed/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-${card.color} text-2xl">${card.icon}</span>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderActivity(activities) {
    const container = document.getElementById('recent-activity');
    if (!activities.length) {
      container.innerHTML = '<p class="text-sm text-on-surface-variant text-center py-4">暂无活动记录</p>';
      return;
    }

    container.innerHTML = activities.slice(0, 6).map((activity, index) => `
      <div class="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-container-low transition-all">
        <div class="w-8 h-8 rounded-full bg-primary-fixed/20 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary text-sm">history</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-on-surface">${escapeHtml(activity.action || '-')}</p>
          <p class="text-xs text-on-surface-variant mt-1">${escapeHtml(activity.user || '-')} · ${formatDate(activity.timestamp, true)}</p>
        </div>
        <span class="px-2 py-1 rounded-lg text-xs font-medium ${activity.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-error-container text-on-error-container'}">
          ${activity.status === 'success' ? '成功' : '失败'}
        </span>
      </div>
    `).join('');
  },

  bindQuickActions() {
    document.getElementById('quick-add-user')?.addEventListener('click', () => {
      UI.switchTab('users');
      UserManagement.showUserModal();
    }, { once: true });

    document.getElementById('quick-add-code')?.addEventListener('click', () => {
      UI.switchTab('codex-codes');
      CodeManagement.showCreateCodeModal();
    }, { once: true });

    document.getElementById('quick-settings')?.addEventListener('click', () => {
      UI.switchTab('settings');
    }, { once: true });
  }
};

const UserManagement = {
  async render() {
    this.bindEvents();
    await this.loadUsers();
  },

  bindEvents() {
    if (AppState.bindings.users) return;
    AppState.bindings.users = true;

    document.getElementById('add-user-btn')?.addEventListener('click', () => this.showUserModal());
    document.getElementById('user-status-filter')?.addEventListener('change', (event) => {
      AppState.filters.users.status = event.target.value;
      this.loadUsers();
    });
    document.getElementById('user-search')?.addEventListener('input', debounce((event) => {
      AppState.filters.users.search = event.target.value.trim();
      this.loadUsers();
    }));
  },

  async loadUsers() {
    try {
      const result = await API.getUsers({ ...AppState.filters.users, service: getActiveService() });
      if (!result.success) {
        UI.showNotification(result.message || '加载用户失败', 'error');
        return;
      }
      AppState.users = result.data || [];
      this.renderTable();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('加载用户失败', 'error');
    }
  },

  renderTable() {
    const container = document.getElementById('users-table-container');
    if (!AppState.users.length) {
      container.innerHTML = '<p class="text-on-surface-variant text-center py-8">暂无用户数据，可点击右上角添加用户。</p>';
      return;
    }

    container.innerHTML = `
      <table class="w-full">
        <thead>
          <tr class="bg-surface-container-high">
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">用户名</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">邮箱</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">服务类型</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">状态</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">创建时间</th>
            <th class="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">操作</th>
          </tr>
        </thead>
        <tbody>
          ${AppState.users.map((user, index) => {
            const status = getUserStatusMeta(user);
            return `
              <tr class="${index % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low'} hover:bg-surface-container transition-all">
                <td class="px-4 py-3 text-sm font-medium text-on-surface">${escapeHtml(user.username)}</td>
                <td class="px-4 py-3 text-sm text-on-surface-variant">${escapeHtml(user.email)}</td>
                <td class="px-4 py-3 text-sm text-on-surface-variant">${escapeHtml(user.serviceLabel || user.service)}</td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded-lg text-xs font-medium ${status.className}">${status.label}</span></td>
                <td class="px-4 py-3 text-sm text-on-surface-variant">${formatDate(user.registeredAt || user.createdAt)}</td>
                <td class="px-4 py-3 text-right">
                  <button data-user-edit="${escapeHtml(user.id)}" class="p-1 text-primary hover:bg-primary-fixed/20 rounded-lg transition-all">
                    <span class="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button data-user-delete="${escapeHtml(user.id)}" class="p-1 text-error hover:bg-error-container/20 rounded-lg transition-all ml-1">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('[data-user-edit]').forEach((button) => {
      button.addEventListener('click', () => this.editUser(button.dataset.userEdit));
    });
    container.querySelectorAll('[data-user-delete]').forEach((button) => {
      button.addEventListener('click', () => this.deleteUser(button.dataset.userDelete));
    });
  },

  showUserModal(user = null) {
    const isEdit = Boolean(user);
    const content = `
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">用户名</label>
          <input id="user-username" type="text" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" value="${escapeHtml(user?.username || '')}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">邮箱</label>
          <input id="user-email" type="email" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" value="${escapeHtml(user?.email || '')}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">服务类型</label>
          <select id="user-service" ${getActiveService() ? 'disabled' : ''} class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
            ${getServiceOptionsForScope(user?.serviceLabel || user?.service).map((service) => `<option value="${service.label}" ${user?.serviceKey === service.key || user?.serviceLabel === service.label || user?.service === service.label ? 'selected' : ''}>${service.label}</option>`).join('')}
          </select>
          ${getActiveService() ? '<p class="mt-2 text-xs text-on-surface-variant">当前平台上下文已锁定，保存后只归属该平台。</p>' : ''}
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">状态</label>
          <select id="user-status" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
            <option value="活跃" ${user?.statusLabel === '活跃' ? 'selected' : ''}>活跃</option>
            <option value="待激活" ${!user || user?.statusLabel === '待激活' ? 'selected' : ''}>待激活</option>
            <option value="已禁用" ${user?.statusLabel === '已禁用' ? 'selected' : ''}>已禁用</option>
          </select>
        </div>
      </div>
    `;

    const actions = `
      <button data-close-modal class="px-4 py-2 text-on-surface-variant hover:bg-surface-container rounded-xl transition-all">取消</button>
      <button id="save-user-btn" class="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold hover:shadow-md transition-all">${isEdit ? '保存修改' : '创建用户'}</button>
    `;

    UI.showModal(isEdit ? '编辑用户' : '添加用户', content, actions);
    document.getElementById('save-user-btn')?.addEventListener('click', () => this.saveUser(user?.id || null));
  },

  editUser(id) {
    const user = AppState.users.find((item) => item.id === id);
    if (user) this.showUserModal(user);
  },

  async saveUser(id) {
    const payload = {
      username: document.getElementById('user-username').value.trim(),
      email: document.getElementById('user-email').value.trim(),
      service: getActiveServiceOption()?.label || document.getElementById('user-service').value,
      status: document.getElementById('user-status').value
    };

    if (!payload.username || !payload.email) {
      UI.showNotification('用户名和邮箱不能为空', 'error');
      return;
    }

    try {
      const result = id ? await API.updateUser(id, payload) : await API.createUser(payload);
      if (!result.success) {
        UI.showNotification(result.message || '保存失败', 'error');
        return;
      }
      UI.hideModal();
      UI.showNotification(id ? '用户已更新' : '用户已创建', 'success');
      await this.loadUsers();
      await Dashboard.render();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('保存失败', 'error');
    }
  },

  async deleteUser(id) {
    if (!confirm('确定要删除这个用户吗？')) return;
    try {
      const result = await API.deleteUser(id);
      if (!result.success) {
        UI.showNotification(result.message || '用户删除失败', 'error');
        return;
      }
      UI.showNotification('用户已删除', 'success');
      await this.loadUsers();
      await Dashboard.render();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('用户删除失败', 'error');
    }
  }
};

const CodeManagement = {
  async render() {
    this.bindEvents();
    await this.loadCodes();
  },

  bindEvents() {
    if (AppState.bindings.codes) return;
    AppState.bindings.codes = true;

    document.getElementById('add-code-btn')?.addEventListener('click', () => this.showCreateCodeModal());
    document.getElementById('export-codes-btn')?.addEventListener('click', () => this.exportCodes());
    document.getElementById('code-status-filter')?.addEventListener('change', (event) => {
      AppState.filters.codes.status = event.target.value;
      this.loadCodes();
    });
    document.getElementById('code-search')?.addEventListener('input', debounce((event) => {
      AppState.filters.codes.search = event.target.value.trim();
      this.loadCodes();
    }));
  },

  async loadCodes() {
    try {
      const result = await API.getCodes({ ...AppState.filters.codes, service: getActiveService() });
      if (!result.success) {
        UI.showNotification(result.message || '加载激活码失败', 'error');
        return;
      }
      AppState.codes = result.data || [];
      this.renderTable();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('加载激活码失败', 'error');
    }
  },

  renderTable() {
    const container = document.getElementById('codes-table-container');
    if (!AppState.codes.length) {
      container.innerHTML = '<p class="text-on-surface-variant text-center py-8">暂无激活码数据，可点击右上角生成 CDK。</p>';
      return;
    }

    container.innerHTML = `
      <table class="w-full">
        <thead>
          <tr class="bg-surface-container-high">
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">激活码</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">服务类型</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">叠卡规格</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">状态</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">创建时间</th>
            <th class="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">过期时间</th>
            <th class="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">操作</th>
          </tr>
        </thead>
        <tbody>
          ${AppState.codes.map((code, index) => {
            const status = getCodeStatusMeta(code);
            return `
              <tr class="${index % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low'} hover:bg-surface-container transition-all">
                <td class="px-4 py-3 text-sm font-mono text-on-surface">
                  <div class="flex items-center gap-2">
                    <span>${escapeHtml(code.code)}</span>
                    <button data-code-copy="${escapeHtml(code.code)}" class="p-1 text-on-surface-variant hover:text-primary hover:bg-primary-fixed/20 rounded-lg transition-all" title="复制激活码">
                      <span class="material-symbols-outlined text-sm">content_copy</span>
                    </button>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-on-surface-variant">${escapeHtml(code.serviceLabel || code.service)}</td>
                <td class="px-4 py-3 text-xs text-on-surface-variant">
                  <div>${escapeHtml(getCodeBillingLabel(code))}</div>
                  <div class="mt-1 opacity-70">${escapeHtml(code.subServiceType || code.sub_service_type || code.category || '标准运营')}</div>
                </td>
                <td class="px-4 py-3"><span class="px-2 py-1 rounded-lg text-xs font-medium ${status.className}">${status.label}</span></td>
                <td class="px-4 py-3 text-sm text-on-surface-variant">${formatDate(code.createdAt)}</td>
                <td class="px-4 py-3 text-sm text-on-surface-variant">${formatDate(code.expiresAt)}</td>
                <td class="px-4 py-3 text-right">
                  <button data-code-edit="${escapeHtml(code.id)}" class="p-1 text-primary hover:bg-primary-fixed/20 rounded-lg transition-all">
                    <span class="material-symbols-outlined text-sm">edit</span>
                  </button>
                  <button data-code-delete="${escapeHtml(code.id)}" class="p-1 text-error hover:bg-error-container/20 rounded-lg transition-all ml-1">
                    <span class="material-symbols-outlined text-sm">delete</span>
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('[data-code-edit]').forEach((button) => {
      button.addEventListener('click', () => this.showEditCodeModal(button.dataset.codeEdit));
    });
    container.querySelectorAll('[data-code-delete]').forEach((button) => {
      button.addEventListener('click', () => this.deleteCode(button.dataset.codeDelete));
    });
    container.querySelectorAll('[data-code-copy]').forEach((button) => {
      button.addEventListener('click', () => this.copyCode(button.dataset.codeCopy));
    });
  },

  async copyCode(code) {
    try {
      // 尝试使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        UI.showNotification('激活码已复制到剪贴板', 'success');
      } else {
        // 降级方案：使用传统方法
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        try {
          const successful = document.execCommand('copy');
          if (successful) {
            UI.showNotification('激活码已复制到剪贴板', 'success');
          } else {
            throw new Error('execCommand failed');
          }
        } finally {
          document.body.removeChild(textarea);
        }
      }
    } catch (error) {
      console.error('复制失败:', error);
      // 显示激活码让用户手动复制
      this.showCopyFallback(code);
    }
  },

  showCopyFallback(code) {
    const content = `
      <div class="space-y-4">
        <p class="text-sm text-on-surface-variant">请手动复制以下激活码：</p>
        <div class="bg-surface-container-low rounded-xl p-4">
          <input
            type="text"
            value="${escapeHtml(code)}"
            readonly
            id="fallback-code-input"
            class="w-full bg-transparent border-none text-center font-mono text-lg text-on-surface outline-none"
            onclick="this.select()"
          />
        </div>
        <p class="text-xs text-on-surface-variant text-center">点击输入框可全选激活码</p>
      </div>
    `;

    UI.showModal('复制激活码', content, null, () => {
      const input = document.getElementById('fallback-code-input');
      if (input) {
        input.select();
        input.focus();
      }
    });
  },

  exportCodes() {
    if (!AppState.codes.length) {
      UI.showNotification('没有可导出的激活码', 'warning');
      return;
    }

    const content = `
      <div class="space-y-4">
        <p class="text-sm text-on-surface-variant">选择导出格式：</p>
        <div class="space-y-2">
          <button id="export-txt" class="w-full px-4 py-3 bg-surface-container-low hover:bg-surface-container rounded-xl text-left transition-all">
            <div class="font-medium text-on-surface">纯文本 (.txt)</div>
            <div class="text-xs text-on-surface-variant mt-1">每行一个激活码，适合批量导入</div>
          </button>
          <button id="export-csv" class="w-full px-4 py-3 bg-surface-container-low hover:bg-surface-container rounded-xl text-left transition-all">
            <div class="font-medium text-on-surface">CSV 表格 (.csv)</div>
            <div class="text-xs text-on-surface-variant mt-1">包含完整信息，可用 Excel 打开</div>
          </button>
          <button id="export-json" class="w-full px-4 py-3 bg-surface-container-low hover:bg-surface-container rounded-xl text-left transition-all">
            <div class="font-medium text-on-surface">JSON 数据 (.json)</div>
            <div class="text-xs text-on-surface-variant mt-1">完整数据结构，适合程序处理</div>
          </button>
        </div>
        <div class="text-xs text-on-surface-variant">
          当前筛选条件下共 ${AppState.codes.length} 个激活码
        </div>
      </div>
    `;

    UI.showModal('导出激活码', content, null, () => {
      document.getElementById('export-txt')?.addEventListener('click', () => {
        this.downloadCodes('txt');
        UI.closeModal();
      });
      document.getElementById('export-csv')?.addEventListener('click', () => {
        this.downloadCodes('csv');
        UI.closeModal();
      });
      document.getElementById('export-json')?.addEventListener('click', () => {
        this.downloadCodes('json');
        UI.closeModal();
      });
    });
  },

  downloadCodes(format) {
    const timestamp = new Date().toISOString().slice(0, 10);
    let content = '';
    let filename = '';
    let mimeType = '';

    switch (format) {
      case 'txt':
        content = AppState.codes.map(c => c.code).join('\n');
        filename = `activation-codes-${timestamp}.txt`;
        mimeType = 'text/plain';
        break;

      case 'csv':
        const headers = ['激活码', '服务类型', '状态', '创建时间', '过期时间', '使用者'];
        const rows = AppState.codes.map(c => [
          c.code,
          c.serviceLabel || c.service,
          c.statusLabel || c.status,
          formatDate(c.createdAt),
          formatDate(c.expiresAt),
          c.usedBy || ''
        ]);
        content = [headers, ...rows].map(row => row.join(',')).join('\n');
        filename = `activation-codes-${timestamp}.csv`;
        mimeType = 'text/csv;charset=utf-8;';
        break;

      case 'json':
        content = JSON.stringify(AppState.codes, null, 2);
        filename = `activation-codes-${timestamp}.json`;
        mimeType = 'application/json';
        break;
    }

    const blob = new Blob(['\ufeff' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    UI.showNotification(`已导出 ${AppState.codes.length} 个激活码`, 'success');
  },

  showCreateCodeModal() {
    const serviceChoices = getServiceOptionsForScope();
    const content = `
      <div class="space-y-4">
        <!-- CDK类型 -->
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">CDK 类型</label>
          <select id="code-type" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
            <option value="monthly">月度订阅</option>
            <option value="fixed">固定额度</option>
          </select>
        </div>

        <!-- 叠卡规格 -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">套餐类型</label>
            <input id="code-sub-service-type" type="text" value="标准运营" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">额度单位</label>
            <select id="code-quota-unit" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
              <option value="tokens">tokens</option>
              <option value="requests">requests</option>
              <option value="balance">统一余额</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">刷新时区</label>
            <input value="Asia/Shanghai" disabled class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none opacity-80" />
          </div>
        </div>

        <!-- 服务渠道 -->
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">服务渠道</label>
          <div class="grid grid-cols-2 gap-2" id="service-channels">
            ${serviceChoices.map((service, index) => `
              <label class="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl ${getActiveService() ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:bg-surface-container'} transition-all">
                <input type="checkbox" value="${service.label}" class="service-checkbox" ${index === 0 || getActiveService() ? 'checked' : ''} ${getActiveService() ? 'disabled' : ''} />
                <span class="material-symbols-outlined text-sm text-primary">${service.icon}</span>
                <span class="text-sm text-on-surface">${service.label}</span>
              </label>
            `).join('')}
          </div>
          <p class="text-xs text-on-surface-variant mt-2">
            ${getActiveServiceOption() ? `当前层级锁定为 ${getActiveServiceOption().label}，生成的激活码只能激活该平台模型。` : '全局创建时可选择 Codex 或 Claude Code。'}
          </p>
        </div>

        <!-- 月度订阅配置 -->
        <div id="monthly-config">
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-on-surface mb-2">每日额度（次数）</label>
              <input id="code-daily-quota" type="number" min="1" value="100" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-on-surface mb-2">额度刷新时间</label>
              <input id="code-refresh-time" type="time" value="00:00" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-on-surface mb-2">订阅时长（月）</label>
              <input id="code-duration-months" type="number" min="1" value="1" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
            </div>
          </div>
        </div>

        <!-- 固定额度配置 -->
        <div id="fixed-config" style="display:none;">
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-on-surface mb-2">总额度（次数）</label>
              <input id="code-total-quota" type="number" min="1" value="1000" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-on-surface mb-2">有效期（天）</label>
              <input id="code-duration-days" type="number" min="1" value="30" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
            </div>
          </div>
        </div>

        <!-- 生成数量 -->
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">生成数量</label>
          <input id="code-count" type="number" min="1" max="100" value="1" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
          <p class="text-xs text-on-surface-variant mt-1">最多一次生成 100 个</p>
        </div>

        <!-- 备注 -->
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">备注</label>
          <textarea id="code-note" rows="2" placeholder="可选，用于标记此批次激活码的用途" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none"></textarea>
        </div>
      </div>
    `;

    const actions = `
      <button data-close-modal class="px-4 py-2 text-on-surface-variant hover:bg-surface-container rounded-xl transition-all">取消</button>
      <button id="create-code-btn" class="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold hover:shadow-md transition-all">生成激活码</button>
    `;

    UI.showModal('生成激活码', content, actions);

    // 类型切换逻辑
    const typeSelect = document.getElementById('code-type');
    const monthlyConfig = document.getElementById('monthly-config');
    const fixedConfig = document.getElementById('fixed-config');

    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'monthly') {
        monthlyConfig.style.display = 'block';
        fixedConfig.style.display = 'none';
      } else {
        monthlyConfig.style.display = 'none';
        fixedConfig.style.display = 'block';
      }
    });

    document.getElementById('create-code-btn')?.addEventListener('click', () => this.createCode());
  },

  showEditCodeModal(id) {
    const code = AppState.codes.find((item) => item.id === id);
    if (!code) return;

    const content = `
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">激活码</label>
          <input type="text" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" value="${escapeHtml(code.code)}" disabled />
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">服务类型</label>
          <select id="edit-code-service" ${getActiveService() ? 'disabled' : ''} class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
            ${getServiceOptionsForScope(code.serviceLabel || code.service).map((service) => `<option value="${service.label}" ${code.serviceKey === service.key || code.serviceLabel === service.label || code.service === service.label ? 'selected' : ''}>${service.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">状态</label>
          <select id="edit-code-status" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
            <option value="unused" ${code.status === 'unused' ? 'selected' : ''}>未激活</option>
            <option value="active" ${code.status === 'active' || code.status === 'used' ? 'selected' : ''}>活跃</option>
            <option value="disabled" ${code.status === 'disabled' ? 'selected' : ''}>已禁用</option>
            <option value="expired" ${code.status === 'expired' ? 'selected' : ''}>已过期</option>
            <option value="merged" ${code.status === 'merged' ? 'selected' : ''}>已注销</option>
          </select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">计费类型</label>
            <select id="edit-code-billing-type" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
              <option value="duration" ${(code.billingType || code.quota?.billingType || code.quota?.type) === 'duration' || code.quota?.type === 'monthly' ? 'selected' : ''}>周期卡</option>
              <option value="quota" ${(code.billingType || code.quota?.billingType || code.quota?.type || 'quota') === 'quota' || code.quota?.type === 'fixed' ? 'selected' : ''}>额度卡</option>
              <option value="count" ${(code.billingType || code.quota?.billingType) === 'count' ? 'selected' : ''}>次数卡</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">周期类型</label>
            <select id="edit-code-cycle-type" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
              <option value="monthly" ${(code.cycleType || code.quota?.cycleType || code.quota?.type) === 'monthly' ? 'selected' : ''}>月度</option>
              <option value="daily" ${(code.cycleType || code.quota?.cycleType) === 'daily' ? 'selected' : ''}>日包</option>
              <option value="fixed" ${(code.cycleType || code.quota?.cycleType || code.quota?.type || 'fixed') === 'fixed' ? 'selected' : ''}>固定</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">套餐类型</label>
            <input id="edit-code-sub-service-type" type="text" value="${escapeHtml(code.subServiceType || code.sub_service_type || code.category || '标准运营')}" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-on-surface mb-2">额度单位</label>
            <select id="edit-code-quota-unit" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">
              <option value="tokens" ${(code.quotaUnit || code.quota?.unit || 'tokens') === 'tokens' ? 'selected' : ''}>tokens</option>
              <option value="requests" ${(code.quotaUnit || code.quota?.unit) === 'requests' ? 'selected' : ''}>requests</option>
              <option value="balance" ${(code.quotaUnit || code.quota?.unit) === 'balance' ? 'selected' : ''}>统一余额</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">过期时间</label>
          <input id="edit-code-expire" type="date" value="${code.expiresAt ? new Date(code.expiresAt).toISOString().split('T')[0] : ''}" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-on-surface mb-2">备注</label>
          <textarea id="edit-code-note" rows="3" class="w-full px-4 py-2 bg-surface-container-low border-none rounded-xl text-sm outline-none">${escapeHtml(code.notes || '')}</textarea>
        </div>
      </div>
    `;

    const actions = `
      <button data-close-modal class="px-4 py-2 text-on-surface-variant hover:bg-surface-container rounded-xl transition-all">取消</button>
      <button id="update-code-btn" class="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold hover:shadow-md transition-all">保存修改</button>
    `;

    UI.showModal('编辑激活码', content, actions);
    document.getElementById('update-code-btn')?.addEventListener('click', () => this.updateCode(id));
  },

  async createCode() {
    const codeType = document.getElementById('code-type').value;
    const lockedService = getActiveServiceOption();
    const serviceCheckboxes = document.querySelectorAll('.service-checkbox:checked');
    const services = lockedService ? [lockedService.label] : Array.from(serviceCheckboxes).map(cb => cb.value);
    const count = parseInt(document.getElementById('code-count').value, 10);
      const note = document.getElementById('code-note').value.trim();
      const subServiceType = document.getElementById('code-sub-service-type').value.trim() || '标准运营';
      const quotaUnit = document.getElementById('code-quota-unit').value || 'tokens';

    if (!services.length) {
      UI.showNotification('请至少选择一个服务渠道', 'error');
      return;
    }

    if (!count || count < 1 || count > 100) {
      UI.showNotification('生成数量必须在 1-100 之间', 'error');
      return;
    }

    let payload = {};

    if (codeType === 'monthly') {
      const dailyQuota = parseInt(document.getElementById('code-daily-quota').value, 10);
      const refreshTime = document.getElementById('code-refresh-time').value;
      const durationMonths = parseInt(document.getElementById('code-duration-months').value, 10);

      if (!dailyQuota || dailyQuota < 1) {
        UI.showNotification('请输入有效的每日额度', 'error');
        return;
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

      payload = {
        type: 'monthly',
        service: lockedService?.label || services[0],
        services,
        count,
        note,
        duration: durationMonths * 30,
        quota: {
          type: 'monthly',
          billingType: 'duration',
          cycleType: 'monthly',
          unit: quotaUnit,
          resetTimezone: 'Asia/Shanghai',
          dailyQuota,
          dailyLimit: dailyQuota,
          refreshTime,
          used: 0,
          total: dailyQuota * durationMonths * 30,
          periodDays: durationMonths * 30
        },
        billingType: 'duration',
        cycleType: 'monthly',
        quotaUnit,
        resetTimezone: 'Asia/Shanghai',
        subServiceType,
        category: subServiceType
      };
    } else {
      const totalQuota = parseInt(document.getElementById('code-total-quota').value, 10);
      const durationDays = parseInt(document.getElementById('code-duration-days').value, 10);

      if (!totalQuota || totalQuota < 1) {
        UI.showNotification('请输入有效的总额度', 'error');
        return;
      }

      payload = {
        type: 'fixed',
        service: lockedService?.label || services[0],
        services,
        count,
        note,
        duration: durationDays,
        quota: {
          type: 'fixed',
          billingType: 'quota',
          cycleType: 'fixed',
          unit: quotaUnit,
          resetTimezone: 'Asia/Shanghai',
          total: totalQuota,
          used: 0
        },
        billingType: 'quota',
        cycleType: 'fixed',
        quotaUnit,
        resetTimezone: 'Asia/Shanghai',
        subServiceType,
        category: subServiceType
      };
    }

    try {
      const result = await API.createCode(payload);
      if (!result.success) {
        UI.showNotification(result.message || '激活码创建失败', 'error');
        return;
      }
      UI.hideModal();
      UI.showNotification(`成功生成 ${count} 个${codeType === 'monthly' ? '月度' : '固定额度'}激活码`, 'success');
      await this.loadCodes();
      await Dashboard.render();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('激活码创建失败', 'error');
    }
  },

  async updateCode(id) {
    const expiresAt = document.getElementById('edit-code-expire').value;
    const billingType = document.getElementById('edit-code-billing-type').value;
    const cycleType = document.getElementById('edit-code-cycle-type').value;
    const quotaUnit = document.getElementById('edit-code-quota-unit').value;
    const subServiceType = document.getElementById('edit-code-sub-service-type').value.trim() || '标准运营';
    const payload = {
      service: getActiveServiceOption()?.label || document.getElementById('edit-code-service').value,
      status: document.getElementById('edit-code-status').value,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      notes: document.getElementById('edit-code-note').value.trim(),
      billingType,
      cycleType,
      quotaUnit,
      resetTimezone: 'Asia/Shanghai',
      subServiceType,
      category: subServiceType,
      quota: {
        billingType,
        cycleType,
        unit: quotaUnit,
        resetTimezone: 'Asia/Shanghai'
      }
    };

    try {
      const result = await API.updateCode(id, payload);
      if (!result.success) {
        UI.showNotification(result.message || '激活码更新失败', 'error');
        return;
      }
      UI.hideModal();
      UI.showNotification('激活码已更新', 'success');
      await this.loadCodes();
      await Dashboard.render();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('激活码更新失败', 'error');
    }
  },

  async deleteCode(id) {
    if (!confirm('确定要删除这个激活码吗？')) return;
    try {
      const result = await API.deleteCode(id);
      if (!result.success) {
        UI.showNotification(result.message || '激活码删除失败', 'error');
        return;
      }
      UI.showNotification('激活码已删除', 'success');
      await this.loadCodes();
      await Dashboard.render();
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('激活码删除失败', 'error');
    }
  }
};

const LogsManagement = {
  render() {
    document.getElementById('logs-container').innerHTML = '<p class="text-on-surface-variant text-center py-8">暂无日志记录，后续操作会在这里展示。</p>';
  }
};

const SettingsManagement = {
  storageKey: 'fogact_admin_settings_v1',

  sections: [
    {
      key: 'site',
      title: '站点设置',
      icon: 'language',
      description: '站点名称、描述、主域名与注册开关。',
      fields: [
        { key: 'siteName', label: '站点名称', type: 'text' },
        { key: 'siteDescription', label: '站点描述', type: 'textarea', rows: 3 },
        { key: 'siteUrl', label: '站点地址', type: 'url' },
        { key: 'logoUrl', label: 'LOGO URL', type: 'url' },
        { key: 'forceHttps', label: '强制 HTTPS', type: 'checkbox' },
        { key: 'stopRegister', label: '停止新用户注册', type: 'checkbox' }
      ]
    },
    {
      key: 'security',
      title: '安全设置',
      icon: 'security',
      description: '会话超时、操作确认、登录提示和审计策略。',
      fields: [
        { key: 'sessionTimeout', label: '会话超时（小时）', type: 'number', min: 1 },
        { key: 'loginNotice', label: '登录提示', type: 'textarea', rows: 3 },
        { key: 'operationConfirm', label: '高风险操作二次确认', type: 'checkbox' },
        { key: 'ipWhitelist', label: 'IP 白名单', type: 'textarea', rows: 3, placeholder: '每行一个 IP 或网段' },
        { key: 'auditMode', label: '启用审计模式', type: 'checkbox' }
      ]
    },
    {
      key: 'subscription',
      title: '订阅设置',
      icon: 'rss_feed',
      description: '订阅域名、Token 长度、默认配额与有效期。',
      fields: [
        { key: 'subscribeUrl', label: '订阅地址', type: 'url' },
        { key: 'tokenLength', label: 'Token 长度', type: 'number', min: 8 },
        { key: 'defaultQuota', label: '默认配额', type: 'number', min: 0 },
        { key: 'defaultDuration', label: '默认有效期（天）', type: 'number', min: 1 },
        { key: 'autoDisableExpired', label: '自动禁用过期订阅', type: 'checkbox' }
      ]
    },
    {
      key: 'upstream',
      title: '上游 API 设置',
      icon: 'hub',
      description: '配置商户/上游 NewAPI 地址、API Key 和服务专用入口。',
      fields: [
        {
          key: 'provider',
          label: '上游类型',
          type: 'select',
          options: [
            { value: 'newapi', label: 'NewAPI / OneAPI 兼容' }
          ]
        },
        { key: 'baseUrl', label: '上游 API 地址', type: 'url', placeholder: 'https://newapi.example.com' },
        { key: 'apiKey', label: '上游 API Key', type: 'password', placeholder: '留空则保留当前密钥' },
        { key: 'claudeBaseUrl', label: 'Claude 专用地址（可选）', type: 'url', placeholder: '默认使用上游 API 地址' },
        { key: 'codexBaseUrl', label: 'Codex 专用地址（可选）', type: 'url', placeholder: '例如 https://newapi.example.com/v1' },
        { key: 'timeoutMs', label: '请求超时（毫秒）', type: 'number', min: 1000 }
      ]
    },
    {
      key: 'invite',
      title: '邀请与佣金',
      icon: 'person_add',
      description: '邀请开关、邀请奖励、佣金比例和结算周期。',
      fields: [
        { key: 'inviteEnabled', label: '启用邀请体系', type: 'checkbox' },
        { key: 'inviteReward', label: '邀请奖励', type: 'number', min: 0 },
        { key: 'commissionRate', label: '佣金比例（%）', type: 'number', min: 0, max: 100 },
        {
          key: 'settleCycle',
          label: '结算周期',
          type: 'select',
          options: [
            { value: 'weekly', label: '每周' },
            { value: 'monthly', label: '每月' },
            { value: 'quarterly', label: '每季度' }
          ]
        }
      ]
    },
    {
      key: 'email',
      title: '邮件设置',
      icon: 'email',
      description: 'SMTP 服务、发件人和 TLS 开关。',
      fields: [
        { key: 'smtpHost', label: 'SMTP 主机', type: 'text' },
        { key: 'smtpPort', label: 'SMTP 端口', type: 'number', min: 1 },
        { key: 'senderName', label: '发件人名称', type: 'text' },
        { key: 'senderEmail', label: '发件邮箱', type: 'email' },
        { key: 'enableTls', label: '启用 TLS', type: 'checkbox' }
      ]
    },
    {
      key: 'telegram',
      title: 'Telegram 设置',
      icon: 'send',
      description: 'Bot Token、Chat ID 和告警推送策略。',
      fields: [
        { key: 'botToken', label: 'Bot Token', type: 'text' },
        { key: 'chatId', label: 'Chat ID', type: 'text' },
        { key: 'notifyNewUser', label: '新用户注册通知', type: 'checkbox' },
        { key: 'notifyLowQuota', label: '低配额告警通知', type: 'checkbox' }
      ]
    },
    {
      key: 'app',
      title: '应用设置',
      icon: 'phone_android',
      description: '客户端名称、版本和下载地址。',
      fields: [
        { key: 'appName', label: '应用名称', type: 'text' },
        { key: 'latestVersion', label: '当前版本号', type: 'text' },
        { key: 'appDownloadUrl', label: '统一下载地址', type: 'url' },
        { key: 'iosUrl', label: 'iOS 下载地址', type: 'url' },
        { key: 'androidUrl', label: 'Android 下载地址', type: 'url' }
      ]
    }
  ],

  mergeSettings(base, incoming) {
    const next = clone(DEFAULT_SETTINGS);
    Object.keys(base || {}).forEach((key) => {
      if (next[key] && typeof base[key] === 'object') {
        next[key] = { ...next[key], ...base[key] };
      }
    });
    Object.keys(incoming || {}).forEach((key) => {
      if (next[key] && typeof incoming[key] === 'object') {
        next[key] = { ...next[key], ...incoming[key] };
      }
    });
    return next;
  },

  async ensureState() {
    if (AppState.settings) return;

    let localSettings = {};
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      if (saved && typeof saved === 'object') {
        localSettings = saved;
      }
    } catch (error) {
      console.error('Failed to parse settings cache:', error);
    }

    AppState.settings = this.mergeSettings(localSettings, {});

    try {
      const result = await API.getSettings();
      if (result.success && result.data) {
        AppState.settings = this.mergeSettings(AppState.settings, result.data);
        this.persistLocal();
      }
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error('Failed to load server settings:', error);
      UI.showNotification('服务端设置加载失败，已使用本地缓存', 'error');
    }
  },

  persistLocal() {
    localStorage.setItem(this.storageKey, JSON.stringify(AppState.settings));
  },

  async render() {
    await this.ensureState();
    const container = document.getElementById('settings-container');
    const summary = this.buildSummary();
    const cards = this.sections.map((section) => this.renderCard(section)).join('');

    container.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          ${summary}
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          ${cards}
        </div>
      </div>
    `;

    container.querySelectorAll('[data-settings-card]').forEach((button) => {
      button.addEventListener('click', () => this.openSection(button.dataset.settingsCard));
    });
  },

  buildSummary() {
    const settings = AppState.settings;
    const metrics = [
      {
        label: '站点状态',
        value: settings.site.stopRegister ? '已停注册' : '开放中',
        sub: settings.site.siteName || '未命名站点'
      },
      {
        label: '安全级别',
        value: settings.security.auditMode ? '审计开启' : '基础模式',
        sub: `会话 ${settings.security.sessionTimeout} 小时`
      },
      {
        label: '通知渠道',
        value: settings.telegram.botToken ? '已配置' : '未配置',
        sub: settings.email.smtpHost ? '邮件已接通' : '邮件未接通'
      },
      {
        label: '上游 API',
        value: settings.upstream.configured || settings.upstream.apiKeyConfigured ? '已配置' : '未配置',
        sub: settings.upstream.baseUrl || '等待填写上游地址'
      }
    ];

    return metrics.map((item) => `
      <div class="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5">
        <div class="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">${item.label}</div>
        <div class="text-2xl font-bold text-on-surface">${escapeHtml(item.value)}</div>
        <div class="text-sm text-on-surface-variant mt-2">${escapeHtml(item.sub)}</div>
      </div>
    `).join('');
  },

  renderCard(section) {
    const status = this.getSectionStatus(section.key);
    return `
      <button
        data-settings-card="${section.key}"
        class="text-left rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5 hover:bg-surface-container transition-all hover:shadow-lg">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-primary-fixed/30 text-primary flex items-center justify-center">
              <span class="material-symbols-outlined">${section.icon}</span>
            </div>
            <div>
              <div class="text-lg font-bold text-on-surface">${section.title}</div>
              <div class="text-sm text-on-surface-variant mt-1">${section.description}</div>
              <div class="text-sm text-on-surface mt-3">${escapeHtml(this.getSectionPreview(section.key))}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 rounded-lg text-xs font-medium ${status.className}">${status.label}</span>
            <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>
        </div>
      </button>
    `;
  },

  getSectionStatus(key) {
    const settings = AppState.settings[key];
    const filled = Object.values(settings).filter((value) => {
      if (typeof value === 'boolean') return value;
      return String(value || '').trim() !== '';
    }).length;

    if (filled >= Math.ceil(Object.keys(settings).length / 2)) {
      return { label: '已配置', className: 'bg-green-50 text-green-700' };
    }
    return { label: '待完善', className: 'bg-amber-50 text-amber-700' };
  },

  getSectionPreview(key) {
    const settings = AppState.settings[key];
    const previewMap = {
      site: `${settings.siteName} · ${settings.siteUrl || '未配置域名'}`,
      security: `超时 ${settings.sessionTimeout} 小时 · ${settings.auditMode ? '审计开启' : '审计关闭'}`,
      subscription: `默认 ${settings.defaultQuota} 配额 · ${settings.defaultDuration} 天`,
      upstream: `${settings.baseUrl || '未配置上游'} · ${settings.apiKeyConfigured ? settings.apiKeyMasked : 'Key 未配置'}`,
      invite: `${settings.inviteEnabled ? '邀请开启' : '邀请关闭'} · ${settings.commissionRate}% 佣金`,
      email: settings.smtpHost ? `${settings.smtpHost}:${settings.smtpPort}` : 'SMTP 未配置',
      telegram: settings.botToken ? 'Bot Token 已配置' : 'Telegram 未配置',
      app: `${settings.appName} · ${settings.latestVersion}`
    };

    return previewMap[key] || '未配置';
  },

  openSection(key) {
    const section = this.sections.find((item) => item.key === key);
    if (!section) return;

    const values = AppState.settings[key];
    const content = `
      <div class="space-y-4">
        ${section.fields.map((field) => this.renderField(key, field, values[field.key])).join('')}
      </div>
    `;

    const actions = `
      <button data-close-modal class="px-4 py-2 text-on-surface-variant hover:bg-surface-container rounded-xl transition-all">取消</button>
      ${key === 'upstream' ? '<button id="test-upstream-btn" class="px-4 py-2 bg-surface-container text-on-surface rounded-xl font-bold hover:shadow-md transition-all">测试连接</button>' : ''}
      <button id="save-settings-btn" class="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold hover:shadow-md transition-all">保存设置</button>
    `;

    UI.showModal(section.title, content, actions);
    document.getElementById('test-upstream-btn')?.addEventListener('click', () => this.testUpstream());
    document.getElementById('save-settings-btn')?.addEventListener('click', () => this.saveSection(key));
  },

  renderField(sectionKey, field, value) {
    const inputId = `setting-${sectionKey}-${field.key}`;
    const label = `<label class="block text-sm font-medium text-on-surface mb-2" for="${inputId}">${field.label}</label>`;

    if (field.type === 'checkbox') {
      return `
        <label class="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
          <span class="text-sm font-medium text-on-surface">${field.label}</span>
          <input id="${inputId}" type="checkbox" ${value ? 'checked' : ''} class="w-4 h-4 rounded border-outline-variant" />
        </label>
      `;
    }

    if (field.type === 'password') {
      const current = sectionKey === 'upstream' ? AppState.settings.upstream.apiKeyMasked : '';
      return `
        <div>
          ${label}
          <input
            id="${inputId}"
            type="password"
            value=""
            placeholder="${field.placeholder || current || ''}"
            class="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm outline-none"
            autocomplete="new-password"
          />
          ${current ? `<p class="mt-2 text-xs text-on-surface-variant">当前已保存：${escapeHtml(current)}；留空则继续使用当前 Key。</p>` : ''}
        </div>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <div>
          ${label}
          <textarea
            id="${inputId}"
            rows="${field.rows || 4}"
            placeholder="${field.placeholder || ''}"
            class="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm outline-none"
          >${escapeHtml(value || '')}</textarea>
        </div>
      `;
    }

    if (field.type === 'select') {
      return `
        <div>
          ${label}
          <select id="${inputId}" class="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm outline-none">
            ${field.options.map((option) => `
              <option value="${option.value}" ${value === option.value ? 'selected' : ''}>${option.label}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    return `
      <div>
        ${label}
        <input
          id="${inputId}"
          type="${field.type || 'text'}"
          min="${field.min ?? ''}"
          max="${field.max ?? ''}"
          value="${escapeHtml(value ?? '')}"
          placeholder="${field.placeholder || ''}"
          class="w-full px-4 py-3 bg-surface-container-low border-none rounded-xl text-sm outline-none"
        />
      </div>
    `;
  },

  collectSectionValues(key) {
    const section = this.sections.find((item) => item.key === key);
    if (!section) return null;

    const nextSection = {};
    section.fields.forEach((field) => {
      const element = document.getElementById(`setting-${key}-${field.key}`);
      if (!element) return;

      if (field.type === 'checkbox') {
        nextSection[field.key] = element.checked;
      } else if (field.type === 'number') {
        nextSection[field.key] = Number(element.value || 0);
      } else {
        nextSection[field.key] = element.value.trim();
      }
    });

    return nextSection;
  },

  async testUpstream() {
    const nextSection = this.collectSectionValues('upstream');
    if (!nextSection) return;

    const button = document.getElementById('test-upstream-btn');
    const previousText = button?.textContent || '测试连接';
    if (button) {
      button.disabled = true;
      button.textContent = '测试中...';
    }

    try {
      const payload = { ...AppState.settings.upstream, ...nextSection };
      const result = await API.testUpstream(payload);
      UI.showNotification(result.message || (result.success ? '上游连接成功' : '上游连接失败'), result.success ? 'success' : 'error');
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification('上游连接测试失败', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previousText;
      }
    }
  },

  async saveSection(key) {
    const section = this.sections.find((item) => item.key === key);
    if (!section) return;

    const nextSection = this.collectSectionValues(key);
    if (!nextSection) return;

    AppState.settings[key] = nextSection;
    const saveButton = document.getElementById('save-settings-btn');
    const previousText = saveButton?.textContent || '保存设置';
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = '保存中...';
    }

    try {
      if (key === 'upstream') {
        const result = await API.updateSettings({ upstream: nextSection });
        if (!result.success) {
          UI.showNotification(result.message || '保存失败', 'error');
          return;
        }
        if (result.data?.upstream) {
          AppState.settings.upstream = { ...AppState.settings.upstream, ...result.data.upstream, apiKey: '' };
        }
      }

      this.persistLocal();
      UI.hideModal();
      await this.render();
      UI.showNotification(`${section.title}已保存`, 'success');
    } catch (error) {
      if (error.message === '未授权') {
        showLoginForm();
        return;
      }
      console.error(error);
      UI.showNotification(`${section.title}保存失败`, 'error');
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = previousText;
      }
    }
  }
};

function bindShellActions() {
  if (AppState.bindings.shell) return;
  AppState.bindings.shell = true;

  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    await UI.loadTabData(AppState.currentTab);
    UI.showNotification('数据已刷新', 'success');
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (!confirm('确定要退出登录吗？')) return;
    await API.logout().catch(() => null);
    location.reload();
  });

  document.getElementById('global-search')?.addEventListener('input', debounce((event) => {
    const keyword = event.target.value.trim();
    if (AppState.currentPanel === 'users') {
      document.getElementById('user-search').value = keyword;
      AppState.filters.users.search = keyword;
      UserManagement.loadUsers();
    } else if (AppState.currentPanel === 'codes') {
      document.getElementById('code-search').value = keyword;
      AppState.filters.codes.search = keyword;
      CodeManagement.loadCodes();
    }
  }));
}

function showLoginAlert(message) {
  const alertNode = document.getElementById('login-alert');
  alertNode.textContent = message;
  alertNode.classList.remove('hidden');
}

function showLoginForm() {
  const overlay = document.getElementById('login-overlay');
  const container = document.getElementById('app-container');
  overlay.style.display = 'flex';
  container.style.display = 'none';

  const loginForm = document.getElementById('login-form');
  const freshForm = loginForm.cloneNode(true);
  loginForm.parentNode.replaceChild(freshForm, loginForm);
  document.getElementById('login-alert').classList.add('hidden');

  freshForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('login-password').value.trim();
    if (!password) {
      showLoginAlert('请输入密码');
      return;
    }

    const submit = document.getElementById('login-submit');
    submit.disabled = true;
    submit.textContent = '登录中...';

    try {
      const result = await API.login(password);
      if (!result.success) {
        showLoginAlert(result.message || '登录失败');
        submit.disabled = false;
        submit.textContent = '登录';
        return;
      }

      overlay.style.display = 'none';
      container.style.display = 'flex';
      bindShellActions();
      await UI.switchTab(window.location.hash.slice(1) || AppState.currentTab);
    } catch (error) {
      console.error(error);
      showLoginAlert('登录失败，请重试');
      submit.disabled = false;
      submit.textContent = '登录';
    }
  });

  document.getElementById('login-password')?.focus();
}

async function init() {
  UI.initSidebar();
  UI.initThemeToggle();

  try {
    const auth = await API.checkAuth();
    if (!auth.authenticated) {
      showLoginForm();
      return;
    }

    document.getElementById('login-overlay').style.display = 'none';
    const appContainer = document.getElementById('app-container');
    appContainer.style.display = 'flex';
    bindShellActions();
    await UI.switchTab(window.location.hash.slice(1) || AppState.currentTab);
  } catch (error) {
    console.error(error);
    showLoginForm();
  }
}

// === 微交互系统 ===

// 真实波纹效果
function createRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement('span');
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.classList.add('ripple-effect');

  button.appendChild(ripple);

  ripple.addEventListener('animationend', () => {
    ripple.remove();
  });
}

// 给所有按钮添加波纹效果
function initRippleEffects() {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button && !button.disabled) {
      createRipple(e);
    }
  });
}

// 初始化所有微交互
function initMicroInteractions() {
  initRippleEffects();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  initMicroInteractions();
});
