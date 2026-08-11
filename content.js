(function () {
  'use strict';

  var HOST_ATTR = 'data-ds-usage-enh';
  var MUTATION_DEBOUNCE_MS = 250;
  var EXPANDED_WIDTH = 320;
  var COLLAPSED_WIDTH = 148;
  var PILL_HEIGHT = 38;
  var TRANSITION_MS = 260;

  var state = {
    lastData: null,
    collapsed: false,
    cache: {},
    mutationTimer: 0,
    lastPath: location.pathname,
    lastError: '',
    rateAnim: 0,
    renderedRate: null,
    toggling: false
  };

  try {
    state.collapsed = localStorage.getItem('ds-usage-enh-collapsed') === '1';
  } catch (error) {
    // 忽略 localStorage 不可用
  }

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

  function formatCompact(value) {
    var n = toBig(value);
    if (n < 0n) return formatInt(n);
    if (n < 10000n) return formatInt(n);

    var unit = 1000000000000n;
    var name = '万亿';
    if (n < 1000000000000n) {
      unit = 100000000n;
      name = '亿';
    }
    if (n < 100000000n) {
      unit = 10000n;
      name = '万';
    }

    var num = Number(n) / Number(unit);
    var text = num >= 100 ? String(Math.round(num)) : (Math.round(num * 100) / 100).toString();
    return text + name;
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
      '  color-scheme: light dark;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;',
      '  --ds-bg: #242527;',
      '  --ds-text: rgba(255,255,255,.92);',
      '  --ds-muted: rgba(255,255,255,.58);',
      '  --ds-weak: rgba(255,255,255,.40);',
      '  --ds-border: rgba(255,255,255,.08);',
      '  --ds-border-strong: rgba(255,255,255,.16);',
      '  --ds-divider: rgba(255,255,255,.07);',
      '  --ds-track: rgba(255,255,255,.06);',
      '  --ds-accent: #58a6ff;',
      '  --ds-accent-soft: rgba(88,166,255,.85);',
      '  --ds-shadow: 0 8px 28px rgba(0,0,0,.35);',
      '  --ds-tip-bg: #2f3136;',
      '  animation: ds-enter 200ms cubic-bezier(.2,.8,.2,1) both;',
      '  transition: width 260ms cubic-bezier(.2,.8,.2,1), height 260ms cubic-bezier(.2,.8,.2,1);',
      '}',
      '@media (prefers-color-scheme: light) {',
      '  .ds-wrap {',
      '    --ds-bg: #ffffff;',
      '    --ds-text: rgba(15,23,42,.92);',
      '    --ds-muted: rgba(15,23,42,.58);',
      '    --ds-weak: rgba(15,23,42,.40);',
      '    --ds-border: rgba(15,23,42,.08);',
      '    --ds-border-strong: rgba(15,23,42,.16);',
      '    --ds-divider: rgba(15,23,42,.07);',
      '    --ds-track: rgba(15,23,42,.06);',
      '    --ds-accent: #2563eb;',
      '    --ds-accent-soft: rgba(37,99,235,.75);',
      '    --ds-shadow: 0 8px 24px rgba(15,23,42,.12);',
      '    --ds-tip-bg: #f4f4f5;',
      '  }',
      '}',
      '.ds-wrap.collapsed { width: 148px; height: 38px; }',
      '@keyframes ds-enter {',
      '  from { opacity: 0; transform: translateY(8px) scale(.985); }',
      '  to { opacity: 1; transform: none; }',
      '}',
      '.ds-card {',
      '  background: var(--ds-bg);',
      '  border: 1px solid var(--ds-border);',
      '  border-radius: 14px;',
      '  box-shadow: var(--ds-shadow);',
      '  overflow: hidden;',
      '  transition: opacity 160ms ease;',
      '}',
      '.ds-wrap.collapsed .ds-card { opacity: 0; pointer-events: none; }',
      '.ds-head {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 9px 12px;',
      '  border-bottom: 1px solid var(--ds-divider);',
      '}',
      '.ds-title {',
      '  flex: 1;',
      '  font-size: 12.5px;',
      '  font-weight: 500;',
      '  color: var(--ds-text);',
      '  letter-spacing: .01em;',
      '}',
      '.ds-toggle {',
      '  border: 0;',
      '  background: transparent;',
      '  color: var(--ds-weak);',
      '  font-size: 14px;',
      '  line-height: 1;',
      '  cursor: pointer;',
      '  padding: 3px 7px;',
      '  border-radius: 6px;',
      '  transition: background 150ms ease, color 150ms ease;',
      '}',
      '.ds-toggle:hover { background: var(--ds-border); color: var(--ds-text); }',
      '.ds-body { padding: 12px 14px 13px; }',
      '.ds-label {',
      '  font-size: 11px;',
      '  color: var(--ds-weak);',
      '  margin-bottom: 6px;',
      '  letter-spacing: .02em;',
      '}',
      '.ds-rate-row .ds-label { margin: 0; }',
      '.ds-zh-row { display: flex; align-items: flex-start; gap: 8px; }',
      '.ds-zh {',
      '  flex: 1;',
      '  min-width: 0;',
      '  font-size: 22px;',
      '  font-weight: 600;',
      '  color: var(--ds-text);',
      '  line-height: 1.35;',
      '  letter-spacing: .02em;',
      '  word-break: break-all;',
      '  display: -webkit-box;',
      '  -webkit-box-orient: vertical;',
      '  -webkit-line-clamp: 2;',
      '  overflow: hidden;',
      '}',
      '.ds-zh--md { font-size: 20px; }',
      '.ds-zh--sm { font-size: 18px; }',
      '.ds-zh-tag {',
      '  flex: none;',
      '  margin-top: 3px;',
      '  font-size: 10px;',
      '  color: var(--ds-weak);',
      '  border: 1px solid var(--ds-border);',
      '  border-radius: 999px;',
      '  padding: 1px 7px;',
      '  letter-spacing: .04em;',
      '  white-space: nowrap;',
      '}',
      '.ds-ar {',
      '  font-size: 12px;',
      '  color: var(--ds-muted);',
      '  margin-top: 6px;',
      '  font-variant-numeric: tabular-nums;',
      '  letter-spacing: .01em;',
      '}',
      '.ds-divider { height: 1px; background: var(--ds-divider); margin: 13px 0 12px; }',
      '.ds-rate-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }',
      '.ds-rate {',
      '  font-size: 21px;',
      '  font-weight: 600;',
      '  color: var(--ds-text);',
      '  font-variant-numeric: tabular-nums;',
      '  letter-spacing: -.01em;',
      '}',
      '.ds-bar {',
      '  height: 5px;',
      '  border-radius: 999px;',
      '  background: var(--ds-track);',
      '  margin-top: 9px;',
      '  overflow: hidden;',
      '}',
      '.ds-bar-fill {',
      '  height: 100%;',
      '  width: 0%;',
      '  border-radius: 999px;',
      '  background: var(--ds-accent);',
      '}',
      '.ds-meta-row {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 8px;',
      '  margin-top: 9px;',
      '  font-size: 11.5px;',
      '  color: var(--ds-muted);',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.ds-info {',
      '  position: relative;',
      '  flex: none;',
      '  color: var(--ds-weak);',
      '  font-size: 12px;',
      '  line-height: 1;',
      '  padding: 3px 4px;',
      '  margin: -3px -4px;',
      '  cursor: help;',
      '  border-radius: 4px;',
      '  outline: none;',
      '}',
      '.ds-info:hover, .ds-info:focus { color: var(--ds-muted); }',
      '.ds-tip {',
      '  position: absolute;',
      '  right: -3px;',
      '  bottom: calc(100% + 8px);',
      '  width: 250px;',
      '  padding: 9px 11px;',
      '  background: var(--ds-tip-bg);',
      '  border: 1px solid var(--ds-border);',
      '  border-radius: 10px;',
      '  box-shadow: var(--ds-shadow);',
      '  opacity: 0;',
      '  transform: translateY(4px);',
      '  pointer-events: none;',
      '  transition: opacity 160ms ease, transform 160ms ease;',
      '  z-index: 1;',
      '}',
      '.ds-info:hover .ds-tip, .ds-info:focus .ds-tip {',
      '  opacity: 1;',
      '  transform: none;',
      '  pointer-events: auto;',
      '}',
      '.ds-tip-line { font-size: 11px; line-height: 1.5; color: var(--ds-muted); white-space: normal; }',
      '.ds-tip-line + .ds-tip-line { margin-top: 3px; }',
      '.ds-tip-calc { color: var(--ds-text); font-variant-numeric: tabular-nums; }',
      '.ds-tip-calc:empty { display: none; }',
      '.ds-foot {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin-top: 12px;',
      '  font-size: 11px;',
      '  color: var(--ds-weak);',
      '}',
      '.ds-status {',
      '  position: relative;',
      '  width: 6px;',
      '  height: 6px;',
      '  border-radius: 50%;',
      '  background: var(--ds-accent-soft);',
      '  flex: none;',
      '}',
      '.ds-status::after {',
      '  content: "";',
      '  position: absolute;',
      '  inset: 0;',
      '  border-radius: 50%;',
      '  background: var(--ds-accent-soft);',
      '  animation: ds-pulse 1800ms ease-out 1200ms infinite;',
      '}',
      '@keyframes ds-pulse {',
      '  0% { transform: scale(1); opacity: 0; }',
      '  25% { opacity: .45; }',
      '  60% { transform: scale(1.8); opacity: 0; }',
      '  100% { transform: scale(1.8); opacity: 0; }',
      '}',
      '.ds-pill {',
      '  position: absolute;',
      '  left: 0;',
      '  right: 0;',
      '  bottom: 0;',
      '  height: 38px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 7px;',
      '  background: var(--ds-bg);',
      '  border: 1px solid var(--ds-border);',
      '  border-radius: 999px;',
      '  box-shadow: var(--ds-shadow);',
      '  opacity: 0;',
      '  pointer-events: none;',
      '  transition: opacity 160ms ease, border-color 160ms ease;',
      '  cursor: pointer;',
      '}',
      '.ds-wrap.collapsed .ds-pill { opacity: 1; pointer-events: auto; }',
      '.ds-pill:hover { border-color: var(--ds-border-strong); }',
      '.ds-pill-dot {',
      '  width: 6px;',
      '  height: 6px;',
      '  border-radius: 50%;',
      '  background: var(--ds-accent-soft);',
      '  flex: none;',
      '}',
      '.ds-pill-text {',
      '  font-size: 12.5px;',
      '  font-weight: 600;',
      '  color: var(--ds-text);',
      '  font-variant-numeric: tabular-nums;',
      '  letter-spacing: .01em;',
      '  white-space: nowrap;',
      '}',
      '.ds-fade-out { opacity: 0; transform: translateY(-3px); transition: opacity 90ms ease, transform 90ms ease; }',
      '.ds-fade-in { animation: ds-fade-in 180ms ease; }',
      '@keyframes ds-fade-in {',
      '  from { opacity: 0; transform: translateY(3px); }',
      '  to { opacity: 1; transform: none; }',
      '}',
      '</style>',
      '<div class="ds-wrap' + (state.collapsed ? ' collapsed' : '') + '">',
      '  <div class="ds-card">',
      '    <div class="ds-head">',
      '      <span class="ds-title">DeepSeek 用量助手</span>',
      '      <button class="ds-toggle" type="button" title="' + (state.collapsed ? '展开' : '收起') + '">' + (state.collapsed ? '+' : '−') + '</button>',
      '    </div>',
      '    <div class="ds-body">',
      '      <div class="ds-label">总 Token</div>',
      '      <div class="ds-zh-row">',
      '        <div class="ds-zh">等待数据…</div>',
      '        <span class="ds-zh-tag">中文读数</span>',
      '      </div>',
      '      <div class="ds-ar"></div>',
      '      <div class="ds-divider"></div>',
      '      <div class="ds-rate-row">',
      '        <span class="ds-label">缓存命中率</span>',
      '        <span class="ds-rate">—</span>',
      '      </div>',
      '      <div class="ds-bar"><div class="ds-bar-fill"></div></div>',
      '      <div class="ds-meta-row">',
      '        <span class="ds-meta"></span>',
      '        <span class="ds-info" tabindex="0" aria-label="命中率计算说明">',
      '          ⓘ',
      '          <span class="ds-tip">',
      '            <span class="ds-tip-line">缓存命中率 = Cache Hit Tokens ÷ Input Tokens</span>',
      '            <span class="ds-tip-line ds-tip-calc ds-tip-calc-value"></span>',
      '          </span>',
      '        </span>',
      '      </div>',
      '      <div class="ds-foot">',
      '        <span class="ds-status"></span>',
      '        <span>自动更新 · 跟随当前筛选周期</span>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="ds-pill">',
      '    <span class="ds-pill-dot"></span>',
      '    <span class="ds-pill-text">DS</span>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  function getCardRefs(host) {
    var shadow = host.shadowRoot;
    return {
      wrap: shadow.querySelector('.ds-wrap'),
      card: shadow.querySelector('.ds-card'),
      zh: shadow.querySelector('.ds-zh'),
      ar: shadow.querySelector('.ds-ar'),
      rate: shadow.querySelector('.ds-rate'),
      barFill: shadow.querySelector('.ds-bar-fill'),
      meta: shadow.querySelector('.ds-meta'),
      tipCalc: shadow.querySelector('.ds-tip-calc-value'),
      toggle: shadow.querySelector('.ds-toggle'),
      pill: shadow.querySelector('.ds-pill'),
      pillText: shadow.querySelector('.ds-pill-text')
    };
  }

  function measureExpandedHeight(wrap) {
    var prevTransition = wrap.style.transition;
    var prevHeight = wrap.style.height;
    var prevWidth = wrap.style.width;
    wrap.style.transition = 'none';
    wrap.style.height = 'auto';
    wrap.style.width = EXPANDED_WIDTH + 'px';
    var height = wrap.offsetHeight;
    wrap.style.transition = prevTransition;
    wrap.style.height = prevHeight;
    wrap.style.width = prevWidth;
    return height;
  }

  function setCollapsed(refs, collapsed) {
    if (state.toggling || state.collapsed === collapsed) return;
    state.toggling = true;
    state.collapsed = collapsed;
    try {
      localStorage.setItem('ds-usage-enh-collapsed', collapsed ? '1' : '0');
    } catch (error) {
      // 忽略 localStorage 不可用
    }

    var wrap = refs.wrap;
    var card = refs.card;
    var pill = refs.pill;

    if (collapsed) {
      wrap.classList.remove('collapsed');
      wrap.style.width = EXPANDED_WIDTH + 'px';
      wrap.style.height = 'auto';
      card.style.opacity = '1';
      pill.style.opacity = '0';
      void wrap.offsetHeight;
      wrap.style.height = wrap.offsetHeight + 'px';
      void wrap.offsetHeight;
      wrap.style.width = COLLAPSED_WIDTH + 'px';
      wrap.style.height = PILL_HEIGHT + 'px';
      card.style.opacity = '0';
      pill.style.opacity = '1';
      wrap.classList.add('collapsed');
    } else {
      wrap.classList.add('collapsed');
      wrap.style.width = COLLAPSED_WIDTH + 'px';
      wrap.style.height = PILL_HEIGHT + 'px';
      card.style.opacity = '0';
      pill.style.opacity = '1';
      void wrap.offsetHeight;
      wrap.style.height = measureExpandedHeight(wrap) + 'px';
      void wrap.offsetHeight;
      wrap.style.width = EXPANDED_WIDTH + 'px';
      card.style.opacity = '1';
      pill.style.opacity = '0';
      wrap.classList.remove('collapsed');
    }

    refs.toggle.textContent = collapsed ? '+' : '−';
    refs.toggle.title = collapsed ? '展开' : '收起';

    setTimeout(function () {
      wrap.style.width = '';
      wrap.style.height = '';
      card.style.opacity = '';
      pill.style.opacity = '';
      state.toggling = false;
    }, TRANSITION_MS + 80);
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
        setCollapsed(refs, !state.collapsed);
      });
      refs.pill.addEventListener('click', function () {
        setCollapsed(refs, false);
      });
    }
    return getCardRefs(host);
  }

  function setZh(refs, text) {
    refs.zh.classList.remove('ds-zh--md', 'ds-zh--sm');
    if (text.length > 14) refs.zh.classList.add('ds-zh--sm');
    else if (text.length > 8) refs.zh.classList.add('ds-zh--md');
    setTextAnimated(refs.zh, text);
  }

  function setTextAnimated(el, text) {
    var next = String(text);
    if (el.textContent === next && !el.classList.contains('ds-fade-out')) return;
    if (el.__dsFadeTimer) clearTimeout(el.__dsFadeTimer);
    el.classList.remove('ds-fade-in');
    el.classList.add('ds-fade-out');
    el.__dsFadeTimer = setTimeout(function () {
      el.textContent = next;
      el.classList.remove('ds-fade-out');
      el.classList.add('ds-fade-in');
      el.__dsFadeTimer = setTimeout(function () {
        el.classList.remove('ds-fade-in');
      }, 200);
    }, 90);
  }

  function animateRate(refs, percent) {
    if (state.rateAnim) cancelAnimationFrame(state.rateAnim);
    var duration = 520;
    var start = null;

    function frame(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min(1, (timestamp - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      var value = percent * eased;
      refs.rate.textContent = value.toFixed(2) + '%';
      refs.barFill.style.width = Math.min(100, value) + '%';
      if (progress < 1) {
        state.rateAnim = requestAnimationFrame(frame);
      } else {
        state.rateAnim = 0;
        refs.rate.textContent = percent.toFixed(2) + '%';
        refs.barFill.style.width = Math.min(100, percent) + '%';
      }
    }

    state.rateAnim = requestAnimationFrame(frame);
  }

  function updatePill(refs, total) {
    refs.pillText.textContent = formatCompact(total);
  }

  function renderWaiting(refs) {
    refs.zh.textContent = '等待数据…';
    refs.ar.textContent = '';
    refs.rate.textContent = '—';
    refs.barFill.style.width = '0%';
    refs.meta.textContent = '正在等待页面用量接口…';
    refs.tipCalc.textContent = '';
    refs.pillText.textContent = 'DS';
    state.renderedRate = null;
    if (state.rateAnim) {
      cancelAnimationFrame(state.rateAnim);
      state.rateAnim = 0;
    }
  }

  function renderDomOnly(refs, value) {
    setZh(refs, toChineseNumber(value));
    setTextAnimated(refs.ar, formatInt(value) + ' Tokens');
    updatePill(refs, value);
    refs.rate.textContent = '—';
    refs.barFill.style.width = '0%';
    refs.meta.textContent = '当前周期数据尚未捕获，请再次切换周期';
    refs.tipCalc.textContent = '';
    state.renderedRate = null;
    if (state.rateAnim) {
      cancelAnimationFrame(state.rateAnim);
      state.rateAnim = 0;
    }
  }

  function renderData(refs, data) {
    setZh(refs, toChineseNumber(data.total));
    setTextAnimated(refs.ar, formatInt(data.total) + ' Tokens');
    updatePill(refs, data.total);

    var input = data.hit + data.miss;
    if (input === 0n) {
      if (state.rateAnim) {
        cancelAnimationFrame(state.rateAnim);
        state.rateAnim = 0;
      }
      refs.rate.textContent = '—';
      refs.barFill.style.width = '0%';
      refs.meta.textContent = '当前周期暂无输入 Token';
      refs.tipCalc.textContent = '';
      state.renderedRate = null;
      return;
    }

    var percent = Number((data.hit * 10000n) / input) / 100;
    var percentText = percent.toFixed(2) + '%';
    refs.meta.textContent = '命中 ' + formatInt(data.hit) + ' · 输入 ' + formatInt(input);
    refs.tipCalc.textContent = formatInt(data.hit) + ' ÷ ' + formatInt(input) + ' ≈ ' + percentText;

    if (state.renderedRate === null || state.renderedRate !== percent) {
      state.renderedRate = percent;
      animateRate(refs, percent);
    } else if (!state.rateAnim) {
      refs.rate.textContent = percentText;
      refs.barFill.style.width = Math.min(100, percent) + '%';
    }
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
    if (!document.body) return;
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

    if (!document.body) {
      scheduleSync();
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
  window.postMessage({ source: 'ds-usage-enh-content', type: 'ready' }, '*');

  var observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', scheduleSync);

  setInterval(function () {
    if (location.pathname !== state.lastPath) {
      state.lastPath = location.pathname;
      scheduleSync();
    }
  }, 1000);

  scheduleSync();
})();
