/* ============================================================
   analytics.js — Charts and analytics page
   ============================================================ */

const Analytics = {
  _charts: {},

  async load() {
    try {
      const params = {};
      const currentSubsystem = App.getCurrentSubsystem();
      if (currentSubsystem) {
        params._subsystem = currentSubsystem.id;
      }
      const stats = await Api.analytics.overview(params);
      this.renderCharts(stats);
    } catch (e) {
      console.error('Analytics load failed', e);
    }
  },

  destroyAll() {
    Object.values(this._charts).forEach(c => c?.destroy());
    this._charts = {};
  },

  getChartDefaults() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#9999cc' : '#6666aa',
      gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    };
  },

  renderCharts(stats) {
    this.destroyAll();
    const { textColor, gridColor } = this.getChartDefaults();

    // Chart 1: Tasks by Board (horizontal bar)
    const boardCtx = document.getElementById('chart-by-board');
    if (boardCtx && stats.tasksByBoard?.length) {
      this._charts.board = new Chart(boardCtx, {
        type: 'bar',
        data: {
          labels: stats.tasksByBoard.map(b => b.name),
          datasets: [
            {
              label: 'Total',
              data: stats.tasksByBoard.map(b => b.total),
              backgroundColor: stats.tasksByBoard.map(b => b.color + '99'),
              borderColor: stats.tasksByBoard.map(b => b.color),
              borderWidth: 2,
              borderRadius: 6,
            },
            {
              label: 'Completed',
              data: stats.tasksByBoard.map(b => b.completed),
              backgroundColor: '#22c55e55',
              borderColor: '#22c55e',
              borderWidth: 2,
              borderRadius: 6,
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            legend: { labels: { color: textColor, font: { family: 'Inter' } } }
          },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor } }
          }
        }
      });
    }

    // Chart 2: Tasks by Priority (doughnut)
    const priorityCtx = document.getElementById('chart-by-priority');
    if (priorityCtx) {
      const priorityMap = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };
      const priorityData = stats.tasksByPriority || [];
      this._charts.priority = new Chart(priorityCtx, {
        type: 'doughnut',
        data: {
          labels: priorityData.map(p => p.priority?.charAt(0).toUpperCase() + p.priority?.slice(1)),
          datasets: [{
            data: priorityData.map(p => p.count),
            backgroundColor: priorityData.map(p => priorityMap[p.priority] + 'cc'),
            borderColor: priorityData.map(p => priorityMap[p.priority]),
            borderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          cutout: '65%',
          plugins: {
            legend: { labels: { color: textColor, font: { family: 'Inter' } } }
          }
        }
      });
    }

    // Chart 3: Team Workload (bar)
    const memberCtx = document.getElementById('chart-by-member');
    if (memberCtx && stats.tasksByMember?.length) {
      this._charts.member = new Chart(memberCtx, {
        type: 'bar',
        data: {
          labels: stats.tasksByMember.map(m => m.name),
          datasets: [
            {
              label: 'Total Tasks',
              data: stats.tasksByMember.map(m => m.total),
              backgroundColor: stats.tasksByMember.map(m => (m.color || '#6366f1') + '99'),
              borderColor: stats.tasksByMember.map(m => m.color || '#6366f1'),
              borderWidth: 2,
              borderRadius: 6,
            },
            {
              label: 'Completed',
              data: stats.tasksByMember.map(m => m.completed),
              backgroundColor: '#22c55e55',
              borderColor: '#22c55e',
              borderWidth: 2,
              borderRadius: 6,
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: textColor, font: { family: 'Inter' } } }
          },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor } }
          }
        }
      });
    }
  }
};

window.Analytics = Analytics;
