import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const versionCode = readFileSync(new URL('../version.js', import.meta.url), 'utf8');
const backgroundCode = readFileSync(new URL('../background.js', import.meta.url), 'utf8');

const STORAGE_KEY = 'ds-usage-enh-last-update-check';
const CACHE_KEY = 'ds-usage-enh-update-info';

function loadBackground({ fetchImpl, manifestVersion = '0.4.0', stored = {} }) {
  const storage = { ...stored };
  const calls = { fetch: 0, tabs: [], sets: [] };
  const chrome = {
    runtime: {
      onMessage: { listener: null, addListener(fn) { this.listener = fn; } },
      getManifest() { return { version: manifestVersion }; },
      lastError: null
    },
    storage: {
      local: {
        get(keys, callback) {
          const out = {};
          for (const key of keys) if (key in storage) out[key] = storage[key];
          callback(out);
        },
        set(obj, callback) {
          Object.assign(storage, obj);
          calls.sets.push({ ...obj });
          if (callback) callback();
        }
      }
    },
    tabs: {
      create(options, callback) {
        calls.tabs.push(options);
        if (callback) callback();
      }
    }
  };

  new Function('globalThis', versionCode)(globalThis);
  new Function('importScripts', 'chrome', 'fetch', backgroundCode)(() => {}, chrome, (input, init) => {
    calls.fetch += 1;
    return fetchImpl(input, init);
  });
  return { chrome, storage, calls };
}

function jsonResponse(payload, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  );
}

function triggerMessage(chrome, message) {
  return new Promise((resolve) => {
    chrome.runtime.onMessage.listener(message, {}, resolve);
  });
}

test('发现新版本时返回更新信息并写入缓存', async () => {
  const env = loadBackground({
    fetchImpl: () =>
      jsonResponse({
        tag_name: 'v0.4.1',
        html_url: 'https://github.com/luyu14039/deepseek_edge_plugin/releases/tag/v0.4.1',
        body: '修复'
      })
  });
  const info = await triggerMessage(env.chrome, { type: 'CHECK_UPDATE' });
  assert.equal(info.version, '0.4.1');
  assert.equal(info.url, 'https://github.com/luyu14039/deepseek_edge_plugin/releases/tag/v0.4.1');
  assert.equal(env.calls.fetch, 1);
  assert.equal(env.storage[CACHE_KEY].version, '0.4.1');
  assert.ok(env.storage[STORAGE_KEY]);
});

test('节流窗口内复用缓存，不重复请求', async () => {
  const env = loadBackground({
    fetchImpl: () => {
      throw new Error('不应发起网络请求');
    },
    stored: {
      [STORAGE_KEY]: Date.now(),
      [CACHE_KEY]: { version: '0.4.1', url: 'https://github.com/x/releases', tag: 'v0.4.1', notes: '' }
    }
  });
  const info = await triggerMessage(env.chrome, { type: 'CHECK_UPDATE' });
  assert.equal(info.version, '0.4.1');
  assert.equal(env.calls.fetch, 0);
});

test('远端版本与当前相同时不提示更新', async () => {
  const env = loadBackground({
    fetchImpl: () => jsonResponse({ tag_name: 'v0.4.0', html_url: 'https://github.com/x/releases' })
  });
  const info = await triggerMessage(env.chrome, { type: 'CHECK_UPDATE' });
  assert.equal(info, null);
  assert.equal(env.calls.fetch, 1);
  assert.equal(env.storage[CACHE_KEY], undefined);
});

test('仓库没有 Release（404）时返回 null 并记录检查时间', async () => {
  const env = loadBackground({
    fetchImpl: () => jsonResponse({ message: 'Not Found' }, 404)
  });
  const info = await triggerMessage(env.chrome, { type: 'CHECK_UPDATE' });
  assert.equal(info, null);
  assert.ok(env.storage[STORAGE_KEY]);
});

test('OPEN_RELEASES 打开标签页', async () => {
  const env = loadBackground({ fetchImpl: () => jsonResponse({ tag_name: 'v0.4.0' }) });
  env.chrome.runtime.onMessage.listener({
    type: 'OPEN_RELEASES',
    url: 'https://github.com/luyu14039/deepseek_edge_plugin/releases'
  }, {}, () => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(env.calls.tabs.length, 1);
  assert.equal(env.calls.tabs[0].url, 'https://github.com/luyu14039/deepseek_edge_plugin/releases');
});
