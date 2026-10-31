/* global document, window */
/*
 * D246/D249: the before-send hook for API-rendered public pages and share previews.
 * Loaded (defer) right before Umami's tracker; the page sets its route pattern and screen name
 * as data attributes. Same rules as `sanitizePayload` in @gobbit/shared/analytics, minus the
 * member id and events: anonymous pages send page views only.
 */
(function () {
  var script = document.currentScript;
  var pattern = script && script.dataset.pattern;
  var screenName = script && script.dataset.screen;
  var KEPT = ['website', 'hostname', 'screen', 'language'];

  function referrerOrigin(referrer) {
    if (!referrer) return '';
    try {
      var ref = new URL(referrer);
      if (ref.protocol !== 'http:' && ref.protocol !== 'https:') return '';
      return ref.origin === window.location.origin ? '' : ref.origin;
    } catch {
      return '';
    }
  }

  window.__gobbitAnalyticsBeforeSend = function (type, payload) {
    try {
      if (!payload || !pattern || !screenName || !navigator.onLine) return null;
      if (type !== 'event' || payload.name !== undefined) return null; // page views only
      var clean = {};
      for (var i = 0; i < KEPT.length; i++) {
        if (typeof payload[KEPT[i]] === 'string') clean[KEPT[i]] = payload[KEPT[i]];
      }
      clean.url = pattern;
      clean.title = screenName;
      clean.referrer = referrerOrigin(payload.referrer);
      return clean;
    } catch {
      return null; // never send what could not be cleaned
    }
  };
})();
