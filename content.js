(function () {
  'use strict';

  var HOST_ATTR = 'data-ds-usage-enh';
  var MUTATION_DEBOUNCE_MS = 250;

  var state = {
    lastData: null,
    collapsed: false,
    cache: {},
    mutationTimer: 0,
    lastPath: location.pathname,
    lastError: ''
  };

  function isUsagePage() {
    return location.pathname === '/usage' || location.pathname.indexOf('/usage/') === 0;
  }

  function parseDomNumber(text) {
    if (!text) return null;
    var cleaned = String(text).replace(/[,，\s\u00a0]/g, '');
    var match = cleaned.match(/^(-?)(\d+)(?:\.\d+)?$/);
    if (!match) return null;
    try {
      return BigInt(match[1] + match[2]);
    } catch (error) {
      return null;
    }
  }

  function findMainCardValue() {
    var root = document.querySelector('main') || document.body;
    var values = root.querySelectorAll('[data-usage-layout-font="value"]');
    var bestValue = null;
    for (var i = 0; i < values.length; i++) {
      var value = parseDomNumber(values[i].textContent);
      if (value !== null && (bestValue === null || value > bestValue)) {
        bestValue = value;
      }
    }
    return bestValue;
  }

  function findCachedDataForDomValue(domValue) {
    var exact = null;
    var closest = null;
    var closestDiff = null;

    for (var url in state.cache) {
      if (!Object.prototype.hasOwnProperty.call(state.cache, url)) continue;
      var data = state.cache[url];
      if (data.total === domValue) {
        exact = data;
        continue;
      }
      var diff = data.total > domValue ? data.total - domValue : domValue - data.total;
      if (closestDiff === null || diff < closestDiff) {
        closestDiff = diff;
        closest = data;
      }
    }

    if (exact) return exact;
    if (closest && domValue !== 0n && closestDiff * 20n <= domValue) return closest;
    return null;
  }

  function formatInt(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function toBig(value) {
    try {
      return BigInt(String(value == null ? 0 : value).trim() || '0');
    } catch (error) {
      return 0n;
    }
  }

  function unwrapBizData(json) {
    if (json && json.code != null && ![0, 200, '0', '200', 'success', 'SUCCESS', true].includes(json.code)) {
      throw new Error('接口业务错误 code=' + json.code);
    }
    if (
      json &&
      json.data &&
      json.data.biz_code != null &&
      ![0, 200, '0', '200', 'success', 'SUCCESS', true].includes(json.data.biz_code)
    ) {
      throw new Error('接口业务错误 biz_code=' + json.data.biz_code);
    }
    if (json && json.data && json.data.biz_data) return json.data.biz_data;
    if (json && json.data) return json.data;
    return json;
  }

  function extractUsageData(json) {
    var bizData = unwrapBizData(json);
    var hit = 0n;
    var miss = 0n;
    var response = 0n;
    var requests = 0n;

    var series = bizData && Array.isArray(bizData.series) ? bizData.series : [];
    for (var i = 0; i < series.length; i++) {
      var buckets = series[i] && Array.isArray(series[i].buckets) ? series[i].buckets : [];
      for (var j = 0; j < buckets.length; j++) {
        var usage = buckets[j] && buckets[j].usage;
        if (!usage) continue;
        hit += toBig(usage.PROMPT_CACHE_HIT_TOKEN);
        miss += toBig(usage.PROMPT_CACHE_MISS_TOKEN);
        response += toBig(usage.RESPONSE_TOKEN);
        requests += toBig(usage.REQUEST);
      }
    }
    if (series.length > 0) {
      return {
        hit: hit,
        miss: miss,
        response: response,
        requests: requests,
        total: hit + miss + response
      };
    }

    var totals = bizData && Array.isArray(bizData.total) ? bizData.total : [];
    for (var m = 0; m < totals.length; m++) {
      var usageList = totals[m] && totals[m].usage;
      if (!Array.isArray(usageList)) continue;
      for (var k = 0; k < usageList.length; k++) {
        var item = usageList[k];
        var type = String((item && item.type) || '');
        var amount = toBig(item && item.amount);
        if (type === 'PROMPT_CACHE_HIT_TOKEN') hit += amount;
        else if (type === 'PROMPT_CACHE_MISS_TOKEN') miss += amount;
        else if (type === 'RESPONSE_TOKEN') response += amount;
        else if (type === 'REQUEST') requests += amount;
      }
    }
    if (totals.length > 0) {
      return {
        hit: hit,
        miss: miss,
        response: response,
        requests: requests,
        total: hit + miss + response
      };
    }
    return null;
  }

  function cardTemplate() {
    return [
      '<style>',
      ':host { all: initial; }',
      '.ds-wrap {',
      '  position: fixed;',
      '  right: 20px;',
      '  bottom: 20px;',
      '  z-index: 2147483646;',
      '  width: 320px;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;',
      '  color-scheme: light dark;',
      '  --ds-bg: rgba(255,255,255,0.86);',
      '  --ds-border: rgba(15,23,42,0.08);',
      '  --ds-text: #0f172a;',
      '  --ds-muted: #64748b;',
      '  --ds-accent: #2563eb;',
      '  --ds-accent2: #22d3ee;',
      '  --ds-shadow: 0 12px 32px rgba(15,23,42,0.16);',
      '}',
      '@media (prefers-color-scheme: dark) {',
      '  .ds-wrap {',
      '    --ds-bg: rgba(15,23,42,0.90);',
      '    --ds-border: rgba(255,255,255,0.10);',
      '    --ds-text: #e2e8f0;',
      '    --ds-muted: #94a3b8;',
      '    --ds-shadow: 0 12px 32px rgba(0,0,0,0.45);',
      '  }',
      '}',
      '.ds-card {',
      '  background: var(--ds-bg);',
      '  border: 1px solid var(--ds-border);',
      '  border-radius: 16px;',
      '  box-shadow: var(--ds-shadow);',
      '  backdrop-filter: blur(14px);',
      '  -webkit-backdrop-filter: blur(14px);',
      '  overflow: hidden;',
      '  transition: box-shadow .2s ease, border-radius .2s ease;',
      '}',
      '.ds-card:hover { box-shadow: 0 16px 40px rgba(15,23,42,0.20); }',
      '@media (prefers-color-scheme: dark) {',
      '  .ds-card:hover { box-shadow: 0 16px 40px rgba(0,0,0,0.55); }',
      '}',
      '.ds-head {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 12px 14px;',
      '  border-bottom: 1px solid var(--ds-border);',
      '}',
      '.ds-dot {',
      '  width: 8px;',
      '  height: 8px;',
      '  border-radius: 50%;',
      '  background: linear-gradient(135deg, var(--ds-accent), var(--ds-accent2));',
      '  box-shadow: 0 0 8px var(--ds-accent);',
      '  flex: none;',
      '}',
      '.ds-title {',
      '  flex: 1;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: var(--ds-text);',
      '}',
      '.ds-toggle {',
      '  border: 0;',
      '  background: transparent;',
      '  color: var(--ds-muted);',
      '  font-size: 16px;',
      '  line-height: 1;',
      '  cursor: pointer;',
      '  padding: 2px 7px;',
      '  border-radius: 6px;',
      '  transition: background .15s ease, color .15s ease;',
      '}',
      '.ds-toggle:hover { background: var(--ds-border); color: var(--ds-text); }',
      '.ds-body { padding: 14px; }',
      '.ds-label {',
      '  font-size: 12px;',
      '  color: var(--ds-muted);',
      '  margin-bottom: 5px;',
      '}',
      '.ds-zh {',
      '  font-size: 17px;',
      '  font-weight: 600;',
      '  color: var(--ds-text);',
      '  line-height: 1.5;',
      '  letter-spacing: 0.5px;',
      '  word-break: break-all;',
      '}',
      '.ds-ar {',
      '  font-size: 12px;',
      '  color: var(--ds-muted);',
      '  margin-top: 4px;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.ds-divider { height: 1px; background: var(--ds-border); margin: 13px 0; }',
      '.ds-rate-row { display: flex; align-items: baseline; justify-content: space-between; }',
      '.ds-rate {',
      '  font-size: 20px;',
      '  font-weight: 700;',
      '  color: var(--ds-text);',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.ds-bar {',
      '  height: 6px;',
      '  border-radius: 3px;',
      '  background: var(--ds-border);',
      '  margin-top: 10px;',
      '  overflow: hidden;',
      '}',
      '.ds-bar-fill {',
      '  height: 100%;',
      '  width: 0%;',
      '  border-radius: 3px;',
      '  background: linear-gradient(90deg, var(--ds-accent), var(--ds-accent2));',
      '  transition: width .45s ease;',
      '}',
      '.ds-meta {',
      '  font-size: 12px;',
      '  color: var(--ds-muted);',
      '  margin-top: 8px;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.ds-foot {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin-top: 12px;',
      '  font-size: 11px;',
      '  color: var(--ds-muted);',
      '}',
      '.ds-status {',
      '  width: 6px;',
      '  height: 6px;',
      '  border-radius: 50%;',
      '  background: #22c55e;',
      '  box-shadow: 0 0 6px #22c55e;',
      '  flex: none;',
      '}',
      '.ds-wrap.collapsed .ds-body { display: none; }',
      '.ds-wrap.collapsed .ds-card { border-radius: 999px; }',
      '.ds-wrap.collapsed .ds-head { border-bottom: 0; }',
      '</style>',
      '<div class="ds-wrap' + (state.collapsed ? ' collapsed' : '') + '">',
      '  <div class="ds-card">',
      '    <div class="ds-head">',
      '      <span class="ds-dot"></span>',
      '      <span class="ds-title">DeepSeek 用量</span>',
      '      <button class="ds-toggle" type="button" title="收起/展开">' + (state.collapsed ? '+' : '−') + '</button>',
      '    </div>',
      '    <div class="ds-body">',
      '      <div class="ds-label">总 Token（中文）</div>',
      '      <div class="ds-zh">等待数据…</div>',
      '      <div class="ds-ar"></div>',
      '      <div class="ds-divider"></div>',
      '      <div class="ds-rate-row">',
      '        <span class="ds-label" style="margin:0">缓存命中率</span>',
      '        <span class="ds-rate">—</span>',
      '      </div>',
      '      <div class="ds-bar"><div class="ds-bar-fill"></div></div>',
      '      <div class="ds-meta"></div>',
      '      <div class="ds-foot"><span class="ds-status"></span><span>跟随页面当前周期 · 自动更新</span></div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function getCardRefs(host) {
    var shadow = host.shadowRoot;
    return {
      wrap: shadow.querySelector('.ds-wrap'),
      zh: shadow.querySelector('.ds-zh'),
      ar: shadow.querySelector('.ds-ar'),
      rate: shadow.querySelector('.ds-rate'),
      barFill: shadow.querySelector('.ds-bar-fill'),
      meta: shadow.querySelector('.ds-meta'),
      toggle: shadow.querySelector('.ds-toggle')
    };
  }

  function createCard() {
    var host = document.querySelector('[' + HOST_ATTR + ']');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute(HOST_ATTR, '');
      host.attachShadow({ mode: 'open' }).innerHTML = cardTemplate();
      document.body.appendChild(host);
    }

    if (!host.__dsToggleBound) {
      host.__dsToggleBound = true;
      var refs = getCardRefs(host);
      refs.toggle.addEventListener('click', function () {
        state.collapsed = !state.collapsed;
        refs.wrap.classList.toggle('collapsed', state.collapsed);
        refs.toggle.textContent = state.collapsed ? '+' : '−';
      });
    }
    return getCardRefs(host);
  }

  function renderWaiting(refs) {
    refs.zh.textContent = '等待数据…';
    refs.ar.textContent = '';
    refs.rate.textContent = '—';
    refs.barFill.style.width = '0%';
    refs.meta.textContent = '正在等待页面用量接口…';
  }

  function renderDomOnly(refs, value) {
    refs.zh.textContent = toChineseNumber(value);
    refs.ar.textContent = '共 ' + formatInt(value) + ' Token';
    refs.rate.textContent = '—';
    refs.barFill.style.width = '0%';
    refs.meta.textContent = '当前周期数据尚未捕获，请再次切换周期';
  }

  function renderData(refs, data) {
    refs.zh.textContent = toChineseNumber(data.total);
    refs.ar.textContent = '共 ' + formatInt(data.total) + ' Token';

    var input = data.hit + data.miss;
    if (input === 0n) {
      refs.rate.textContent = '—';
      refs.barFill.style.width = '0%';
      refs.meta.textContent = '当前周期暂无输入 Token';
      return;
    }

    var basis = (data.hit * 10000n) / input;
    var percent = Number(basis) / 100;
    refs.rate.textContent = percent.toFixed(2) + '%';
    refs.barFill.style.width = Math.min(100, percent) + '%';
    refs.meta.textContent =
      '命中 ' + formatInt(data.hit) + ' · 输入 ' + formatInt(input);
  }

  function logError(error) {
    var message = String((error && error.message) || error);
    if (message === state.lastError) return;
    state.lastError = message;
    console.error('[DeepSeek 用量增强]', error);
  }

  function handleApiMessage(url, body) {
    var json;
    try {
      json = JSON.parse(body);
    } catch (error) {
      return;
    }

    var data;
    try {
      data = extractUsageData(json);
    } catch (error) {
      logError(error);
      return;
    }
    if (!data) return;

    state.cache[url] = data;
    state.lastData = data;
    console.debug(
      '[DeepSeek 用量增强] 捕获用量接口:',
      url,
      '| 总Token:',
      data.total.toString(),
      '| 命中率:',
      data.hit + data.miss > 0n
        ? (Number((data.hit * 10000n) / (data.hit + data.miss)) / 100).toFixed(2) + '%'
        : '—'
    );

    if (!isUsagePage()) return;
    var refs = createCard();
    renderData(refs, data);
  }

  function sync() {
    if (!isUsagePage()) {
      var stale = document.querySelector('[' + HOST_ATTR + ']');
      if (stale) stale.remove();
      state.lastData = null;
      return;
    }

    var refs = createCard();
    var domValue = findMainCardValue();
    if (!state.lastData) {
      renderWaiting(refs);
      return;
    }

    if (domValue !== null && state.lastData.total !== domValue) {
      var cached = findCachedDataForDomValue(domValue);
      if (cached) {
        state.lastData = cached;
        console.debug(
          '[DeepSeek 用量增强] 命中缓存周期:',
          cached.total.toString(),
          '| 命中率:',
          cached.hit + cached.miss > 0n
            ? (Number((cached.hit * 10000n) / (cached.hit + cached.miss)) / 100).toFixed(2) + '%'
            : '—'
        );
      } else {
        renderDomOnly(refs, domValue);
        return;
      }
    }

    renderData(refs, state.lastData);
  }

  function scheduleSync() {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(sync, MUTATION_DEBOUNCE_MS);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var message = event.data;
    if (!message || message.source !== 'ds-usage-enh-hook' || message.type !== 'api-response') return;
    handleApiMessage(message.url, message.body);
  });

  var observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', scheduleSync);

  setInterval(function () {
    if (location.pathname !== state.lastPath) {
      state.lastPath = location.pathname;
      scheduleSync();
    }
  }, 1000);

  scheduleSync();
})();
