/**
 * 版本比对与更新信息提取（纯逻辑，无浏览器 API）。
 * 供 background service worker 使用，也可在 Node 中直接测试。
 */
(function (global) {
  'use strict';

  var DsUpdate = {};

  function parseVersion(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    var text = String(value).trim().replace(/^v/i, '');
    var parts = text.split('.');
    var nums = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/[^0-9].*$/, '');
      if (!/^\d+$/.test(part)) return null;
      nums.push(parseInt(part, 10));
    }
    if (nums.length === 0) return null;
    while (nums.length < 3) nums.push(0);
    return nums.slice(0, 3);
  }

  /**
   * 比较两个版本号。
   * 返回 1（a 更新）/ 0（相同）/-1（a 更旧）；无法解析时返回 null。
   */
  function compareVersions(a, b) {
    var pa = parseVersion(a);
    var pb = parseVersion(b);
    if (!pa || !pb) return null;
    for (var i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
    }
    return 0;
  }

  /**
   * 从 GitHub releases/latest 的 JSON 中提取更新信息。
   * 仅当远端版本高于当前版本时返回 { version, tag, url, notes }，否则返回 null。
   */
  function extractUpdateInfo(payload, currentVersion) {
    if (!payload || typeof payload !== 'object') return null;
    var tag = payload.tag_name || payload.name || '';
    if (!tag) return null;
    var parsed = parseVersion(tag);
    if (!parsed) return null;
    if (compareVersions(tag, currentVersion) !== 1) return null;
    return {
      version: parsed.join('.'),
      tag: String(tag),
      url: typeof payload.html_url === 'string' ? payload.html_url : '',
      notes: typeof payload.body === 'string' ? payload.body : ''
    };
  }

  DsUpdate.parseVersion = parseVersion;
  DsUpdate.compareVersions = compareVersions;
  DsUpdate.extractUpdateInfo = extractUpdateInfo;
  global.DsUpdate = DsUpdate;
})(typeof globalThis !== 'undefined' ? globalThis : this);
