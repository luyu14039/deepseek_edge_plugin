(function () {
  'use strict';

  var HOST_ATTR = 'data-ds-usage-enh';
  var MUTATION_DEBOUNCE_MS = 250;
  var STABLE_LABELS = ['每月用量', '用量信息', 'Token 用量', 'Tokens 用量', 'Token Usage'];

  var state = {
    lastData: null,
    mutationTimer: 0,
    lastPath: location.pathname,
    lastError: '',
    lastCardText: ''
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

  function findCardByLayout() {
    var root = document.querySelector('main') || document.body;
    var values = root.querySelectorAll('[data-usage-layout-font="value"]');
    var best = null;
    var bestScore = -1;

    for (var i = 0; i < values.length; i++) {
      var value = parseDomNumber(values[i].textContent);
      if (value === null) continue;
      var row = values[i].closest('[data-usage-layout-row="true"]');
      if (!row) continue;

      var rowText =
        (row.textContent || '') +
        ' ' +
        ((row.parentElement && row.parentElement.textContent) || '');
      var score = (/Token|用量|Usage|消耗/i.test(rowText) ? 1000000 : 0) + String(value).length;
      if (score > bestScore) {
        bestScore = score;
        best = { element: values[i], container: row };
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

  function numericLeafCount(root) {
    var count = 0;
    var nodes = root.querySelectorAll('div, span, p, h1, h2, h3, h4, strong, b, [role="heading"]');
    for (var i = 0; i < nodes.length; i++) {
      if (isLeafNumber(nodes[i])) count++;
    }
    return count;
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

  function findCard() {
    var byLayout = findCardByLayout();
    if (byLayout) return byLayout;
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
        'width:100%',
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

  function renderFallback() {
    var lines = getHostLines();
    if (!lines) return;
    var card = findCard();
    var numberValue = card ? parseDomNumber(card.element.textContent) : null;
    lines.zh.textContent = numberValue !== null ? toChineseNumber(numberValue) : '中文数字：—';
    lines.rate.textContent = '缓存命中率：—';
    lines.rate.title = '等待页面用量数据…';
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
    renderData(data);
  }

  function sync() {
    if (!isUsagePage()) {
      var stale = document.querySelector('[' + HOST_ATTR + ']');
      if (stale) stale.remove();
      state.lastData = null;
      return;
    }

    var card = findCard();
    if (!card) return;
    ensureHost(card);

    if (state.lastCardText !== card.element.textContent) {
      state.lastCardText = card.element.textContent;
      console.debug(
        '[DeepSeek 用量增强] 定位卡片:',
        card.element.textContent,
        '| class:',
        card.element.className || ''
      );
    }

    if (state.lastData) {
      renderData(state.lastData);
    } else {
      renderFallback();
    }
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
