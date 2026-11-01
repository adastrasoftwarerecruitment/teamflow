/* ============================================================
   dashboard.js — Dashboard stats, board cards, due-soon list & subsystem overview
   ============================================================ */

const Dashboard = {
  _boards: [],
  _selectedColor: '#6366f1',
  _selectedEmoji: '📋',
  _editBoardId: null,

  async load() {
    this.updateDashboardHeaders();
    await this.fetchBoards();
    await this.fetchStats();
    this.renderBoards();
    this.renderSidebarBoards();

    // If super_admin in overview mode, load subsystem aggregate cards
    const user = App.getCurrentUser();
    const isSuperAdminOverview = user?.role === 'super_admin' && !App.getCurrentSubsystem();
    const overviewContainer = document.getElementById('admin-overview-container');

    if (isSuperAdminOverview) {
      if (overviewContainer) overviewContainer.classList.remove('hidden');
      await Admin.fetchSubsystems();
      Admin.renderSubsystemCards('dashboard-subsystems-grid');
    } else {
      if (overviewContainer) overviewContainer.classList.add('hidden');
    }
  },

  updateDashboardHeaders() {
    const heading = document.getElementById('dashboard-heading');
    const subtitle = document.getElementById('dashboard-subtitle');
    const currentSubsystem = App.getCurrentSubsystem();
    const user = App.getCurrentUser();

    if (currentSubsystem) {
      if (heading) heading.textContent = `${currentSubsystem.name} Dashboard`;
      if (subtitle) subtitle.textContent = currentSubsystem.description || `Viewing boards and tasks for ${currentSubsystem.name}`;
    } else if (user?.role === 'super_admin') {
      if (heading) heading.textContent = 'All Departments Overview';
      if (subtitle) subtitle.textContent = 'Global summary across all team subsystems and boards';
    } else {
      const deptName = user?.subsystem_name ? `${user.subsystem_name} ` : '';
      if (heading) heading.textContent = `${deptName}Dashboard`;
      if (subtitle) subtitle.textContent = "Welcome back! Here's what's happening with your team.";
    }
  },

  async fetchBoards() {
    try {
      const params = {};
      const currentSubsystem = App.getCurrentSubsystem();
      if (currentSubsystem) {
        params._subsystem = currentSubsystem.id;
      }
      this._boards = await Api.boards.getAll(params);
    } catch (e) {
      console.warn('Failed to fetch boards:', e);
      this._boards = [];
    }
  },

  async fetchStats() {
    try {
      const params = {};
      const currentSubsystem = App.getCurrentSubsystem();
      if (currentSubsystem) {
        params._subsystem = currentSubsystem.id;
      }
      const stats = await Api.analytics.overview(params);

      const totalVal = document.getElementById('stat-total-val');
      const compVal = document.getElementById('stat-completed-val');
      const overVal = document.getElementById('stat-overdue-val');
      const rateVal = document.getElementById('stat-rate-val');

      if (totalVal) totalVal.textContent = stats.totalTasks ?? 0;
      if (compVal) compVal.textContent = stats.completedTasks ?? 0;
      if (overVal) overVal.textContent = stats.overdueTasks ?? 0;
      if (rateVal) rateVal.textContent = (stats.completionRate ?? 0) + '%';

      // Overdue badge in topbar
      const overdueBadge = document.getElementById('overdue-badge');
      const overdueCount = document.getElementById('overdue-count');
      if (stats.overdueTasks > 0) {
        overdueBadge?.classList.remove('hidden');
        if (overdueCount) overdueCount.textContent = stats.overdueTasks;
      } else {
        overdueBadge?.classList.add('hidden');
      }

      this.renderDueSoon(stats.dueSoon || []);
    } catch (e) {
      console.error('Failed to load dashboard stats', e);
    }
  },

  renderBoards() {
    const grid = document.getElementById('boards-grid');
    if (!grid) return;

    if (!this._boards.length) {
      grid.innerHTML = `
        <div class="board-card" id="create-first-board-card" style="border: 2px dashed var(--border); cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.75rem; min-height:160px; color:var(--text-muted)">
          <span style="font-size:2.5rem">📋</span>
          <div style="font-weight:600">Create your first board</div>
          <div style="font-size:0.82rem">Get started by adding a board for your team</div>
        </div>
      `;
      document.getElementById('create-first-board-card')?.addEventListener('click', () => {
        UI.openModal('modal-new-board');
      });
      return;
    }

    grid.innerHTML = this._boards.map(b => {
      const total = b.taskCount || 0;
      const completed = b.completedCount || 0;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return `
        <div class="board-card" data-board-id="${b.id}" style="--board-color:${b.color}">
          <div class="board-card-header">
            <div class="board-card-icon">${b.icon || '📋'}</div>
            <div class="board-card-name">${b.name}</div>
          </div>
          <div class="board-card-desc">${b.description || 'No description'}</div>
          <div class="board-card-progress">
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width:${pct}%; background:${b.color}"></div>
            </div>
            <div class="progress-labels">
              <span>${completed} of ${total} tasks</span>
              <span>${pct}%</span>
            </div>
          </div>
          <div class="board-card-footer">
            <div class="board-card-meta">
              <i data-lucide="columns" size="13"></i>
              ${b.buckets?.length || 0} buckets
            </div>
            <div style="display:flex;gap:0.25rem">
              <button class="icon-btn small edit-board-btn" data-id="${b.id}" title="Edit board"><i data-lucide="edit-3" size="14"></i></button>
              <button class="icon-btn small delete-board-btn" data-id="${b.id}" title="Delete board"><i data-lucide="trash-2" size="14"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Board card click → open board
    grid.querySelectorAll('.board-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.edit-board-btn') || e.target.closest('.delete-board-btn')) return;
        Board.open(card.dataset.boardId);
      });
    });

    // Edit board
    grid.querySelectorAll('.edit-board-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditBoard(btn.dataset.id);
      });
    });

    // Delete board
    grid.querySelectorAll('.delete-board-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const board = this._boards.find(b => b.id === btn.dataset.id);
        if (!await UI.confirm(`Delete board "${board?.name}"? All tasks will be permanently deleted.`)) return;
        try {
          await Api.boards.delete(btn.dataset.id);
          UI.toast('Board deleted', 'success');
          await this.load();
        } catch (err) { UI.toast(err.message, 'error'); }
      });
    });

    lucide.createIcons();
  },

  renderSidebarBoards() {
    const list = document.getElementById('boards-nav-list');
    if (!list) return;
    list.innerHTML = this._boards.map(b => `
      <div class="nav-board-item" data-id="${b.id}">
        <div class="nav-board-dot" style="background:${b.color}"></div>
        <span>${b.icon} ${b.name}</span>
      </div>
    `).join('') || `<div style="padding:0.25rem 0.75rem;font-size:0.8rem;color:var(--text-muted)">No boards yet</div>`;

    list.querySelectorAll('.nav-board-item').forEach(item => {
      item.addEventListener('click', () => Board.open(item.dataset.id));
    });
  },

  renderDueSoon(tasks) {
    const list = document.getElementById('due-soon-list');
    if (!list) return;

    if (!tasks.length) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:0.875rem;padding:0.5rem 0">🎉 No tasks due this week!</div>`;
      return;
    }

    list.innerHTML = tasks.map(t => {
      const status = UI.getDueDateStatus(t.due_date);
      const badgeClass = status === 'overdue' ? '' : status === 'today' ? 'today' : 'upcoming';
      const badgeText = status === 'overdue' ? '⚠ Overdue' : status === 'today' ? 'Today' : UI.formatDateShort(t.due_date);
      return `
        <div class="due-soon-item" data-task-id="${t.id}" data-board-id="${t.board_id}">
          <div class="due-soon-priority" style="background:${UI.priorityColor(t.priority)}"></div>
          <span class="due-soon-title">${t.title}</span>
          <span class="due-soon-meta">${t.board_name} · ${t.bucket_name}</span>
          <span class="due-badge ${badgeClass}">${badgeText}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.due-soon-item').forEach(item => {
      item.addEventListener('click', async () => {
        await Board.open(item.dataset.boardId);
        setTimeout(() => Board.openEditTask(item.dataset.taskId), 400);
      });
    });
  },

  // ---- New Board Modal ----
  openNewBoard() {
    this._selectedColor = '#6366f1';
    this._selectedEmoji = '📋';
    this._editBoardId = null;
    document.getElementById('new-board-name').value = '';
    document.getElementById('new-board-desc').value = '';
    document.querySelector('#modal-new-board .modal-title').textContent = 'Create New Board';
    document.getElementById('create-board-submit').textContent = 'Create Board';

    document.querySelectorAll('#board-emoji-picker .emoji-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.emoji === '📋');
    });
    document.querySelectorAll('#board-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === '#6366f1');
    });
    UI.openModal('modal-new-board');
    document.getElementById('new-board-name').focus();
  },

  openEditBoard(id) {
    const board = this._boards.find(b => b.id === id);
    if (!board) return;
    this._editBoardId = id;
    this._selectedColor = board.color || '#6366f1';
    this._selectedEmoji = board.icon || '📋';

    document.getElementById('new-board-name').value = board.name;
    document.getElementById('new-board-desc').value = board.description || '';
    document.querySelectorAll('#board-emoji-picker .emoji-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.emoji === board.icon);
    });
    document.querySelectorAll('#board-color-picker .color-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.color === board.color);
    });

    document.querySelector('#modal-new-board .modal-title').textContent = 'Edit Board';
    document.getElementById('create-board-submit').textContent = 'Save Changes';
    UI.openModal('modal-new-board');
  },

  async submitBoard() {
    const name = document.getElementById('new-board-name').value.trim();
    if (!name) { UI.toast('Board name is required', 'error'); return; }

    const data = {
      name,
      description: document.getElementById('new-board-desc').value.trim(),
      color: this._selectedColor,
      icon: this._selectedEmoji,
    };

    const currentSubsystem = App.getCurrentSubsystem();
    if (currentSubsystem) {
      data.subsystem_id = currentSubsystem.id;
    }

    try {
      if (this._editBoardId) {
        await Api.boards.update(this._editBoardId, data);
        this._editBoardId = null;
        UI.toast('Board updated', 'success');
      } else {
        await Api.boards.create(data);
        UI.toast('Board created!', 'success');
      }
      UI.closeModal('modal-new-board');
      document.querySelector('#modal-new-board .modal-title').textContent = 'Create New Board';
      document.getElementById('create-board-submit').textContent = 'Create Board';
      await this.load();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  bindEvents() {
    // New board buttons
    document.getElementById('new-board-btn')?.addEventListener('click', () => this.openNewBoard());
    document.getElementById('dashboard-new-board-btn')?.addEventListener('click', () => this.openNewBoard());
    document.getElementById('create-board-submit')?.addEventListener('click', () => this.submitBoard());

    // Board emoji & color pickers
    document.querySelectorAll('#board-emoji-picker .emoji-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#board-emoji-picker .emoji-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._selectedEmoji = opt.dataset.emoji;
      });
    });
    document.querySelectorAll('#board-color-picker .color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#board-color-picker .color-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._selectedColor = opt.dataset.color;
      });
    });

    // Enter key on board name
    document.getElementById('new-board-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitBoard();
    });
  }
};

window.Dashboard = Dashboard;
