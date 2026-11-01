/* ============================================================
   api.js — Centralized API client with Auth, Bearer token, and
            Capacitor Preferences storage for native context
   ============================================================ */

const Api = {
  _token: null,

  /* ── Token storage: Capacitor.Preferences (native) or localStorage ── */
  async getToken() {
    if (this._token) return this._token;
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        const { value } = await window.Capacitor.Plugins.Preferences.get({ key: 'tf_token' });
        this._token = value || null;
      } else {
        this._token = localStorage.getItem('tf_token') || null;
      }
    } catch (_) {
      this._token = localStorage.getItem('tf_token') || null;
    }
    return this._token;
  },

  async setToken(token) {
    this._token = token;
    try {
      if (window.Capacitor?.Plugins?.Preferences) {
        if (token) {
          await window.Capacitor.Plugins.Preferences.set({ key: 'tf_token', value: token });
        } else {
          await window.Capacitor.Plugins.Preferences.remove({ key: 'tf_token' });
        }
      } else {
        if (token) localStorage.setItem('tf_token', token);
        else localStorage.removeItem('tf_token');
      }
    } catch (_) {
      if (token) localStorage.setItem('tf_token', token);
      else localStorage.removeItem('tf_token');
    }
  },

  async clearToken() { await this.setToken(null); },

  /* ── Core request ────────────────────────────────────────────── */
  async request(method, path, body = null) {
    const { API_BASE } = window.AppConfig || {};
    const base = API_BASE || '';

    const opts = {
      method,
      credentials: 'include', // send cookies for web context
      headers: {},
    };

    // Attach Bearer token (required for Capacitor native context)
    const token = await this.getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    if (body && !(body instanceof FormData)) {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    } else if (body instanceof FormData) {
      opts.body = body;
      // Content-Type is set automatically with boundary by browser for FormData
    }

    try {
      const res = await fetch(`${base}/api${path}`, opts);

      if (res.status === 401) {
        if (path !== '/auth/me' && path !== '/auth/login') {
          if (window.App && typeof window.App.handleUnauthorized === 'function') {
            window.App.handleUnauthorized();
          }
        }
        const err = await res.json().catch(() => ({ error: 'Unauthorized' }));
        const error = new Error(err.error || 'Unauthorized');
        error.status = 401;
        throw error;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const error = new Error(err.error || 'Request failed');
        error.status = res.status;
        throw error;
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
      return res;
    } catch (e) {
      if (e.status !== 401 || (path !== '/auth/me' && path !== '/auth/login')) {
        console.error(`API Error [${method} ${path}]:`, e.message);
      }
      throw e;
    }
  },

  get:    (path)       => Api.request('GET', path),
  post:   (path, body) => Api.request('POST', path, body),
  put:    (path, body) => Api.request('PUT', path, body),
  delete: (path)       => Api.request('DELETE', path),

  // ── Authentication ──────────────────────────────────────────
  auth: {
    login:          (data) => Api.post('/auth/login', data),
    logout:         ()     => Api.post('/auth/logout'),
    me:             ()     => Api.get('/auth/me'),
    changePassword: (data) => Api.post('/auth/change-password', data),
  },

  // ── Subsystems (Super Admin) ─────────────────────────────────
  subsystems: {
    getAll:        ()         => Api.get('/subsystems'),
    create:        (data)     => Api.post('/subsystems', data),
    update:        (id, d)    => Api.put(`/subsystems/${id}`, d),
    delete:        (id)       => Api.delete(`/subsystems/${id}`),
    getUsers:      (id)       => Api.get(`/subsystems/${id}/users`),
    createUser:    (id, data) => Api.post(`/subsystems/${id}/users`, data),
    updateUser:    (id, data) => Api.put(`/subsystems/users/${id}`, data),
    deleteUser:    (id)       => Api.delete(`/subsystems/users/${id}`),
    resetPassword: (id, data) => Api.post(`/subsystems/users/${id}/reset-password`, data),
  },

  // ── Boards ────────────────────────────────────────────────────
  boards: {
    getAll:   (params = {}) => {
      const q = new URLSearchParams(typeof params === 'object' ? params : {}).toString();
      return Api.get(`/boards${q ? '?' + q : ''}`);
    },
    getOne:   (id)    => Api.get(`/boards/${id}`),
    create:   (data)  => Api.post('/boards', data),
    update:   (id, d) => Api.put(`/boards/${id}`, d),
    delete:   (id)    => Api.delete(`/boards/${id}`),
    activity: (id)    => Api.get(`/boards/${id}/activity`),
  },

  // ── Buckets ───────────────────────────────────────────────────
  buckets: {
    create:  (data)     => Api.post('/buckets', data),
    update:  (id, data) => Api.put(`/buckets/${id}`, data),
    delete:  (id)       => Api.delete(`/buckets/${id}`),
    reorder: (boardId, order) => Api.put(`/buckets/reorder/${boardId}`, { order }),
  },

  // ── Tasks ─────────────────────────────────────────────────────
  tasks: {
    getAll:   (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return Api.get(`/tasks${q ? '?' + q : ''}`);
    },
    getOne:   (id)          => Api.get(`/tasks/${id}`),
    create:   (data)        => Api.post('/tasks', data),
    update:   (id, data)    => Api.put(`/tasks/${id}`, data),
    move:     (id, data)    => Api.put(`/tasks/${id}/move`, data),
    delete:   (id)          => Api.delete(`/tasks/${id}`),
    addChecklistItem:    (id, text) => Api.post(`/tasks/${id}/checklist`, { text }),
    updateChecklistItem: (cid, d)   => Api.put(`/tasks/checklist/${cid}`, d),
    deleteChecklistItem: (cid)      => Api.delete(`/tasks/checklist/${cid}`),
    createLabel: (boardId, data)    => Api.post(`/tasks/labels/board/${boardId}`, data),
  },

  // ── Members ───────────────────────────────────────────────────
  members: {
    getAll:   (params = {}) => {
      const q = new URLSearchParams(typeof params === 'object' ? params : {}).toString();
      return Api.get(`/members${q ? '?' + q : ''}`);
    },
    getOne:   (id)    => Api.get(`/members/${id}`),
    create:   (data)  => Api.post('/members', data),
    update:   (id, d) => Api.put(`/members/${id}`, d),
    delete:   (id)    => Api.delete(`/members/${id}`),
    tasks:    (id)    => Api.get(`/members/${id}/tasks`),
  },

  // ── Comments ──────────────────────────────────────────────────
  comments: {
    forTask: (tid)  => Api.get(`/comments/task/${tid}`),
    create:  (data) => Api.post('/comments', data),
    delete:  (id)   => Api.delete(`/comments/${id}`),
  },

  // ── Attachments ───────────────────────────────────────────────
  attachments: {
    forTask:  (tid)     => Api.get(`/attachments/task/${tid}`),
    upload:   (tid, fd) => Api.request('POST', `/attachments/upload/${tid}`, fd),
    download: (id)      => {
      const { API_BASE } = window.AppConfig || {};
      return `${API_BASE || ''}/api/attachments/${id}/download`;
    },
    delete:   (id)      => Api.delete(`/attachments/${id}`),
  },

  // ── Analytics ─────────────────────────────────────────────────
  analytics: {
    overview: (params = {}) => {
      const q = new URLSearchParams(typeof params === 'object' ? params : {}).toString();
      return Api.get(`/analytics/overview${q ? '?' + q : ''}`);
    },
    calendar: (year, month, params = {}) => {
      const sp = new URLSearchParams({ year, month, ...(typeof params === 'object' ? params : {}) });
      return Api.get(`/analytics/calendar?${sp.toString()}`);
    },
  },

  // ── Notifications ─────────────────────────────────────────────
  notifications: {
    getAll:         ()        => Api.get('/notifications'),
    markRead:       (id)      => Api.post(`/notifications/${id}/read`),
    markAllRead:    ()        => Api.post('/notifications/read-all'),
    getPrefs:       ()        => Api.get('/notifications/prefs'),
    updatePrefs:    (data)    => Api.put('/notifications/prefs', data),
    registerDevice: (data)    => Api.post('/notifications/register-device', data),
    removeDevice:   (token)   => Api.delete(`/notifications/device/${encodeURIComponent(token)}`),
  },
};

window.Api = Api;
