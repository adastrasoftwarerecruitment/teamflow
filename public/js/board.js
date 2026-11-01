/* ============================================================
   board.js — Board view, task cards, drag & drop, task modal
   ============================================================ */

const Board = {
  _currentBoard: null,
  _viewMode: 'kanban', // 'kanban' | 'list'
  _dragTask: null,
  _taskEditId: null,
  _selectedBucketId: null,
  _selectedAssignees: [],
  _selectedLabels: [],
  _boardColor: '#6366f1',
  _boardEmoji: '📋',

  async open(boardId) {
    App.navigate('board');
    try {
      this._currentBoard = await Api.boards.getOne(boardId);
    } catch (e) {
      UI.toast('Failed to load board', 'error');
      return;
    }
    document.getElementById('board-title').textContent = this._currentBoard.name;
    document.getElementById('board-description').textContent = this._currentBoard.description || '';
    document.getElementById('board-header-icon').textContent = this._currentBoard.icon || '📋';

    // Mark active in sidebar
    document.querySelectorAll('.nav-board-item').forEach(i => i.classList.toggle('active', i.dataset.id === boardId));

    this.render();
  },

  render() {
    if (this._viewMode === 'kanban') this.renderKanban();
    else this.renderList();
    this.updateFilterMemberSelect();
  },

  // =================== KANBAN VIEW ===================
  renderKanban() {
    const board = document.getElementById('kanban-board');
    board.style.display = 'flex';
    const listView = document.getElementById('task-list-view');
    if (listView) listView.style.display = 'none';

    board.innerHTML = '';

    this._currentBoard.buckets.forEach(bucket => {
      board.appendChild(this.renderBucketColumn(bucket));
    });

    // Add bucket button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-bucket-btn';
    addBtn.innerHTML = `<i data-lucide="plus-circle" size="22"></i><span>Add Bucket</span>`;
    addBtn.addEventListener('click', () => this.addBucket());
    board.appendChild(addBtn);

    lucide.createIcons();
    this.bindDragDrop();
  },

  renderBucketColumn(bucket) {
    const col = document.createElement('div');
    col.className = 'bucket-column';
    col.dataset.bucketId = bucket.id;

    const tasks = bucket.tasks || [];
    const taskCount = tasks.length;

    col.innerHTML = `
      <div class="bucket-header">
        <div class="bucket-color-bar" style="background:${this._currentBoard.color || '#6366f1'}"></div>
        <span class="bucket-name" title="${bucket.name}">${bucket.name}</span>
        <span class="bucket-task-count">${taskCount}</span>
        <div class="bucket-actions">
          <button class="icon-btn small" data-action="edit-bucket" title="Rename"><i data-lucide="edit-3" size="14"></i></button>
          <button class="icon-btn small" data-action="delete-bucket" title="Delete bucket"><i data-lucide="trash-2" size="14"></i></button>
        </div>
      </div>
      <div class="bucket-task-list" data-bucket-id="${bucket.id}">
        ${tasks.map(t => this.renderTaskCard(t)).join('')}
      </div>
      <div class="bucket-footer">
        <button class="bucket-add-task-btn" data-bucket-id="${bucket.id}">
          <i data-lucide="plus" size="14"></i> Add task
        </button>
      </div>
    `;

    // Bucket actions
    col.querySelector('[data-action="edit-bucket"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editBucketName(bucket.id, col.querySelector('.bucket-name'));
    });

    col.querySelector('[data-action="delete-bucket"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteBucket(bucket.id);
    });

    col.querySelector('.bucket-add-task-btn')?.addEventListener('click', () => {
      this.openNewTask(bucket.id);
    });

    // Task card clicks
    col.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.task-card-complete-btn')) return;
        this.openEditTask(card.dataset.taskId);
      });
    });

    // Complete button
    col.querySelectorAll('.task-card-complete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleComplete(btn.dataset.taskId, btn.dataset.completed === '1');
      });
    });

    return col;
  },

  renderTaskCard(task) {
    const priority = task.priority || 'medium';
    const priorityColor = UI.priorityColor(priority);
    const status = UI.getDueDateStatus(task.due_date);
    const isCompleted = task.completed === 1;
    const checkDone = task.checklists?.filter(c => c.completed).length || 0;
    const checkTotal = task.checklists?.length || 0;
    const checkPct = checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0;

    return `
      <div class="task-card ${isCompleted ? 'completed' : ''}"
           data-task-id="${task.id}"
           draggable="true"
           style="--task-priority-color: ${priorityColor}">

        <button class="task-card-complete-btn"
                data-task-id="${task.id}"
                data-completed="${task.completed}"
                title="${isCompleted ? 'Mark incomplete' : 'Mark complete'}">
          ${isCompleted ? '<i data-lucide="check" size="12"></i>' : ''}
        </button>

        ${task.labels?.length ? `
          <div class="task-card-labels">
            ${task.labels.map(l => `<div class="task-label-badge" style="background:${l.color}" title="${l.name}"></div>`).join('')}
          </div>
        ` : ''}

        <div class="task-card-title">${this.escapeHtml(task.title)}</div>

        ${checkTotal > 0 ? `
          <div class="task-card-checklist">
            <div class="checklist-progress-bar">
              <div class="checklist-progress-fill" style="width:${checkPct}%"></div>
            </div>
            <span class="checklist-count">${checkDone}/${checkTotal}</span>
          </div>
        ` : ''}

        <div class="task-card-footer">
          <div class="task-card-assignees">
            ${(task.assignees || []).slice(0,4).map(a => UI.memberAvatar(a)).join('')}
          </div>
          <div class="task-card-meta">
            ${task.commentCount > 0 ? `<span class="task-meta-icon"><i data-lucide="message-circle" size="12"></i>${task.commentCount}</span>` : ''}
            ${task.attachmentCount > 0 ? `<span class="task-meta-icon"><i data-lucide="paperclip" size="12"></i>${task.attachmentCount}</span>` : ''}
            ${task.due_date ? `
              <span class="task-due-date ${status || ''}">
                <i data-lucide="calendar" size="10"></i>
                ${UI.formatDateShort(task.due_date)}
              </span>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  // =================== LIST VIEW ===================
  renderList() {
    const board = document.getElementById('kanban-board');
    board.style.display = 'none';

    let listView = document.getElementById('task-list-view');
    if (!listView) {
      listView = document.createElement('div');
      listView.id = 'task-list-view';
      listView.className = 'task-list-view';
      board.parentNode.insertBefore(listView, board.nextSibling);
    }
    listView.style.display = '';
    listView.innerHTML = '';

    this._currentBoard.buckets.forEach(bucket => {
      if (!bucket.tasks?.length) return;
      const group = document.createElement('div');
      group.className = 'task-list-group';
      group.innerHTML = `
        <div class="task-list-group-header">
          <div class="bucket-color-bar" style="background:${this._currentBoard.color}"></div>
          ${bucket.name} <span style="color:var(--text-muted)">(${bucket.tasks.length})</span>
        </div>
        ${bucket.tasks.map(t => `
          <div class="task-list-item ${t.completed ? 'completed' : ''}" data-task-id="${t.id}">
            <div class="task-due-date ${UI.getDueDateStatus(t.due_date) || ''}">
              ${UI.formatDateShort(t.due_date) || '—'}
            </div>
            <span class="task-priority-badge priority-${t.priority}">${t.priority}</span>
            <span class="task-list-title">${this.escapeHtml(t.title)}</span>
            <div class="task-card-assignees">
              ${(t.assignees || []).slice(0,3).map(a => UI.memberAvatar(a)).join('')}
            </div>
          </div>
        `).join('')}
      `;

      group.querySelectorAll('.task-list-item').forEach(item => {
        item.addEventListener('click', () => this.openEditTask(item.dataset.taskId));
      });

      listView.appendChild(group);
    });

    if (!listView.innerHTML) listView.innerHTML = UI.emptyState('No tasks yet. Add your first task!', '✅');
    lucide.createIcons();
  },

  // =================== DRAG & DROP ===================
  bindDragDrop() {
    document.querySelectorAll('.task-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        this._dragTask = { id: card.dataset.taskId };
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.bucket-task-list').forEach(l => l.classList.remove('drag-over'));
      });
    });

    document.querySelectorAll('.bucket-task-list').forEach(list => {
      list.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.classList.add('drag-over');
      });
      list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
      list.addEventListener('drop', async (e) => {
        e.preventDefault();
        list.classList.remove('drag-over');
        if (!this._dragTask) return;
        const targetBucketId = list.dataset.bucketId;
        const cards = [...list.querySelectorAll('.task-card:not(.dragging)')];
        const afterCard = this.getDragAfterElement(list, e.clientY);
        const position = afterCard ? cards.indexOf(afterCard) : cards.length;
        try {
          await Api.tasks.move(this._dragTask.id, { bucket_id: targetBucketId, position });
          this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
          this.render();
        } catch (err) {
          UI.toast('Failed to move task', 'error');
        }
        this._dragTask = null;
      });
    });
  },

  getDragAfterElement(container, y) {
    const draggables = [...container.querySelectorAll('.task-card:not(.dragging)')];
    return draggables.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  },

  // =================== TASK MODAL ===================
  async openNewTask(bucketId) {
    this._taskEditId = null;
    this._selectedBucketId = bucketId || this._currentBoard.buckets[0]?.id;
    this._selectedAssignees = [];
    this._selectedLabels = [];

    document.getElementById('task-modal-title').textContent = 'New Task';
    document.getElementById('task-title-input').value = '';
    document.getElementById('task-desc-input').value = '';
    document.getElementById('task-priority-input').value = 'medium';
    document.getElementById('task-due-input').value = '';
    document.getElementById('task-submit-btn').textContent = 'Create Task';
    document.getElementById('task-delete-btn').style.display = 'none';
    document.getElementById('task-modal-sidebar').style.display = 'none';
    document.getElementById('checklist-section').style.display = 'none';

    this.renderBucketSelect();
    await this.renderAssigneesPicker([]);
    await this.renderLabelsPicker([]);
    UI.openModal('modal-task');
    document.getElementById('task-title-input').focus();
  },

  async openEditTask(taskId) {
    let task;
    try {
      task = await Api.tasks.getOne(taskId);
    } catch (e) { UI.toast('Failed to load task', 'error'); return; }

    this._taskEditId = taskId;
    this._selectedBucketId = task.bucket_id;
    this._selectedAssignees = task.assignees.map(a => a.id);
    this._selectedLabels = task.labels.map(l => l.id);

    document.getElementById('task-modal-title').textContent = 'Edit Task';
    document.getElementById('task-title-input').value = task.title;
    document.getElementById('task-desc-input').value = task.description || '';
    document.getElementById('task-priority-input').value = task.priority || 'medium';
    document.getElementById('task-due-input').value = task.due_date || '';
    document.getElementById('task-submit-btn').textContent = 'Save Changes';
    document.getElementById('task-delete-btn').style.display = '';
    document.getElementById('task-modal-sidebar').style.display = '';
    document.getElementById('checklist-section').style.display = '';

    this.renderBucketSelect(task.bucket_id);
    await this.renderAssigneesPicker(this._selectedAssignees);
    await this.renderLabelsPicker(this._selectedLabels);
    this.renderChecklist(task.checklists || [], taskId);
    this.renderAttachments(task.attachments || [], taskId);
    this.renderComments(task.comments || [], taskId);
    UI.openModal('modal-task');
  },

  renderBucketSelect(selectedBucketId) {
    const sel = document.getElementById('task-bucket-input');
    sel.innerHTML = this._currentBoard.buckets.map(b =>
      `<option value="${b.id}" ${b.id === (selectedBucketId || this._selectedBucketId) ? 'selected' : ''}>${b.name}</option>`
    ).join('');
  },

  async renderAssigneesPicker(selectedIds) {
    const members = Members.getAll();
    const container = document.getElementById('task-assignees-picker');
    container.innerHTML = members.map(m => {
      const sel = selectedIds.includes(m.id);
      return `
        <div class="assignee-chip ${sel ? 'selected' : ''}" data-member-id="${m.id}">
          ${UI.memberAvatar(m)}
          <span>${m.name}</span>
        </div>
      `;
    }).join('') || '<span style="color:var(--text-muted);font-size:0.8rem">No members added yet</span>';

    container.querySelectorAll('.assignee-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.memberId;
        if (this._selectedAssignees.includes(id)) {
          this._selectedAssignees = this._selectedAssignees.filter(x => x !== id);
          chip.classList.remove('selected');
        } else {
          this._selectedAssignees.push(id);
          chip.classList.add('selected');
        }
      });
    });
  },

  async renderLabelsPicker(selectedIds) {
    const labels = this._currentBoard.labels || [];
    const container = document.getElementById('task-labels-picker');
    if (!labels.length) {
      container.innerHTML = `
        <button class="btn btn-ghost small" id="add-label-btn">
          <i data-lucide="tag" size="12"></i> Add Label
        </button>
      `;
      document.getElementById('add-label-btn')?.addEventListener('click', () => this.promptNewLabel());
      lucide.createIcons();
      return;
    }

    container.innerHTML = labels.map(l => {
      const sel = selectedIds.includes(l.id);
      return `<div class="label-chip ${sel ? 'selected' : ''}" data-label-id="${l.id}" style="background:${l.color};color:white">${l.name}</div>`;
    }).join('') + `<button class="btn btn-ghost small" id="add-label-btn"><i data-lucide="plus" size="12"></i></button>`;

    container.querySelectorAll('.label-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.labelId;
        if (this._selectedLabels.includes(id)) {
          this._selectedLabels = this._selectedLabels.filter(x => x !== id);
          chip.classList.remove('selected');
        } else {
          this._selectedLabels.push(id);
          chip.classList.add('selected');
        }
      });
    });

    document.getElementById('add-label-btn')?.addEventListener('click', () => this.promptNewLabel());
    lucide.createIcons();
  },

  async promptNewLabel() {
    const name = prompt('Label name:');
    if (!name) return;
    const colors = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#06b6d4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    try {
      await Api.tasks.createLabel(this._currentBoard.id, { name, color });
      this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
      await this.renderLabelsPicker(this._selectedLabels);
    } catch (e) {
      UI.toast('Failed to create label', 'error');
    }
  },

  renderChecklist(items, taskId) {
    const container = document.getElementById('checklist-items');
    container.innerHTML = items.map(item => `
      <div class="checklist-item" data-checklist-id="${item.id}">
        <input type="checkbox" ${item.completed ? 'checked' : ''} data-cid="${item.id}" />
        <span class="checklist-item-text ${item.completed ? 'done' : ''}">${this.escapeHtml(item.text)}</span>
        <button class="icon-btn small" data-delete-cid="${item.id}" title="Delete"><i data-lucide="x" size="12"></i></button>
      </div>
    `).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        await Api.tasks.updateChecklistItem(cb.dataset.cid, { completed: cb.checked ? 1 : 0 });
        cb.nextElementSibling.classList.toggle('done', cb.checked);
      });
    });

    container.querySelectorAll('[data-delete-cid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await Api.tasks.deleteChecklistItem(btn.dataset.deleteCid);
        btn.closest('.checklist-item').remove();
      });
    });

    lucide.createIcons();
  },

  renderAttachments(attachments, taskId) {
    const list = document.getElementById('attachment-list');
    list.innerHTML = attachments.map(a => {
      const ext = a.original_name.split('.').pop();
      const icon = UI.fileIcon(a.mime_type, ext);
      return `
        <div class="attachment-item">
          <div class="attachment-icon">${icon}</div>
          <div class="attachment-info">
            <a class="attachment-name" href="${Api.attachments.download(a.id)}" target="_blank" title="${a.original_name}">${a.original_name}</a>
            <div class="attachment-meta">${UI.formatBytes(a.file_size)} · ${a.uploaded_by} · ${UI.timeAgo(a.created_at)}</div>
          </div>
          <button class="icon-btn small" data-delete-att="${a.id}" title="Delete"><i data-lucide="trash-2" size="12"></i></button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-delete-att]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await Api.attachments.delete(btn.dataset.deleteAtt);
          btn.closest('.attachment-item').remove();
          UI.toast('Attachment deleted', 'success');
        } catch (e) { UI.toast('Failed to delete', 'error'); }
      });
    });

    lucide.createIcons();

    // Upload handler
    const fileInput = document.getElementById('attachment-file-input');
    fileInput.onchange = async () => {
      if (!fileInput.files.length) return;
      const fd = new FormData();
      [...fileInput.files].forEach(f => fd.append('files', f));
      const currentUser = App.getCurrentUser();
      const authorName = currentUser?.display_name || currentUser?.name || currentUser?.username || 'Unknown';
      fd.append('uploaded_by', authorName);
      try {
        const uploaded = await Api.attachments.upload(taskId, fd);
        this.renderAttachments([...attachments, ...uploaded], taskId);
        attachments = [...attachments, ...uploaded];
        UI.toast(`${uploaded.length} file(s) uploaded`, 'success');
        fileInput.value = '';
      } catch (e) { UI.toast('Upload failed', 'error'); }
    };
  },

  renderComments(comments, taskId) {
    const list = document.getElementById('comments-list');
    list.innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="member-avatar" style="background:${c.member_color || '#6366f1'};width:28px;height:28px;font-size:0.7rem;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;color:white">
          ${(c.author_name || '?')[0].toUpperCase()}
        </div>
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-author">${c.author_name}</span>
            <span class="comment-time">${UI.timeAgo(c.created_at)}</span>
          </div>
          <div class="comment-text">${this.escapeHtml(c.content)}</div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted);font-size:0.82rem">No comments yet</p>';

    document.getElementById('comment-submit-btn').onclick = async () => {
      const content = document.getElementById('comment-input').value.trim();
      if (!content) return;
      const currentUser = App.getCurrentUser();
      const authorName = currentUser?.display_name || currentUser?.name || currentUser?.username || 'Anonymous';
      try {
        const comment = await Api.comments.create({
          task_id: taskId,
          member_id: currentUser?.id || null,
          author_name: authorName,
          content
        });
        document.getElementById('comment-input').value = '';
        comments.push(comment);
        this.renderComments(comments, taskId);
      } catch (e) { UI.toast('Failed to post comment', 'error'); }
    };
  },

  async submitTask() {
    const title = document.getElementById('task-title-input').value.trim();
    if (!title) { UI.toast('Title is required', 'error'); return; }

    const data = {
      title,
      description: document.getElementById('task-desc-input').value.trim(),
      priority: document.getElementById('task-priority-input').value,
      due_date: document.getElementById('task-due-input').value || null,
      bucket_id: document.getElementById('task-bucket-input').value,
      board_id: this._currentBoard.id,
      assignees: this._selectedAssignees,
      labels: this._selectedLabels,
    };

    try {
      if (this._taskEditId) {
        await Api.tasks.update(this._taskEditId, data);
        UI.toast('Task updated', 'success');
      } else {
        await Api.tasks.create(data);
        UI.toast('Task created', 'success');
      }
      UI.closeModal('modal-task');
      this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
      this.render();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async deleteTask() {
    if (!this._taskEditId) return;
    if (!await UI.confirm('Delete this task? This cannot be undone.')) return;
    try {
      await Api.tasks.delete(this._taskEditId);
      UI.toast('Task deleted', 'success');
      UI.closeModal('modal-task');
      this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
      this.render();
    } catch (e) { UI.toast(e.message, 'error'); }
  },

  async toggleComplete(taskId, isCompleted) {
    try {
      await Api.tasks.update(taskId, { completed: isCompleted ? 0 : 1 });
      this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
      this.render();
    } catch (e) { UI.toast('Failed to update task', 'error'); }
  },

  // =================== BUCKET OPS ===================
  async addBucket() {
    const name = prompt('Bucket name:');
    if (!name) return;
    try {
      await Api.buckets.create({ board_id: this._currentBoard.id, name });
      this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
      this.render();
    } catch (e) { UI.toast('Failed to create bucket', 'error'); }
  },

  editBucketName(bucketId, nameEl) {
    const original = nameEl.textContent;
    nameEl.contentEditable = 'true';
    nameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const save = async () => {
      nameEl.contentEditable = 'false';
      const newName = nameEl.textContent.trim();
      if (newName && newName !== original) {
        try {
          await Api.buckets.update(bucketId, { name: newName });
          this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
          this.render();
        } catch (e) { UI.toast('Failed to rename', 'error'); nameEl.textContent = original; }
      } else {
        nameEl.textContent = original;
      }
    };

    nameEl.onblur = save;
    nameEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } };
  },

  async deleteBucket(bucketId) {
    if (!await UI.confirm('Delete this bucket and all its tasks?')) return;
    try {
      await Api.buckets.delete(bucketId);
      this._currentBoard = await Api.boards.getOne(this._currentBoard.id);
      this.render();
    } catch (e) { UI.toast('Failed to delete bucket', 'error'); }
  },

  // =================== FILTER ===================
  updateFilterMemberSelect() {
    const sel = document.getElementById('filter-member');
    if (!sel) return;
    const members = Members.getAll();
    sel.innerHTML = '<option value="">All Members</option>' +
      members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  },

  async applyFilters() {
    const priority = document.getElementById('filter-priority').value;
    const memberId = document.getElementById('filter-member').value;
    const overdue  = document.getElementById('filter-overdue').checked;

    const params = { board_id: this._currentBoard.id };
    if (priority) params.priority = priority;
    if (memberId) params.member_id = memberId;
    if (overdue) params.overdue = 'true';

    try {
      const tasks = await Api.tasks.getAll(params);
      // Map tasks back into buckets
      const buckets = this._currentBoard.buckets.map(b => ({
        ...b,
        tasks: tasks.filter(t => t.bucket_id === b.id)
      }));
      const tempBoard = { ...this._currentBoard, buckets };
      const saved = this._currentBoard;
      this._currentBoard = tempBoard;
      this.render();
      this._currentBoard = saved;
      // Re-inject filtered tasks but keep reference
      this._currentBoard = tempBoard;
    } catch (e) { UI.toast('Filter failed', 'error'); }
  },

  // =================== BOARD SETTINGS ===================
  bindBoardPageEvents() {
    document.getElementById('add-task-btn')?.addEventListener('click', () => this.openNewTask());
    document.getElementById('view-kanban')?.addEventListener('click', () => {
      this._viewMode = 'kanban';
      document.getElementById('view-kanban').classList.add('active');
      document.getElementById('view-list').classList.remove('active');
      this.render();
    });
    document.getElementById('view-list')?.addEventListener('click', () => {
      this._viewMode = 'list';
      document.getElementById('view-list').classList.add('active');
      document.getElementById('view-kanban').classList.remove('active');
      this.render();
    });
    document.getElementById('board-filter-btn')?.addEventListener('click', () => {
      document.getElementById('filter-bar').classList.toggle('hidden');
    });
    document.getElementById('filter-priority')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-member')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-overdue')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('clear-filters')?.addEventListener('click', () => {
      document.getElementById('filter-priority').value = '';
      document.getElementById('filter-member').value = '';
      document.getElementById('filter-overdue').checked = false;
      this._currentBoard && Api.boards.getOne(this._currentBoard.id).then(b => { this._currentBoard = b; this.render(); });
    });
    document.getElementById('back-to-dashboard')?.addEventListener('click', () => {
      App.navigate('dashboard');
      Dashboard.load();
    });
    document.getElementById('task-submit-btn')?.addEventListener('click', () => this.submitTask());
    document.getElementById('task-delete-btn')?.addEventListener('click', () => this.deleteTask());

    // Checklist add
    document.getElementById('checklist-add-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('checklist-new-item');
      const text = input.value.trim();
      if (!text || !this._taskEditId) return;
      try {
        const item = await Api.tasks.addChecklistItem(this._taskEditId, text);
        input.value = '';
        const task = await Api.tasks.getOne(this._taskEditId);
        this.renderChecklist(task.checklists, this._taskEditId);
      } catch (e) { UI.toast('Failed to add item', 'error'); }
    });
    document.getElementById('checklist-new-item')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('checklist-add-btn').click();
    });
  },

  escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }
};

window.Board = Board;
