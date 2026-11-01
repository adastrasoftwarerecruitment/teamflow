/* ============================================================
   public/js/push.js — FCM Push Notification client for Capacitor
   Loaded only in native context, falls back gracefully on web.
   ============================================================ */

const Push = {
  _initialized: false,

  async init() {
    if (this._initialized) return;
    const { isNative } = window.AppConfig || {};

    if (!isNative || !window.Capacitor) {
      console.log('[Push] Not in native context, skipping push init');
      return;
    }

    try {
      const { PushNotifications } = window.Capacitor.Plugins;
      if (!PushNotifications) {
        console.warn('[Push] PushNotifications plugin not available');
        return;
      }

      // Request permission
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.warn('[Push] Push permission denied');
        return;
      }

      // Register for push notifications
      await PushNotifications.register();

      // Handle FCM token
      PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] FCM token received');
        await this.registerToken(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[Push] Registration error:', err);
      });

      // Foreground push message
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        this.showInAppToast(notification);
      });

      // Tap on push notification — deep link
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data;
        if (data && data.taskId) {
          // Navigate to the task
          if (window.App && typeof App.openTaskById === 'function') {
            App.openTaskById(data.taskId, data.boardId);
          }
        }
      });

      this._initialized = true;
      console.log('[Push] Push notifications initialized');
    } catch (err) {
      console.error('[Push] init error:', err);
    }
  },

  async registerToken(token) {
    try {
      const platform = (window.Capacitor?.getPlatform?.() || 'android');
      await Api.notifications.registerDevice({ token, platform });
      console.log('[Push] Device token registered with server');
    } catch (err) {
      console.error('[Push] Failed to register token with server:', err);
    }
  },

  showInAppToast(notification) {
    const title = notification.title || 'TeamFlow';
    const body = notification.body || '';
    UI.showToast(`${title}: ${body}`, 'info', 4000);
    // Refresh notification badge
    if (window.NotificationsPage && typeof NotificationsPage.refreshBadge === 'function') {
      NotificationsPage.refreshBadge();
    }
  },
};

// Auto-init when DOM is ready, after App is initialised
document.addEventListener('DOMContentLoaded', () => {
  // Delay to ensure App.init() has finished
  setTimeout(() => Push.init(), 1500);
});
