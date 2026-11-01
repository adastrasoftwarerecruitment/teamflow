/* ============================================================
   members.js — Team member management with Subsystem isolation
   ============================================================ */

const Members = {
  _members: [],
  _editId: null,
  _selectedColor: '#6366f1',

  async init() {
    await this.load();
    this.renderPage();
    this.bindEvents();
  },

  async load() {
    try {
      const params = {};
      const currentSubsystem = App.getCurrentSubsystem();
      if (currentSubsystem) {
        params._subsystem = currentSubsystem.id;
      }
      this._members = await Api.members.getAll(params);
    } catch (e) {
      console.warn('Failed to load members:', e);
      this._members = [];
    }
  },

  getAll() {
    return this._members;
  },

  getById(id) {
    return this._members.find(m => m.id === id);
  },

  renderPage() {
    const grid = document.getElementById('members-grid');
    if (!grid) return;

    // Update subtitle if viewing a specific department
    const subtitle = document.querySelector('#page-members .page-subtitle');
    const currentSub = App.getCurrentSubsystem();
    if (subtitle) {
      subtitle.textContent = currentSub
        ? `Team members and workload distribution for ${currentSub.name}`
        : 'Manage your team and track workload';
    }

    if (!this._members.length) {
      grid.innerHTML = UI.emptyState('No team members found in this department yet. Add your first member!', '👥');
      return;
    }

    grid.innerHTML = this._members.map(m => this.renderCard(m)).join('');

    // Bind card clicks for editing
    grid.querySelectorAll('.member-card').forEach(card => {
      card.addEventListener('click', () => this.openEdit(card.dataset.id));
    });
  },

  renderCard(m) {
    const displayName = m.display_name || m.name || m.username || 'Member';
    const initial = displayName[0].toUpperCase();
    const taskCount = parseInt(m.taskCount) || 0;
    const completedCount = parseInt(m.completedCount) || 0;
    const progressPct = taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0;
    const color = m.color || '#6366f1';
    const role = m.role === 'super_admin' ? 'Super Admin'
               : m.role === 'subsystem_admin' ? 'Dept Admin'
               : (m.role || 'Member');

    return `
      <div class="member-card" data-id="${m.id}" style="--member-color: ${color}">
        <div class="member-avatar large" style="background:${color}">${initial}</div>
        <div class="member-name">${displayName}</div>
        <div class="member-role">${role}</div>
        ${m.email ? `<div style="font-size:0.75rem;color:var(--text-muted)">${m.email}</div>` : ''}
        <div class="member-stats">
          <div class="member-stat">
            <span class="member-stat-val">${taskCount}</span>
            <span class="member-stat-label">Tasks</span>
          </div>
          <div class="member-stat">
            <span class="member-stat-val">${completedCount}</span>
            <span class="member-stat-label">Done</span>
          </div>
          <div class="member-stat">
            <span class="member-stat-val">${progressPct}%</span>
            <span class="member-stat-label">Rate</span>
          </div>
        </div>
      </div>
    `;
  },

  openAdd() {
    this._editId = null;
    this._selectedColor = '#6366f1';
    document.getElementById('member-modal-title').textContent = 'Add Team Member';
    document.getElementById('member-name-input').value = '';
    document.getElementById('member-role-input').value = '';
    document.getElementById('member-email-input').value = '';
    document.getElementById('member-submit-btn').textContent = 'Add Member';
    document.getElementById('member-delete-btn').style.display = 'none';
    document.getElementById('member-avatar-preview').style.background = '#6366f1';
    document.getElementById('member-avatar-preview').textContent = 'A';

    // Reset color picker
    document.querySelectorAll('#member-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === '#6366f1');
    });
    UI.openModal('modal-member');
  },

  openEdit(id) {
    const m = this.getById(id);
    if (!m) return;
    this._editId = id;
    this._selectedColor = m.color || '#6366f1';
    const displayName = m.display_name || m.name || m.username || '';

    document.getElementById('member-modal-title').textContent = 'Edit Member';
    document.getElementById('member-name-input').value = displayName;
    document.getElementById('member-role-input').value = m.role || '';
    document.getElementById('member-email-input').value = m.email || '';
    document.getElementById('member-submit-btn').textContent = 'Save Changes';
    document.getElementById('member-delete-btn').style.display = '';
    document.getElementById('member-avatar-preview').style.background = this._selectedColor;
    document.getElementById('member-avatar-preview').textContent = (displayName[0] || 'M').toUpperCase();

    document.querySelectorAll('#member-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === this._selectedColor);
    });
    UI.openModal('modal-member');
  },

  async submit() {
    const name  = document.getElementById('member-name-input').value.trim();
    const role  = document.getElementById('member-role-input').value.trim();
    const email = document.getElementById('member-email-input').value.trim();
    if (!name) { UI.toast('Name is required', 'error'); return; }

    const data = {
      name,
      display_name: name,
      role,
      email,
      color: this._selectedColor
    };

    const currentSubsystem = App.getCurrentSubsystem();
    if (currentSubsystem) {
      data.subsystem_id = currentSubsystem.id;
    }

    try {
      if (this._editId) {
        await Api.members.update(this._editId, data);
        UI.toast('Member updated', 'success');
      } else {
        await Api.members.create(data);
        UI.toast('Member added', 'success');
      }
      UI.closeModal('modal-member');
      await this.load();
      this.renderPage();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async deleteCurrent() {
    if (!this._editId) return;
    const m = this.getById(this._editId);
    const displayName = m?.display_name || m?.name || 'this member';
    if (!await UI.confirm(`Delete member "${displayName}"? They will be unassigned from all tasks.`)) return;
    try {
      await Api.members.delete(this._editId);
      UI.toast('Member deleted', 'success');
      UI.closeModal('modal-member');
      await this.load();
      this.renderPage();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  bindEvents() {
    document.getElementById('add-member-btn')?.addEventListener('click', () => this.openAdd());
    document.getElementById('member-submit-btn')?.addEventListener('click', () => this.submit());
    document.getElementById('member-delete-btn')?.addEventListener('click', () => this.deleteCurrent());

    // Color picker
    document.querySelectorAll('#member-color-picker .color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#member-color-picker .color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._selectedColor = opt.dataset.color;
        const preview = document.getElementById('member-avatar-preview');
        if (preview) preview.style.background = this._selectedColor;
      });
    });

    // Live avatar preview
    document.getElementById('member-name-input')?.addEventListener('input', (e) => {
      const preview = document.getElementById('member-avatar-preview');
      if (preview) {
        preview.textContent = e.target.value?.[0]?.toUpperCase() || 'A';
      }
    });
  }
};

window.Members = Members;
