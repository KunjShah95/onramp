/**
 * font-loader.js — Activates deferred Google Font stylesheets.
 *
 * Fonts are loaded with media="print" so they never block first paint.
 * This script swaps them to media="all" once the DOM is ready, achieving
 * the same effect as the former inline `onload="this.media='all'"` handlers
 * without violating a nonce-based Content-Security-Policy.
 *
 * Loaded as a regular <script src="/font-loader.js"> with the CSP nonce
 * so the browser allows it.
 */
(function () {
  'use strict';

  function activateFonts() {
    var links = document.querySelectorAll('link[media="print"]');
    for (var i = 0; i < links.length; i++) {
      links[i].media = 'all';
    }
  }

  // Run as soon as DOMContentLoaded fires; falls back to immediate execution
  // if the event already happened (e.g. script loaded after DOM is ready).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activateFonts);
  } else {
    activateFonts();
  }
})();
