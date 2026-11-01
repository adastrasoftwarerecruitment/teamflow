/* ============================================================
   public/js/config.js — API_BASE and Capacitor detection
   ============================================================ */

(function() {
  'use strict';

  // Detect if we are running inside a Capacitor native container
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  // In native context, calls must go to the deployed API.
  // In web context, use relative URLs (same origin).
  const API_BASE = isNative
    ? (window.__TEAMFLOW_API || 'https://teamflow-api-rewy.onrender.com')
    : '';

  window.AppConfig = {
    API_BASE,
    isNative,
    version: '2.0.0',
  };
})();
