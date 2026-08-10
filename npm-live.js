/* ═══════════════════════════════════════════════════════════════════════════
   npm-live.js — the numbers on this site come from somewhere real.

   Two different kinds of number, two different sources:

   1. TRULY LIVE — changes without anyone deploying this site.
        · total downloads since launch   api.npmjs.org
        · published version + date       registry.npmjs.org
      Both endpoints send `access-control-allow-origin: *`, so a static page
      can read them directly. No build step, no token, no server.

   2. RELEASE-COUPLED — changes only when the CLI changes.
        · tests · commands · MCP tools · doctor checks
      Fetched from /stats.json, which scripts/build-stats.mjs generates from
      the actual CLI package. One source of truth instead of the same integer
      hand-copied into six HTML files (which is exactly how they drifted).

   Markup contract:  <span data-live="downloads">1,926</span>
   The text already in the HTML is the fallback. It must be correct on its
   own: this script only ever REPLACES a good value with a fresher one, so
   the page stays honest with JS disabled, on a fetch failure, and for
   crawlers that never run any of this.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PKG = '@nexus-framework/cli';
  var LAUNCH = '2026-02-01'; // first publish; the download range starts here
  var CACHE_KEY = 'nexus-live-v1';
  var CACHE_TTL = 30 * 60 * 1000; // 30 min — this is marketing data, not telemetry

  var $ = function (sel) { return [].slice.call(document.querySelectorAll(sel)); };
  var fmt = function (n) { return n.toLocaleString('en-US'); };

  /* ── rendering ─────────────────────────────────────────────────────────── */

  // Count up to the value, matching the hero's existing stat animation.
  // Respects prefers-reduced-motion; skips entirely for non-numeric values.
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function paint(el, value) {
    // Write the real value FIRST, always. requestAnimationFrame is paused in
    // background tabs, so an animation that starts by painting 0 and counts up
    // leaves a hard "0" on screen until the tab is focused — and leaves it
    // there permanently for anything that never runs rAF at all. Landing on
    // the truth and treating the count-up as decoration inverts that risk:
    // worst case the number simply appears without animating.
    el.textContent = typeof value === 'number' ? fmt(value) : value;

    if (typeof value !== 'number' || reduce || !el.hasAttribute('data-live-animate')) return;

    var start = null;
    requestAnimationFrame(function step(now) {
      if (start === null) start = now;
      var p = Math.min((now - start) / 1100, 1);
      el.textContent = fmt(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    });
  }

  // Snapshot the hand-written fallbacks before anything overwrites them, so a
  // failed fetch still animates to the correct static number. This script is
  // the ONLY animator for [data-live] elements — the page's own count-up
  // observer must not also target them, or two rAF loops fight over one node.
  var fallbacks = null;
  function snapshot() {
    fallbacks = new Map();
    $('[data-live]').forEach(function (el) {
      var raw = el.textContent.trim().replace(/,/g, '');
      fallbacks.set(el, /^\d+$/.test(raw) ? Number(raw) : el.textContent.trim());
    });
  }

  function apply(data) {
    $('[data-live]').forEach(function (el) {
      var v = data[el.getAttribute('data-live')];
      if (v === undefined || v === null) v = fallbacks.get(el); // static fallback
      if (v === undefined) return;
      paint(el, v);
      el.removeAttribute('aria-busy');
    });
    // Reveal anything that should only exist once real data landed.
    $('[data-live-when]').forEach(function (el) {
      if (data[el.getAttribute('data-live-when')] != null) el.removeAttribute('hidden');
    });
  }

  /* ── fetching ──────────────────────────────────────────────────────────── */

  function getJSON(url, headers) {
    return fetch(url, { headers: headers || {} }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → ' + r.status);
      return r.json();
    });
  }

  // npm's range endpoint caps at 18 months per request. Launch is recent
  // enough that one call covers it today, but chunking now means this keeps
  // working in 2028 instead of silently returning a partial total.
  function downloadRanges(from, to) {
    var out = [];
    var cursor = new Date(from + 'T00:00:00Z');
    var end = new Date(to + 'T00:00:00Z');
    while (cursor <= end) {
      var chunkEnd = new Date(cursor);
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 364);
      if (chunkEnd > end) chunkEnd = end;
      out.push(cursor.toISOString().slice(0, 10) + ':' + chunkEnd.toISOString().slice(0, 10));
      cursor = new Date(chunkEnd);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  function totalDownloads() {
    var today = new Date().toISOString().slice(0, 10);
    return Promise.all(
      downloadRanges(LAUNCH, today).map(function (range) {
        return getJSON('https://api.npmjs.org/downloads/range/' + range + '/' + PKG)
          .then(function (d) {
            return (d.downloads || []).reduce(function (a, b) { return a + b.downloads; }, 0);
          });
      })
    ).then(function (totals) {
      return totals.reduce(function (a, b) { return a + b; }, 0);
    });
  }

  function relativeDay(iso) {
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'published today';
    if (days === 1) return 'published yesterday';
    if (days < 30) return 'published ' + days + ' days ago';
    if (days < 60) return 'published last month';
    return 'published ' + Math.floor(days / 30) + ' months ago';
  }

  /* ── orchestration ─────────────────────────────────────────────────────── */

  // Each source settles independently: a rate-limited npm must not stop
  // stats.json from painting, and vice versa.
  function load() {
    var data = {};

    var stats = getJSON('/stats.json')
      .then(function (s) {
        data.tests = s.tests;
        data.commands = s.commands;
        data.tools = s.tools;
        data.checks = s.checks;
      })
      .catch(function () {});

    var registry = getJSON('https://registry.npmjs.org/' + PKG, {
      Accept: 'application/vnd.npm.install-v1+json',
    })
      .then(function (r) {
        data.version = r['dist-tags'] && r['dist-tags'].latest;
        if (data.version) data.versionTag = 'v' + data.version;
        if (r.modified) data.published = relativeDay(r.modified);
      })
      .catch(function () {});

    var downloads = totalDownloads()
      .then(function (n) { if (n > 0) data.downloads = n; })
      .catch(function () {});

    return Promise.all([stats, registry, downloads]).then(function () { return data; });
  }

  function cached() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var hit = JSON.parse(raw);
      return Date.now() - hit.at < CACHE_TTL ? hit.data : null;
    } catch (e) { return null; }
  }

  function start() {
    snapshot();
    var hit = cached();
    if (hit) { apply(hit); return; }
    load().then(function (data) {
      apply(data);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data }));
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
