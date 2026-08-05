(function () {
  'use strict';

  var HOST_ATTR = 'data-ds-usage-enh';
  var API_AMOUNT = '/api/v0/usage/amount';
  var FETCH_TIMEOUT_MS = 15000;
  var MUTATION_DEBOUNCE_MS = 250;
  var STABLE_LABELS = ['每月用量', '用量信息', 'Token 用量', 'Tokens 用量', 'Token Usage'];

  var state = {
    currentPeriod: '',
    lastData: null,
    controller: null,
    mutationTimer: 0,
    lastPath: location.pathname,
    lastError: ''
  };

  function isUsagePage() {
    return location.pathname === '/usage' || location.pathname.indexOf('/usage/') === 0;
  }

  function getSelectedPeriod() {
    var selects = document.querySelectorAll('select');
    for (var i = 0; i < selects.length; i++) {
      var value =
        selects[i].value ||
        (selects[i].selectedOptions &&
          selects[i].selectedOptions[0] &&
          selects[i].selectedOptions[0].value) ||
        '';
      if (/^\d{4}-\d{1,2}$/.test(value)) return value;
    }
    var now = new Date();
    return now.getUTCFullYear() + '-' + (now.getUTCMonth() + 1);
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

  function isLeafNumber(element) {
    if (element.children.length > 0) return false;
    var text = (element.textContent || '').trim();
    if (!/^[\d,，.\s-]+$/.test(text)) return false;
    return parseDomNumber(text) !== null;
  }

  function largestNumberLeaf(root) {
    var best = null;
    var bestValue = null;
    var nodes = root.querySelectorAll('div, span, p, h1, h2, h3, h4, strong, b, [role="heading"]');
    for (var i = 0; i < nodes.length; i++) {
      var element = nodes[i];
      if (!isLeafNumber(element)) continue;
      var value = parseDomNumber(element.textContent);
      if (bestValue === null || value > bestValue) {
        best = element;
        bestValue = value;
      }
    }
    return best;
  }

  function findCardByLabel() {
    var root = document.querySelector('main') || document.body;
    var labels = root.querySelectorAll('h1, h2, h3, h4, div, span, p, [role="heading"]');
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      var text = (label.textContent || '').trim();
      var matched = false;
      for (var j = 0; j < STABLE_LABELS.length; j++) {
        if (text === STABLE_LABELS[j]) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      var node = label.parentElement;
      for (var depth = 0; depth < 6 && node; depth++) {
        var numberElement = largestNumberLeaf(node);
        if (numberElement) return { element: numberElement, container: node };
        node = node.parentElement;
      }
    }
    return null;
  }

  function findContainerFor(element) {
    var node = element.parentElement;
    for (var depth = 0; depth < 5 && node; depth++) {
      var text = (node.textContent || '').trim();
      if (/Token|用量|Usage|消耗/i.test(text) && text.length < 400) return node;
      node = node.parentElement;
    }
    return element.parentElement;
  }

  function findCardGeneric() {
    var root = document.querySelector('main') || document.body;
    var nodes = root.querySelectorAll('div, span, p, h1, h2, h3, h4, strong, b, [role="heading"]');
    var best = null;
    var bestScore = -1;
    var bestValue = null;

    for (var i = 0; i < nodes.length; i++) {
      var element = nodes[i];
      if (!isLeafNumber(element)) continue;

      var value = parseDomNumber(element.textContent);
      if (value === null) continue;
      var score = 0;
      var labelFound = false;
      var container = element.parentElement;

      for (var depth = 0; depth < 5 && container; depth++) {
        var allText = (container.textContent || '').trim();
        var className = typeof container.className === 'string' ? container.className : '';

        if (
          /tooltip|echarts|chart|table/i.test(className) ||
          container.tagName === 'TABLE' ||
          container.tagName === 'TR' ||
          container.tagName === 'TD'
        ) {
          score -= 2000;
        }

        if (/Token|用量|Usage|消耗/i.test(allText)) {
          score += Math.max(0, 1000 - depth * 150);
          labelFound = true;
        }
        if (allText.indexOf('每月用量') !== -1 || allText.indexOf('用量信息') !== -1) {
          score += 500;
        }
        if (allText.length > 600) score -= 200;
        if (/card|Card|stat|summary/i.test(className)) score += 150;

        var leafCount = numericLeafCount(container);
        if (leafCount > 4) score -= 300 + leafCount * 20;

        container = container.parentElement;
      }

      if (!labelFound) continue;
      score += String(value).length;
      if (score > bestScore || (score === bestScore && bestValue !== null && value > bestValue)) {
        bestScore = score;
        best = element;
        bestValue = value;
      }
    }

    if (!best) return null;
    return { element: best, container: findContainerFor(best) };
  }

  function numericLeafCount(root) {
    var count = 0;
    var nodes = root.querySelectorAll('div, span, p, h1, h2, h3, h4, strong, b, [role="heading"]');
    for (var i = 0; i < nodes.length; i++) {
      if (isLeafNumber(nodes[i])) count++;
    }
    return count;
  }

  function findCard() {
    var byLabel = findCardByLabel();
    if (byLabel) return byLabel;
    return findCardGeneric();
  }

  function ensureHost(card) {
    var host = document.querySelector('[' + HOST_ATTR + ']');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute(HOST_ATTR, '');
      host.style.cssText = [
        'box-sizing:border-box',
        'margin:8px 0 0',
        'padding:0',
        'font-size:13px',
        'line-height:1.6',
        'font-family:inherit',
        'color:rgb(var(--ds-rgb-label-2, 87 97 135))',
        'text-align:left',
        'user-select:none'
      ].join(';');
      host.innerHTML =
        '<div class="ds-usage-enh-zh"></div>' +
        '<div class="ds-usage-enh-rate"></div>';

      var container = card.container || card.element.parentElement;
      container.parentNode.insertBefore(host, container.nextSibling);
    }
    return host;
  }

  function getHostLines() {
    var host = document.querySelector('[' + HOST_ATTR + ']');
    if (!host) return null;
    return {
      zh: host.querySelector('.ds-usage-enh-zh'),
      rate: host.querySelector('.ds-usage-enh-rate')
    };
  }

  function formatInt(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function renderFallback(period) {
    var lines = getHostLines();
    if (!lines) return;
    var card = findCard();
    var numberValue = card ? parseDomNumber(card.element.textContent) : null;
    lines.zh.textContent = numberValue !== null ? toChineseNumber(numberValue) : '中文数字：—';
    lines.rate.textContent = '缓存命中率：—';
    lines.rate.title = period ? '接口数据暂不可用' : '';
  }

  function renderData(data) {
    var lines = getHostLines();
    if (!lines) return;
    lines.zh.textContent = toChineseNumber(data.total);
    var input = data.hit + data.miss;
    if (input === 0n) {
      lines.rate.textContent = '缓存命中率：—';
      lines.rate.title = '当前周期暂无输入 Token';
    } else {
      var basis = (data.hit * 10000n) / input;
      var percent = Number(basis) / 100;
      lines.rate.textContent =
        '缓存命中率：' +
        percent.toFixed(2) +
        '%（命中 ' +
        formatInt(data.hit) +
        ' / 输入 ' +
        formatInt(input) +
        '）';
      lines.rate.title = '';
    }
  }

  function addTokenCandidate(value, key, out) {
    var token = String(value || '')
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^"|"$/g, '');
    if (token.length < 16 || token.length > 4096) return;
    if (/\s/.test(token)) return;
    if (!/^[A-Za-z0-9._~+/=-]+$/.test(token)) return;

    var score = 0;
    if (/userToken/i.test(key)) score += 100;
    else if (/token/i.test(key)) score += 40;
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) score += 20;
    out.push({ token: token, score: score });
  }

  function collectTokenValues(value, key, out) {
    if (value == null) return;
    if (typeof value === 'string') {
      addTokenCandidate(value, key, out);
      return;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collectTokenValues(value[i], key, out);
      return;
    }
    if (typeof value === 'object') {
      for (var prop in value) {
        if (Object.prototype.hasOwnProperty.call(value, prop)) {
          collectTokenValues(value[prop], key, out);
        }
      }
    }
  }

  function collectTokens(storage, out) {
    if (!storage) return;
    for (var i = 0; i < storage.length; i++) {
      var key = storage.key(i);
      if (!key) continue;
      if (/hcaptcha|captcha|turnstile|apdid|csrf|xsrf|apple|google/i.test(key)) continue;
      var lowered = key.toLowerCase();
      if (lowered.indexOf('token') === -1 && lowered !== 'usertoken') continue;

      var raw = '';
      try {
        raw = storage.getItem(key) || '';
      } catch (error) {
        continue;
      }

      var trimmed = raw.trim();
      if (/^[\[{]/.test(trimmed)) {
        try {
          collectTokenValues(JSON.parse(trimmed), key, out);
          continue;
        } catch (error) {
          // 非 JSON，按普通字符串处理
        }
      }
      addTokenCandidate(raw, key, out);
    }
  }

  function getAuthToken() {
    var candidates = [];
    collectTokens(window.localStorage, candidates);
    collectTokens(window.sessionStorage, candidates);
    candidates.sort(function (a, b) {
      return b.score - a.score;
    });
    return candidates.length ? candidates[0].token : '';
  }

  function parseAmount(value) {
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

  async function fetchUsage(period) {
    var parts = period.split('-');
    var headers = { Accept: 'application/json' };
    var token = getAuthToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var commit = document.querySelector('meta[name="commit-id"]');
    if (commit && commit.content) headers['X-App-Version'] = commit.content;

    var controller = new AbortController();
    state.controller = controller;
    var timer = setTimeout(function () {
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    try {
      var response = await fetch(
        API_AMOUNT +
          '?year=' +
          encodeURIComponent(parts[0]) +
          '&month=' +
          encodeURIComponent(parts[1]),
        {
          credentials: 'include',
          headers: headers,
          signal: controller.signal
        }
      );
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var json = await response.json();
      var bizData = unwrapBizData(json);
      var totals = bizData && Array.isArray(bizData.total) ? bizData.total : [];

      var hit = 0n;
      var miss = 0n;
      var responseTokens = 0n;
      for (var i = 0; i < totals.length; i++) {
        var usage = totals[i] && totals[i].usage;
        if (!Array.isArray(usage)) continue;
        for (var j = 0; j < usage.length; j++) {
          var item = usage[j];
          var type = String((item && item.type) || '');
          var amount = parseAmount(item && item.amount);
          if (type === 'PROMPT_CACHE_HIT_TOKEN') hit += amount;
          else if (type === 'PROMPT_CACHE_MISS_TOKEN') miss += amount;
          else if (type === 'RESPONSE_TOKEN') responseTokens += amount;
        }
      }

      return {
        period: period,
        hit: hit,
        miss: miss,
        response: responseTokens,
        total: hit + miss + responseTokens
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function logError(error) {
    var message = String((error && error.message) || error);
    if (message === state.lastError) return;
    state.lastError = message;
    console.error('[DeepSeek 用量增强]', error);
  }

  async function refresh(period) {
    if (state.controller) state.controller.abort();
    renderFallback(period);

    try {
      var data = await fetchUsage(period);
      if (state.currentPeriod !== period) return;
      state.lastData = data;
      renderData(data);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (state.currentPeriod !== period) return;
      state.lastData = null;
      logError(error);
      renderFallback(period);
    }
  }

  function sync() {
    if (!isUsagePage()) {
      var stale = document.querySelector('[' + HOST_ATTR + ']');
      if (stale) stale.remove();
      state.currentPeriod = '';
      state.lastData = null;
      return;
    }

    var card = findCard();
    if (!card) return;
    ensureHost(card);

    var period = getSelectedPeriod();
    console.debug(
      '[DeepSeek 用量增强] 定位卡片:',
      card.element.textContent,
      '| class:',
      card.element.className || '',
      '| 周期:',
      period
    );
    if (period !== state.currentPeriod) {
      state.currentPeriod = period;
      state.lastData = null;
      refresh(period);
    } else if (state.lastData) {
      renderData(state.lastData);
    } else {
      renderFallback(period);
    }
  }

  function scheduleSync() {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(sync, MUTATION_DEBOUNCE_MS);
  }

  var observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (target instanceof HTMLSelectElement && /^\d{4}-\d{1,2}$/.test(target.value || '')) {
      state.currentPeriod = '';
      state.lastData = null;
      scheduleSync();
    }
  });

  window.addEventListener('popstate', scheduleSync);

  setInterval(function () {
    if (location.pathname !== state.lastPath) {
      state.lastPath = location.pathname;
      scheduleSync();
    }
  }, 1000);

  scheduleSync();
})();
