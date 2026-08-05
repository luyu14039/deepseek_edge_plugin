/**
 * 主世界（MAIN world）hook：在页面发起用量请求时捕获响应，
 * 通过 postMessage 转发给隔离世界中的 content.js。
 * 只拦截 amount（Token 用量）接口，不拦截 cost（费用）接口。
 */
(function () {
  'use strict';

  if (window.__dsUsageEnhHooked) return;
  window.__dsUsageEnhHooked = true;

  var TARGET = /\/api\/v0\/usage\/(?:by_api_key\/)?amount(\?|$)/i;

  function publish(url, body) {
    try {
      window.postMessage(
        { source: 'ds-usage-enh-hook', type: 'api-response', url: String(url), body: String(body) },
        '*'
      );
    } catch (error) {
      // 忽略转发失败
    }
  }

  var originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function () {
      var args = arguments;
      var target = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
      if (target && TARGET.test(target)) {
        return originalFetch.apply(this, args).then(function (response) {
          try {
            var clone = response.clone();
            clone.text().then(function (body) {
              publish(target, body);
            });
          } catch (error) {
            // 忽略克隆失败
          }
          return response;
        });
      }
      return originalFetch.apply(this, args);
    };
  }

  var OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR && OriginalXHR.prototype) {
    var originalOpen = OriginalXHR.prototype.open;
    var originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (method, url) {
      this.__dsUsageEnhUrl = String(url);
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function () {
      var xhr = this;
      this.addEventListener('load', function () {
        var url = xhr.__dsUsageEnhUrl || '';
        if (TARGET.test(url)) {
          publish(url, xhr.responseText);
        }
      });
      return originalSend.apply(this, arguments);
    };
  }
})();
