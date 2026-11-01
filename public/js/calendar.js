/* ============================================================
   calendar.js — Calendar view
   ============================================================ */

const CalendarView = {
  _year: new Date().getFullYear(),
  _month: new Date().getMonth() + 1,
  _tasks: [],

  async load() {
    await this.fetchTasks();
    this.render();
  },

  async fetchTasks() {
    try {
      const params = {};
      const currentSubsystem = App.getCurrentSubsystem();
      if (currentSubsystem) {
        params._subsystem = currentSubsystem.id;
      }
      this._tasks = await Api.analytics.calendar(this._year, this._month, params);
    } catch (e) {
      this._tasks = [];
    }
  },

  render() {
    const label = document.getElementById('cal-month-label');
    const grid  = document.getElementById('calendar-grid');
    if (!label || !grid) return;

    const monthName = new Date(this._year, this._month - 1, 1).toLocaleString('default', { month: 'long' });
    label.textContent = `${monthName} ${this._year}`;

    const firstDay = new Date(this._year, this._month - 1, 1).getDay();
    const daysInMonth = new Date(this._year, this._month, 0).getDate();
    const prevDays = new Date(this._year, this._month - 1, 0).getDate();
    const today = new Date();

    let html = '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    days.forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });

    // Previous month filler
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="cal-day other-month"><div class="cal-day-num">${prevDays - i}</div></div>`;
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this._year}-${String(this._month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = today.getDate() === d && today.getMonth() + 1 === this._month && today.getFullYear() === this._year;
      const dayTasks = this._tasks.filter(t => t.due_date === dateStr);

      html += `
        <div class="cal-day ${isToday ? 'today' : ''}">
          <div class="cal-day-num">${isToday ? `<span>${d}</span>` : d}</div>
          ${dayTasks.slice(0,3).map(t => `
            <div class="cal-task-pill"
                 style="background:${t.board_color || '#6366f1'}"
                 data-task-id="${t.id}"
                 data-board-id="${t.board_id}"
                 title="${t.title}">
              ${t.title}
            </div>
          `).join('')}
          ${dayTasks.length > 3 ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.15rem">+${dayTasks.length - 3} more</div>` : ''}
        </div>
      `;
    }

    // Filler for next month
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    let next = 1;
    for (let i = firstDay + daysInMonth; i < totalCells; i++, next++) {
      html += `<div class="cal-day other-month"><div class="cal-day-num">${next}</div></div>`;
    }

    grid.innerHTML = html;

    // Task pill clicks
    grid.querySelectorAll('.cal-task-pill').forEach(pill => {
      pill.addEventListener('click', async (e) => {
        e.stopPropagation();
        await Board.open(pill.dataset.boardId);
        setTimeout(() => Board.openEditTask(pill.dataset.taskId), 400);
      });
    });
  },

  bindEvents() {
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      this._month--;
      if (this._month < 1) { this._month = 12; this._year--; }
      this.load();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      this._month++;
      if (this._month > 12) { this._month = 1; this._year++; }
      this.load();
    });
    document.getElementById('cal-today')?.addEventListener('click', () => {
      this._year = new Date().getFullYear();
      this._month = new Date().getMonth() + 1;
      this.load();
    });
  }
};

window.CalendarView = CalendarView;
