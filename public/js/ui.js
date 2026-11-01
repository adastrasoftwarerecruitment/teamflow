/* ============================================================
   ui.js — Modals, Toasts, and shared UI utilities
   ============================================================ */

const UI = {

  // ---- Toast Notifications ----
  toast(message, type = 'info', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ---- Modal Management ----
  openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  },

  closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  },

  // ---- Format date ----
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  // ---- Due date status ----
  getDueDateStatus(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dateStr + 'T00:00:00');
    if (due < today)  return 'overdue';
    if (due.getTime() === today.getTime()) return 'today';
    return 'upcoming';
  },

  // ---- Format file size ----
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  // ---- Format relative time ----
  timeAgo(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },

  // ---- Priority color ----
  priorityColor(p) {
    return { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' }[p] || '#6366f1';
  },

  priorityLabel(p) {
    return { urgent: '🔴 Urgent', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' }[p] || p;
  },

  // ---- Member avatar HTML ----
  memberAvatar(member, size = '') {
    const initial = (member.name || '?')[0].toUpperCase();
    return `<div class="member-avatar ${size}" style="background:${member.color || '#6366f1'}" title="${member.name}">${initial}</div>`;
  },

  // ---- File type icon ----
  fileIcon(mimeType, ext) {
    const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const docs    = ['pdf', 'doc', 'docx', 'txt', 'odt'];
    const sheets  = ['xls', 'xlsx', 'csv', 'ods'];
    const code    = ['js', 'ts', 'py', 'java', 'c', 'cpp', 'json', 'xml', 'html', 'css'];
    const e = (ext || '').toLowerCase().replace('.', '');

    if (mimeType?.startsWith('image/') || images.includes(e)) return '🖼️';
    if (docs.includes(e))   return '📄';
    if (sheets.includes(e)) return '📊';
    if (code.includes(e))   return '💻';
    if (e === 'zip' || e === 'rar' || e === '7z') return '🗜️';
    return '📎';
  },

  // ---- Init all modal close buttons ----
  initModalCloseButtons() {
    document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = btn.getAttribute('data-modal') || btn.closest('.modal-overlay')?.id;
        if (modalId) UI.closeModal(modalId);
      });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) UI.closeModal(overlay.id);
      });
    });
  },

  // ---- Color & Emoji picker init ----
  initPicker(containerSelector, onChange) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.querySelectorAll('.color-option, .emoji-option').forEach(opt => {
      opt.addEventListener('click', () => {
        container.querySelectorAll('.color-option, .emoji-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        onChange(opt.dataset.color || opt.dataset.emoji);
      });
    });
  },

  getSelected(containerSelector) {
    const container = document.querySelector(containerSelector);
    const sel = container?.querySelector('.selected');
    return sel?.dataset.color || sel?.dataset.emoji || null;
  },

  // ---- Confirm dialog (simple) ----
  async confirm(message) {
    return window.confirm(message);
  },

  // ---- Render empty state ----
  emptyState(message, icon = '📭') {
    return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><p>${message}</p></div>`;
  }
};

window.UI = UI;
