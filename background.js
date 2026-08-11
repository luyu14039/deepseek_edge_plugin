/**
 * Service Worker：
 * - 每天最多检查一次 GitHub Releases，发现新版本时返回给 content script；
 * - 打开 GitHub Releases 页面（点击更新提醒时触发）。
 * 纯提醒，不自动安装。
 */
'use strict';

try {
  importScripts('version.js');
} catch (error) {
  // 版本模块缺失时更新检查静默失效
}

var REPO_API_URL = 'https://api.github.com/repos/luyu14039/deepseek_edge_plugin/releases/latest';
var RELEASES_URL = 'https://github.com/luyu14039/deepseek_edge_plugin/releases';
var CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
var STORAGE_KEY = 'ds-usage-enh-last-update-check';
var CACHE_KEY = 'ds-usage-enh-update-info';

function setStored(values, callback) {
  try {
    chrome.storage.local.set(values, callback || function () {});
  } catch (error) {
    if (callback) callback();
  }
}

function getStored(keys, callback) {
  try {
    chrome.storage.local.get(keys, callback);
  } catch (error) {
    callback({});
  }
}

function openReleases(url) {
  try {
    chrome.tabs.create({ url: url || RELEASES_URL }, function () {});
  } catch (error) {
    // 忽略打开失败
  }
}

function checkUpdate(sendResponse) {
  getStored([STORAGE_KEY, CACHE_KEY], function (stored) {
    var last = stored && stored[STORAGE_KEY];
    if (last && Date.now() - last < CHECK_INTERVAL_MS) {
      var cached = stored && stored[CACHE_KEY];
      sendResponse(cached || null);
      return;
    }

    fetch(REPO_API_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (response) {
        if (response.status === 404) {
          // 尚未发布任何 Release
          setStored(createStoredValue(null));
          sendResponse(null);
          return null;
        }
        if (!response.ok) {
          sendResponse(null);
          return null;
        }
        return response.json();
      })
      .then(function (payload) {
        if (!payload) return;
        var current = (chrome.runtime.getManifest().version || '0.0.0').toString();
        var info = null;
        if (globalThis.DsUpdate && globalThis.DsUpdate.extractUpdateInfo) {
          info = globalThis.DsUpdate.extractUpdateInfo(payload, current);
        }
        setStored(createStoredValue(info));
        sendResponse(info);
      })
      .catch(function () {
        // 网络失败或限流：不记录时间，下次页面加载时重试
        sendResponse(null);
      });
  });
}

function createStoredValue(info) {
  var data = {};
  data[STORAGE_KEY] = Date.now();
  if (info) data[CACHE_KEY] = info;
  return data;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'CHECK_UPDATE') {
    checkUpdate(sendResponse);
    return true; // 异步响应
  }
  if (message.type === 'OPEN_RELEASES') {
    openReleases(message.url);
  }
});
