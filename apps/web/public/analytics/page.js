/* global document, window */
/*
 * D264 (035, opt-in since D281): the consent-aware analytics loader for API-rendered pages
 * (landing, public pages, share previews). The page renders only this script plus a closed
 * consent dialog; this file:
 *  1. reads the visitor's choice from localStorage (never sent anywhere);
 *  2. defines the before-send hook: nothing unless allowed, else the 033 rewrite to the route
 *     pattern and screen name (public pages, D257) or the payload as is (landing, 031);
 *  3. injects Umami's tracker only once allowed;
 *  4. opens the dialog as a modal while unanswered (it can't be dismissed without an answer),
 *     reveals the "Analytics" button, and applies a choice at once (no reload).
 * Mirrors `analyticsAllowed(null, device)` and `parseDeviceConsent` in @gobbit/shared/analytics.
 */
(function () {
  var KEY = 'gobbit.analytics.consent';
  var HOOK = '__gobbitAnalyticsBeforeSend';
  var STATS = '/stats';
  var KEPT = ['website', 'hostname', 'screen', 'language'];

  var self = document.currentScript;
  var data = (self && self.dataset) || {};
  var pattern = data.pattern;
  var screenName = data.screen;
  var injected = false;

  function readChoice() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (
        raw &&
        (raw.value === 'allowed' || raw.value === 'declined') &&
        typeof raw.at === 'string'
      ) {
        return raw;
      }
    } catch {
      /* unreadable storage = not answered */
    }
    return null;
  }

  var choice = readChoice();
  var allowed = function () {
    return Boolean(choice && choice.value === 'allowed');
  };

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

  window[HOOK] = function (type, payload) {
    try {
      if (!allowed() || !payload) return null;
      if (!pattern) return payload; // landing (031): sent as is
      if (!screenName || !navigator.onLine) return null;
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

  function inject() {
    if (injected || !allowed() || !data.websiteId) return;
    injected = true;
    var s = document.createElement('script');
    s.defer = true;
    s.src = STATS + '/script.js';
    s.setAttribute('data-website-id', data.websiteId);
    s.setAttribute('data-host-url', STATS);
    if (data.domains) s.setAttribute('data-domains', data.domains);
    s.setAttribute('data-before-send', HOOK);
    if (pattern) {
      s.setAttribute('data-exclude-search', 'true');
      s.setAttribute('data-exclude-hash', 'true');
    }
    document.head.appendChild(s);
  }

  var banner = document.querySelector('[data-consent-banner]');
  var current = banner && banner.querySelector('[data-consent-current]');

  function showCurrent() {
    if (!current) return;
    if (!choice) {
      current.hidden = true;
      return;
    }
    var template = current.getAttribute(
      choice.value === 'allowed' ? 'data-allowed' : 'data-declined',
    );
    var date = new Date(choice.at);
    var label = isNaN(date.getTime()) ? '' : date.toLocaleDateString();
    current.textContent = (template || '').replace('{date}', label);
    current.hidden = false;
  }

  function openBanner() {
    if (!banner || banner.open) return;
    if (typeof banner.showModal === 'function') banner.showModal();
    else banner.setAttribute('open', '');
  }

  function closeBanner() {
    if (!banner || !banner.open) return;
    if (typeof banner.close === 'function') banner.close();
    else banner.removeAttribute('open');
  }

  function choose(value) {
    choice = { value: value, at: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(choice));
    } catch {
      /* kept for this page only */
    }
    closeBanner();
    if (value === 'allowed') inject();
  }

  if (banner) {
    var buttons = banner.querySelectorAll('[data-consent-choice]');
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener('click', function (event) {
        choose(event.currentTarget.getAttribute('data-consent-choice'));
      });
    }
    // D281: Escape never skips the question; a dialog closed without an answer opens again.
    banner.addEventListener('cancel', function (event) {
      if (!choice) event.preventDefault();
    });
    banner.addEventListener('close', function () {
      if (!choice) openBanner();
    });
    if (!choice) openBanner();
  }

  var openers = document.querySelectorAll('[data-consent-open]');
  for (var o = 0; o < openers.length; o++) {
    openers[o].hidden = false;
    openers[o].addEventListener('click', function () {
      showCurrent();
      openBanner();
    });
  }

  inject();
})();
