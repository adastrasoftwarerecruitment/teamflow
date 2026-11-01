/* ============================================================
   app.js — Main application controller, auth, routing, subsystems
   ============================================================ */

const App = {
  _currentPage: 'dashboard',
  _currentUser: null,
  _currentSubsystem: null, // For super_admin browsing: null = overview mode, object = specific subsystem

  async init() {
    // Bind UI & Event listeners that can be initialized early
    UI.initModalCloseButtons();
    this.bindAuthEvents();
    this.bindGlobalEvents();
    Board.bindBoardPageEvents();
    Dashboard.bindEvents();
    CalendarView.bindEvents();
    Admin.bindEvents();

    // Check existing theme
    this.initTheme();

    // Check authentication status
    try {
      const authData = await Api.auth.me();
      const user = authData?.user || authData;
      if (user && user.id) {
        this._currentUser = user;
        await this.bootstrapApp();
      } else {
        this.showLogin();
      }
    } catch (e) {
      this.showLogin();
    }
  },

  async bootstrapApp() {
    this.showAppShell();
    this.updateUserDisplay();
    this.updateSubsystemDisplay();

    // Load members first for current subsystem / user
    await Members.load();

    // If super admin and on admin page, load admin, otherwise dashboard
    if (this._currentUser.role === 'super_admin' && this._currentPage === 'admin') {
      await Admin.load();
    } else {
      await Dashboard.load();
    }

    lucide.createIcons();
    console.log('✅ TeamFlow Task Planner initialized as', this._currentUser.username);
  },

  // ---- Authentication Handling ----
  showLogin(errorMsg = null) {
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    const errorEl = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');

    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appShell) appShell.classList.add('hidden');

    if (errorEl && errorText) {
      if (errorMsg) {
        errorText.textContent = errorMsg;
        errorEl.classList.remove('hidden');
      } else {
        errorEl.classList.add('hidden');
      }
    }

    // Reset form state
    const submitBtn = document.getElementById('login-submit-btn');
    const btnText = document.getElementById('login-btn-text');
    const spinner = document.getElementById('login-spinner');
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.style.display = 'inline';
    if (spinner) spinner.classList.add('hidden');

    lucide.createIcons();
  },

  showAppShell() {
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');

    if (loginScreen) loginScreen.classList.add('hidden');
    if (appShell) appShell.classList.remove('hidden');
  },

  async login(username, password) {
    const submitBtn = document.getElementById('login-submit-btn');
    const btnText = document.getElementById('login-btn-text');
    const spinner = document.getElementById('login-spinner');
    const errorEl = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');

    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (spinner) spinner.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    try {
      const data = await Api.auth.login({ username, password });
      this._currentUser = data?.user || data;
      this._currentSubsystem = null;

      // Store Bearer token for Capacitor native context
      if (data?.token) await Api.setToken(data.token);

      // Reset login form fields
      const unameEl = document.getElementById('login-username');
      const passEl = document.getElementById('login-password');
      if (unameEl) unameEl.value = '';
      if (passEl) passEl.value = '';

      // Must change password on first login
      if (this._currentUser?.must_change_password) {
        this.showChangePassword();
        return;
      }

      UI.toast(`Welcome back, ${this._currentUser.display_name || this._currentUser.username}!`, 'success');
      await this.bootstrapApp();
    } catch (err) {
      if (errorEl && errorText) {
        errorText.textContent = err.message || 'Invalid username or password';
        errorEl.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (spinner) spinner.classList.add('hidden');
    }
  },

  showChangePassword() {
    const loginScreen = document.getElementById('login-screen');
    const changeScreen = document.getElementById('change-password-screen');
    const appShell = document.getElementById('app');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appShell) appShell.classList.add('hidden');
    if (changeScreen) changeScreen.classList.remove('hidden');
  },

  hideChangePassword() {
    const changeScreen = document.getElementById('change-password-screen');
    if (changeScreen) changeScreen.classList.add('hidden');
  },

  async openTaskById(taskId, boardId) {
    // Navigate to board and open task detail
    try {
      if (boardId) await Board.load(boardId);
      if (taskId) setTimeout(() => Board.openTaskDetail(taskId), 300);
    } catch (e) { console.warn('openTaskById error:', e); }
  },

  async logout() {
    try {
      await Api.auth.logout();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    await Api.clearToken();
    this._currentUser = null;
    this._currentSubsystem = null;
    this.showLogin();
    UI.toast('Signed out successfully', 'info');
  },

  handleUnauthorized() {
    Api.clearToken().catch(() => {});
    this._currentUser = null;
    this._currentSubsystem = null;
    this.showLogin('Your session has expired. Please sign in again.');
  },

  // ---- UI Display Updates ----
  updateUserDisplay() {
    if (!this._currentUser) return;

    const nameEl = document.getElementById('current-user-display-name');
    const roleEl = document.getElementById('current-user-role');
    const avatar = document.getElementById('current-user-avatar');
    const initial = document.getElementById('current-user-initial');

    const roleName = this._currentUser.role === 'super_admin' ? 'Super Admin'
                   : this._currentUser.role === 'subsystem_admin' ? 'Dept Admin'
                   : 'Member';

    if (nameEl) nameEl.textContent = this._currentUser.display_name || this._currentUser.username;
    if (roleEl) roleEl.textContent = roleName;

    if (avatar && initial) {
      avatar.style.background = this._currentUser.color || '#6366f1';
      initial.textContent = (this._currentUser.display_name || this._currentUser.username || '?')[0].toUpperCase();
      avatar.title = `Signed in as ${this._currentUser.display_name} (@${this._currentUser.username})`;
    }

    // Show/hide administration section in sidebar
    const adminNavSection = document.getElementById('nav-section-admin');
    if (adminNavSection) {
      adminNavSection.style.display = this._currentUser.role === 'super_admin' ? 'block' : 'none';
    }
  },

  updateSubsystemDisplay() {
    const isSuperAdmin = this._currentUser?.role === 'super_admin';
    const sidebarSubsystem = document.getElementById('sidebar-subsystem-display');
    const sidebarSubsystemName = document.getElementById('sidebar-subsystem-name');
    const sidebarSubsystemDot = document.getElementById('sidebar-subsystem-dot');

    const topbarSubsystem = document.getElementById('topbar-subsystem-indicator');
    const topbarSubsystemName = document.getElementById('topbar-subsystem-name');
    const topbarSubsystemDot = document.getElementById('topbar-subsystem-dot');

    const adminBreadcrumb = document.getElementById('admin-breadcrumb');
    const breadcrumbSubName = document.getElementById('breadcrumb-subsystem-name');
    const adminBrowsingBanner = document.getElementById('admin-browsing-banner');
    const adminBrowsingName = document.getElementById('admin-browsing-name');
    const backToAdminBtn = document.getElementById('dashboard-back-to-admin-btn');

    if (isSuperAdmin) {
      // Super admin
      sidebarSubsystem?.classList.add('hidden');

      if (this._currentSubsystem) {
        // Super admin browsing a specific subsystem
        adminBreadcrumb?.classList.remove('hidden');
        if (breadcrumbSubName) breadcrumbSubName.textContent = this._currentSubsystem.name;

        adminBrowsingBanner?.classList.remove('hidden');
        if (adminBrowsingName) adminBrowsingName.textContent = this._currentSubsystem.name;

        backToAdminBtn?.classList.remove('hidden');
        topbarSubsystem?.classList.add('hidden');
      } else {
        // Super admin in overview mode
        adminBreadcrumb?.classList.add('hidden');
        adminBrowsingBanner?.classList.add('hidden');
        backToAdminBtn?.classList.add('hidden');

        if (topbarSubsystem && topbarSubsystemName && topbarSubsystemDot) {
          topbarSubsystem.classList.remove('hidden');
          topbarSubsystemName.textContent = 'All Departments';
          topbarSubsystemDot.style.background = 'var(--accent)';
        }
      }
    } else {
      // Regular user or subsystem admin
      adminBreadcrumb?.classList.add('hidden');
      adminBrowsingBanner?.classList.add('hidden');
      backToAdminBtn?.classList.add('hidden');

      const subName = this._currentUser?.subsystem_name || 'My Department';
      const subColor = this._currentUser?.color || '#6366f1';

      if (sidebarSubsystem && sidebarSubsystemName && sidebarSubsystemDot) {
        sidebarSubsystem.classList.remove('hidden');
        sidebarSubsystemName.textContent = subName;
        sidebarSubsystemDot.style.background = subColor;
      }

      if (topbarSubsystem && topbarSubsystemName && topbarSubsystemDot) {
        topbarSubsystem.classList.remove('hidden');
        topbarSubsystemName.textContent = subName;
        topbarSubsystemDot.style.background = subColor;
      }
    }
  },

  setBrowsingSubsystem(subsystem) {
    this._currentSubsystem = subsystem;
    this.updateSubsystemDisplay();
    // If on dashboard, reload it with the subsystem filter
    if (this._currentPage === 'dashboard') {
      Dashboard.load();
    }
  },

  getCurrentUser() {
    return this._currentUser;
  },

  getCurrentSubsystem() {
    return this._currentSubsystem;
  },

  // ---- Navigation & Routing ----
  navigateTo(page) { return this.navigate(page); }, // Alias for tab bar

  navigate(page) {
    if (page === 'admin' && this._currentUser?.role !== 'super_admin') {
      UI.toast('Department Administration requires super admin privileges', 'error');
      page = 'dashboard';
    }

    this._currentPage = page;
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) { pageEl.style.display = 'flex'; pageEl.classList.add('active'); }

    // Update sidebar nav items
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update tab bar
    document.querySelectorAll('.tab-item[data-page]').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Load page-specific data
    if (page === 'dashboard')     Dashboard.load();
    if (page === 'boards')        Dashboard.load();
    if (page === 'admin')         Admin.load();
    if (page === 'calendar')      CalendarView.load();
    if (page === 'analytics')     Analytics.load();
    if (page === 'notifications') this.loadNotificationsPage();
    if (page === 'me')            this.loadMePage();
    if (page === 'members') {
      Members.load().then(() => Members.renderPage());
    }

    lucide.createIcons();
  },

  async loadNotificationsPage() {
    try {
      const { notifications, unreadCount } = await Api.notifications.getAll();
      const list = document.getElementById('notifications-list');
      const empty = document.getElementById('notifications-empty');
      if (!list) return;

      // Update badge
      this._updateNotifBadge(unreadCount);

      if (!notifications || notifications.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
      }
      if (empty) empty.style.display = 'none';

      const typeIcons = { assigned:'📋', comment:'💬', moved:'🔄', completed:'✅', due_soon:'⏰', overdue:'🚨' };
      const typeBgs   = { assigned:'rgba(0,122,255,0.12)', comment:'rgba(52,199,89,0.12)', moved:'rgba(255,149,0,0.12)', completed:'rgba(52,199,89,0.12)', due_soon:'rgba(255,149,0,0.12)', overdue:'rgba(255,59,48,0.12)' };

      list.innerHTML = notifications.map(n => {
        const icon = typeIcons[n.type] || '🔔';
        const bg = typeBgs[n.type] || 'rgba(0,122,255,0.12)';
        const when = new Date(n.created_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        return `
          <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
            <div class="notification-icon" style="background:${bg}">${icon}</div>
            <div class="notification-body">
              <div class="notification-title">${n.title}</div>
              <div class="notification-text">${n.body || ''}</div>
              <div class="notification-time">${when}</div>
            </div>
          </div>`;
      }).join('');

      // Mark read on click
      list.querySelectorAll('.notification-item').forEach(el => {
        el.addEventListener('click', async () => {
          if (!el.classList.contains('unread')) return;
          el.classList.remove('unread');
          await Api.notifications.markRead(el.dataset.id).catch(() => {});
          const badge = document.getElementById('notif-badge');
          if (badge) {
            const cur = parseInt(badge.textContent) - 1;
            if (cur <= 0) badge.classList.add('hidden');
            else badge.textContent = cur;
          }
        });
      });

      // Mark all read button
      document.getElementById('notif-read-all-btn')?.addEventListener('click', async () => {
        await Api.notifications.markAllRead().catch(() => {});
        list.querySelectorAll('.notification-item').forEach(el => el.classList.remove('unread'));
        this._updateNotifBadge(0);
      });
    } catch (err) {
      console.error('loadNotificationsPage error:', err);
    }
  },

  _updateNotifBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  },

  async loadMePage() {
    const user = this._currentUser;
    if (!user) return;
    const avatar = document.getElementById('me-avatar');
    if (avatar) { avatar.style.background = user.color || 'var(--accent)'; avatar.textContent = (user.display_name||user.username||'?')[0].toUpperCase(); }
    const nameEl = document.getElementById('me-name');
    if (nameEl) nameEl.textContent = user.display_name || user.username;
    const roleEl = document.getElementById('me-role');
    if (roleEl) roleEl.textContent = user.role === 'super_admin' ? 'Super Admin' : user.role === 'subsystem_admin' ? 'Dept Admin' : 'Member';
    const usernameEl = document.getElementById('me-username');
    if (usernameEl) usernameEl.textContent = '@' + user.username;
    const emailEl = document.getElementById('me-email');
    if (emailEl) emailEl.textContent = user.email || '—';

    // Load notification prefs
    try {
      const prefs = await Api.notifications.getPrefs();
      const section = document.getElementById('notif-prefs-section');
      if (section) {
        const rows = [
          { key: 'assigned', label: 'Task Assigned', icon: '📋' },
          { key: 'comments', label: 'Comments', icon: '💬' },
          { key: 'due_soon', label: 'Due Soon Reminders', icon: '⏰' },
          { key: 'status_changes', label: 'Status Changes', icon: '🔄' },
          { key: 'push_enabled', label: 'Push Notifications', icon: '🔔' },
        ];
        section.innerHTML = rows.map(r => `
          <div class="ios-row" style="justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="ios-row-icon" style="background:rgba(0,122,255,0.1);">${r.icon}</div>
              <div class="ios-row-label">${r.label}</div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" data-pref="${r.key}" ${prefs[r.key] ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent);" />
            </label>
          </div>
        `).join('');
        section.querySelectorAll('input[data-pref]').forEach(cb => {
          cb.addEventListener('change', async () => {
            const update = {}; update[cb.dataset.pref] = cb.checked ? 1 : 0;
            await Api.notifications.updatePrefs(update).catch(console.error);
          });
        });
      }
    } catch(err) { console.warn('loadMePage prefs error:', err); }
  },

  toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('tf_theme', next);
  },

  // ---- Event Bindings ----
  bindAuthEvents() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (username && password) {
          this.login(username, password);
        }
      });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }
  },

  bindGlobalEvents() {
    // Sidebar navigation clicks
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(item.dataset.page);
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
          document.getElementById('sidebar')?.classList.remove('open');
          document.getElementById('sidebar-backdrop')?.remove();
        }
      });
    });

    // Sidebar collapse toggles
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('sidebar-toggle-mobile')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('open');
      // Add/remove backdrop
      let backdrop = document.getElementById('sidebar-backdrop');
      if (sidebar.classList.contains('open')) {
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.id = 'sidebar-backdrop';
          backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999;';
          backdrop.addEventListener('click', () => {
            sidebar.classList.remove('open');
            backdrop.remove();
          });
          document.body.appendChild(backdrop);
        }
      } else if (backdrop) {
        backdrop.remove();
      }
    });

    // Global search input
    let searchDebounce;
    document.getElementById('global-search')?.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => this.globalSearch(e.target.value.trim()), 300);
    });

    // Keyboard shortcut: Ctrl+K or Cmd+K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    });

    // Theme toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') === 'dark';
      html.setAttribute('data-theme', isDark ? 'light' : 'dark');
      localStorage.setItem('tf_theme', isDark ? 'light' : 'dark');

      const icon = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      if (icon) icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
      if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';

      lucide.createIcons();
      if (this._currentPage === 'analytics') Analytics.load();
    });
  },

  initTheme() {
    const savedTheme = localStorage.getItem('tf_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (savedTheme === 'light') {
      if (icon) icon.setAttribute('data-lucide', 'sun');
      if (label) label.textContent = 'Light Mode';
    }
  },

  async globalSearch(query) {
    if (!query) return;
    try {
      const params = { search: query };
      if (this._currentSubsystem) {
        params._subsystem = this._currentSubsystem.id;
      }
      const tasks = await Api.tasks.getAll(params);
      if (tasks && tasks.length > 0) {
        const firstTask = tasks[0];
        await Board.open(firstTask.board_id);
        UI.toast(`Found ${tasks.length} task(s) matching "${query}"`, 'info');
      } else {
        UI.toast(`No tasks found for "${query}"`, 'info');
      }
    } catch (e) {
      console.warn('Search error:', e);
    }
  }
};

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
