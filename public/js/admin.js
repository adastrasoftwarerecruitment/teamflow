/* ============================================================
   admin.js — Department & Subsystem Management Module
   ============================================================ */

const Admin = {
  _subsystems: [],
  _activeSubsystemForUsers: null,
  _editingSubsystemId: null,
  _editingUserId: null,
  _subsystemColor: '#6366f1',
  _subsystemEmoji: '🏢',
  _userColor: '#6366f1',

  async load() {
    await this.fetchSubsystems();
    this.renderSubsystemCards('admin-subsystems-grid');
    this.updateStats();
  },

  async fetchSubsystems() {
    try {
      this._subsystems = await Api.subsystems.getAll();
    } catch (e) {
      console.error('Failed to load subsystems:', e);
      this._subsystems = [];
    }
    return this._subsystems;
  },

  getAll() {
    return this._subsystems;
  },

  getById(id) {
    return this._subsystems.find(s => s.id === id);
  },

  updateStats() {
    const totalSubsystems = this._subsystems.length;
    const totalUsers = this._subsystems.reduce((acc, s) => acc + (parseInt(s.userCount) || 0), 0);
    const totalBoards = this._subsystems.reduce((acc, s) => acc + (parseInt(s.boardCount) || 0), 0);
    const totalTasks = this._subsystems.reduce((acc, s) => acc + (parseInt(s.taskCount) || 0), 0);

    const subEl = document.getElementById('admin-stat-subsystems');
    const userEl = document.getElementById('admin-stat-users');
    const boardEl = document.getElementById('admin-stat-boards');
    const taskEl = document.getElementById('admin-stat-tasks');

    if (subEl) subEl.textContent = totalSubsystems;
    if (userEl) userEl.textContent = totalUsers;
    if (boardEl) boardEl.textContent = totalBoards;
    if (taskEl) taskEl.textContent = totalTasks;
  },

  renderSubsystemCards(containerId = 'admin-subsystems-grid') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!this._subsystems.length) {
      container.innerHTML = UI.emptyState('No departments found. Create your first department to get started!', '🏢');
      return;
    }

    container.innerHTML = this._subsystems.map(sub => {
      const userCount = parseInt(sub.userCount) || 0;
      const boardCount = parseInt(sub.boardCount) || 0;
      const taskCount = parseInt(sub.taskCount) || 0;
      const completedCount = parseInt(sub.completedCount) || 0;
      const completionPct = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
      const color = sub.color || '#6366f1';
      const icon = sub.icon || '🏢';

      return `
        <div class="subsystem-card" data-subsystem-id="${sub.id}" style="--subsystem-color: ${color}">
          <div class="subsystem-card-header">
            <div class="subsystem-card-title-group">
              <div class="subsystem-card-icon">${icon}</div>
              <div>
                <div class="subsystem-card-title">${sub.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${userCount} Member${userCount === 1 ? '' : 's'}</div>
              </div>
            </div>
            <div class="subsystem-card-actions">
              <button class="icon-btn small edit-subsystem-btn" data-id="${sub.id}" title="Edit Department">
                <i data-lucide="edit-3" size="14"></i>
              </button>
              <button class="icon-btn small delete-subsystem-btn" data-id="${sub.id}" title="Delete Department">
                <i data-lucide="trash-2" size="14"></i>
              </button>
            </div>
          </div>

          <div class="subsystem-card-desc">
            ${sub.description || 'No description provided.'}
          </div>

          <div class="subsystem-metrics-row">
            <div class="subsystem-metric">
              <span class="subsystem-metric-val">${userCount}</span>
              <span class="subsystem-metric-lbl">Users</span>
            </div>
            <div class="subsystem-metric">
              <span class="subsystem-metric-val">${boardCount}</span>
              <span class="subsystem-metric-lbl">Boards</span>
            </div>
            <div class="subsystem-metric">
              <span class="subsystem-metric-val">${taskCount}</span>
              <span class="subsystem-metric-lbl">Tasks</span>
            </div>
          </div>

          <div class="subsystem-completion-progress">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${completionPct}%; background: ${color}"></div>
            </div>
            <div class="progress-labels">
              <span>Task Completion</span>
              <span>${completionPct}%</span>
            </div>
          </div>

          <div class="subsystem-card-footer">
            <button class="btn btn-primary small enter-subsystem-btn" data-id="${sub.id}" style="flex: 1; justify-content: center;">
              <i data-lucide="log-in" size="14"></i>
              Enter
            </button>
            <button class="btn btn-ghost small manage-users-btn" data-id="${sub.id}">
              <i data-lucide="users" size="14"></i>
              Manage Users
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.enter-subsystem-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.enterSubsystem(btn.dataset.id);
      });
    });

    container.querySelectorAll('.manage-users-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openUsersModal(btn.dataset.id);
      });
    });

    container.querySelectorAll('.edit-subsystem-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditSubsystem(btn.dataset.id);
      });
    });

    container.querySelectorAll('.delete-subsystem-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSubsystem(btn.dataset.id);
      });
    });

    // Clicking anywhere on card (except buttons) enters subsystem
    container.querySelectorAll('.subsystem-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.enterSubsystem(card.dataset.subsystemId);
      });
    });

    lucide.createIcons();
  },

  enterSubsystem(subsystemId) {
    const sub = this.getById(subsystemId);
    if (!sub) return;

    App.setBrowsingSubsystem(sub);
    App.navigate('dashboard');
    UI.toast(`Switched view to department: ${sub.name}`, 'info');
  },

  exitSubsystem() {
    App.setBrowsingSubsystem(null);
    App.navigate('admin');
    UI.toast('Returned to Admin Overview', 'info');
  },

  // ---- Subsystem Modal (Create / Edit) ----
  openNewSubsystem() {
    this._editingSubsystemId = null;
    this._subsystemColor = '#6366f1';
    this._subsystemEmoji = '🏢';

    document.getElementById('subsystem-modal-title').textContent = 'Create Department';
    document.getElementById('new-subsystem-name').value = '';
    document.getElementById('new-subsystem-desc').value = '';
    document.getElementById('create-subsystem-submit').textContent = 'Create Department';
    document.getElementById('subsystem-delete-btn').style.display = 'none';

    document.querySelectorAll('#subsystem-emoji-picker .emoji-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.emoji === '🏢');
    });
    document.querySelectorAll('#subsystem-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === '#6366f1');
    });

    UI.openModal('modal-new-subsystem');
    document.getElementById('new-subsystem-name').focus();
  },

  openEditSubsystem(id) {
    const sub = this.getById(id);
    if (!sub) return;

    this._editingSubsystemId = id;
    this._subsystemColor = sub.color || '#6366f1';
    this._subsystemEmoji = sub.icon || '🏢';

    document.getElementById('subsystem-modal-title').textContent = 'Edit Department';
    document.getElementById('new-subsystem-name').value = sub.name;
    document.getElementById('new-subsystem-desc').value = sub.description || '';
    document.getElementById('create-subsystem-submit').textContent = 'Save Changes';
    document.getElementById('subsystem-delete-btn').style.display = 'inline-flex';

    document.querySelectorAll('#subsystem-emoji-picker .emoji-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.emoji === sub.icon);
    });
    document.querySelectorAll('#subsystem-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === sub.color);
    });

    UI.openModal('modal-new-subsystem');
  },

  async submitSubsystem() {
    const name = document.getElementById('new-subsystem-name').value.trim();
    if (!name) {
      UI.toast('Department name is required', 'error');
      return;
    }

    const data = {
      name,
      description: document.getElementById('new-subsystem-desc').value.trim(),
      icon: this._subsystemEmoji,
      color: this._subsystemColor,
    };

    try {
      if (this._editingSubsystemId) {
        await Api.subsystems.update(this._editingSubsystemId, data);
        UI.toast('Department updated successfully', 'success');
      } else {
        await Api.subsystems.create(data);
        UI.toast('Department created successfully', 'success');
      }

      UI.closeModal('modal-new-subsystem');
      await this.load();

      // If we are currently browsing this subsystem, update the indicator
      if (App._currentSubsystem && App._currentSubsystem.id === this._editingSubsystemId) {
        App.setBrowsingSubsystem(this.getById(this._editingSubsystemId));
      }
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async deleteSubsystem(id) {
    const sub = this.getById(id);
    if (!sub) return;

    if (!await UI.confirm(`Are you sure you want to delete department "${sub.name}"? All associated boards, tasks, and members will be affected.`)) {
      return;
    }

    try {
      await Api.subsystems.delete(id);
      UI.toast('Department deleted successfully', 'success');

      // If active subsystem was deleted, reset browsing
      if (App._currentSubsystem && App._currentSubsystem.id === id) {
        App.setBrowsingSubsystem(null);
      }

      UI.closeModal('modal-new-subsystem');
      await this.load();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  // ---- Subsystem User Management ----
  async openUsersModal(subsystemId) {
    const sub = this.getById(subsystemId);
    if (!sub) return;

    this._activeSubsystemForUsers = sub;
    document.getElementById('subsystem-users-modal-title').textContent = `${sub.icon || '🏢'} ${sub.name} — Users`;
    document.getElementById('subsystem-users-subtitle').textContent = `Manage user accounts and roles for ${sub.name}`;

    UI.openModal('modal-subsystem-users');
    await this.loadSubsystemUsers();
  },

  async loadSubsystemUsers() {
    if (!this._activeSubsystemForUsers) return;

    const list = document.getElementById('subsystem-users-list');
    const countEl = document.getElementById('subsystem-users-count');
    if (!list) return;

    list.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);"><div class="spinner" style="margin: 0 auto 0.5rem auto;"></div>Loading users...</div>`;

    try {
      const users = await Api.subsystems.getUsers(this._activeSubsystemForUsers.id);
      if (countEl) countEl.textContent = `${users.length} User${users.length === 1 ? '' : 's'}`;

      if (!users.length) {
        list.innerHTML = UI.emptyState('No users assigned to this department yet.', '👤');
        return;
      }

      list.innerHTML = users.map(u => {
        const initial = (u.display_name || u.username || '?')[0].toUpperCase();
        const roleLabel = u.role === 'super_admin' ? 'Super Admin' : u.role === 'subsystem_admin' ? 'Department Admin' : 'Member';

        return `
          <div class="user-mgmt-item" data-user-id="${u.id}">
            <div class="user-mgmt-left">
              <div class="member-avatar" style="background: ${u.color || '#6366f1'}">${initial}</div>
              <div class="user-mgmt-info">
                <div class="user-mgmt-name">${u.display_name}</div>
                <div class="user-mgmt-sub">
                  <span>@${u.username}</span>
                  ${u.email ? `<span>&bull; ${u.email}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="user-mgmt-actions">
              <span class="role-badge ${u.role}">${roleLabel}</span>
              <button class="icon-btn small edit-subsystem-user-btn" data-id="${u.id}" title="Edit User">
                <i data-lucide="edit-3" size="14"></i>
              </button>
              <button class="icon-btn small delete-subsystem-user-btn" data-id="${u.id}" title="Delete User">
                <i data-lucide="trash-2" size="14"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      list.querySelectorAll('.edit-subsystem-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = users.find(x => x.id === btn.dataset.id);
          if (u) this.openEditUser(u);
        });
      });

      list.querySelectorAll('.delete-subsystem-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = users.find(x => x.id === btn.dataset.id);
          if (u) this.deleteUser(u);
        });
      });

      lucide.createIcons();
    } catch (e) {
      list.innerHTML = `<div style="color: var(--priority-urgent); padding: 1rem; text-align: center;">Failed to load users: ${e.message}</div>`;
    }
  },

  openAddUser() {
    if (!this._activeSubsystemForUsers) return;

    this._editingUserId = null;
    this._userColor = '#6366f1';

    document.getElementById('user-modal-title').textContent = `Add User to ${this._activeSubsystemForUsers.name}`;
    document.getElementById('user-username-input').value = '';
    document.getElementById('user-username-input').disabled = false;
    document.getElementById('user-displayname-input').value = '';
    document.getElementById('user-password-input').value = '';
    document.getElementById('user-password-input').required = true;
    document.getElementById('user-password-label').textContent = 'Password *';
    document.getElementById('user-password-help').style.display = 'none';
    document.getElementById('user-role-input').value = 'member';
    document.getElementById('user-email-input').value = '';
    document.getElementById('user-submit-btn').textContent = 'Create User';
    document.getElementById('user-delete-btn').style.display = 'none';

    const avatarPreview = document.getElementById('user-avatar-preview');
    avatarPreview.style.background = '#6366f1';
    avatarPreview.textContent = 'U';

    document.querySelectorAll('#user-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === '#6366f1');
    });

    UI.openModal('modal-new-user');
    document.getElementById('user-username-input').focus();
  },

  openEditUser(user) {
    this._editingUserId = user.id;
    this._userColor = user.color || '#6366f1';

    document.getElementById('user-modal-title').textContent = `Edit User: ${user.display_name}`;
    document.getElementById('user-username-input').value = user.username;
    document.getElementById('user-username-input').disabled = true; // username shouldn't be changed
    document.getElementById('user-displayname-input').value = user.display_name;
    document.getElementById('user-password-input').value = '';
    document.getElementById('user-password-input').required = false;
    document.getElementById('user-password-label').textContent = 'New Password (Optional)';
    document.getElementById('user-password-help').style.display = 'block';
    document.getElementById('user-role-input').value = user.role || 'member';
    document.getElementById('user-email-input').value = user.email || '';
    document.getElementById('user-submit-btn').textContent = 'Save Changes';
    document.getElementById('user-delete-btn').style.display = 'inline-flex';

    const avatarPreview = document.getElementById('user-avatar-preview');
    avatarPreview.style.background = this._userColor;
    avatarPreview.textContent = (user.display_name || user.username || 'U')[0].toUpperCase();

    document.querySelectorAll('#user-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === this._userColor);
    });

    UI.openModal('modal-new-user');
  },

  async submitUser() {
    const displayName = document.getElementById('user-displayname-input').value.trim();
    const role = document.getElementById('user-role-input').value;
    const email = document.getElementById('user-email-input').value.trim();
    const password = document.getElementById('user-password-input').value;

    if (!displayName) {
      UI.toast('Display name is required', 'error');
      return;
    }

    try {
      if (this._editingUserId) {
        // Update user
        const updateData = {
          display_name: displayName,
          role,
          email,
          color: this._userColor,
        };
        if (password) {
          updateData.password = password;
        }

        await Api.subsystems.updateUser(this._editingUserId, updateData);
        UI.toast('User updated successfully', 'success');
      } else {
        // Create user
        const username = document.getElementById('user-username-input').value.trim();
        if (!username) {
          UI.toast('Username is required', 'error');
          return;
        }
        if (!password) {
          UI.toast('Password is required for new users', 'error');
          return;
        }

        const createData = {
          username,
          password,
          display_name: displayName,
          role,
          email,
          color: this._userColor,
        };

        await Api.subsystems.createUser(this._activeSubsystemForUsers.id, createData);
        UI.toast('User created successfully', 'success');
      }

      UI.closeModal('modal-new-user');
      await this.loadSubsystemUsers();
      await this.load(); // Refresh counts
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async deleteUser(user) {
    if (!await UI.confirm(`Are you sure you want to delete user "${user.display_name} (@${user.username})"?`)) {
      return;
    }

    try {
      await Api.subsystems.deleteUser(user.id);
      UI.toast('User deleted successfully', 'success');
      UI.closeModal('modal-new-user');
      await this.loadSubsystemUsers();
      await this.load();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  bindEvents() {
    // New department button
    document.getElementById('admin-new-subsystem-btn')?.addEventListener('click', () => {
      this.openNewSubsystem();
    });

    // Subsystem submit & delete
    document.getElementById('create-subsystem-submit')?.addEventListener('click', () => {
      this.submitSubsystem();
    });

    document.getElementById('subsystem-delete-btn')?.addEventListener('click', () => {
      if (this._editingSubsystemId) this.deleteSubsystem(this._editingSubsystemId);
    });

    // Add user button in subsystem users modal
    document.getElementById('subsystem-add-user-btn')?.addEventListener('click', () => {
      this.openAddUser();
    });

    // User submit & delete
    document.getElementById('user-submit-btn')?.addEventListener('click', () => {
      this.submitUser();
    });

    document.getElementById('user-delete-btn')?.addEventListener('click', () => {
      if (this._editingUserId) {
        this.deleteUser({ id: this._editingUserId, display_name: document.getElementById('user-displayname-input').value, username: document.getElementById('user-username-input').value });
      }
    });

    // Back to admin buttons
    document.getElementById('admin-return-btn')?.addEventListener('click', () => {
      this.exitSubsystem();
    });

    document.getElementById('dashboard-back-to-admin-btn')?.addEventListener('click', () => {
      this.exitSubsystem();
    });

    document.getElementById('breadcrumb-admin-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.exitSubsystem();
    });

    document.getElementById('overview-go-to-admin-btn')?.addEventListener('click', () => {
      App.navigate('admin');
    });

    // Subsystem emoji picker
    document.querySelectorAll('#subsystem-emoji-picker .emoji-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#subsystem-emoji-picker .emoji-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._subsystemEmoji = opt.dataset.emoji;
      });
    });

    // Subsystem color picker
    document.querySelectorAll('#subsystem-color-picker .color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#subsystem-color-picker .color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._subsystemColor = opt.dataset.color;
      });
    });

    // User color picker
    document.querySelectorAll('#user-color-picker .color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#user-color-picker .color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._userColor = opt.dataset.color;
        const avatarPreview = document.getElementById('user-avatar-preview');
        if (avatarPreview) avatarPreview.style.background = this._userColor;
      });
    });

    // Live avatar preview in user modal
    document.getElementById('user-displayname-input')?.addEventListener('input', (e) => {
      const avatarPreview = document.getElementById('user-avatar-preview');
      if (avatarPreview) {
        avatarPreview.textContent = (e.target.value?.[0] || 'U').toUpperCase();
      }
    });
  }
};

window.Admin = Admin;
