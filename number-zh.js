/**
 * 将整数转换为中文普通数字（一、二、三…），不使用财务大写（壹、贰、叁…）。
 *
 * 规则：
 * - 数字：零一二三四五六七八九；单位：十百千万亿。
 * - 按四位分组，超过 10^12 后按「万亿」「亿亿」「万亿亿」…递推。
 * - 整个数字的最高位为 10~19 时省略「一」（如 12 → 十二）；
 *   非最高位组内的 10~19 保留「一」（如 一亿零一十二）。
 * - 中间空位补「零」（如 100000001 → 一亿零一）。
 */
(function (global) {
  'use strict';

  var DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var SMALL_UNITS = ['千', '百', '十', ''];

  function toBigInt(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('toChineseNumber: 非有限数字');
      return BigInt(Math.trunc(value));
    }
    var raw = String(value).replace(/[,，\s\u3000\u00a0]/g, '');
    var match = raw.match(/^(-?)(\d+)(?:\.\d+)?$/);
    if (!match) throw new TypeError('toChineseNumber: 无法解析为整数: ' + String(value));
    return BigInt(match[1] + match[2]);
  }

  function groupUnit(index) {
    if (index <= 0) return '';
    if (index === 1) return '万';
    var pairs = Math.floor(index / 2);
    if (index % 2 === 0) return new Array(pairs + 1).join('亿');
    return '万亿' + new Array(Math.floor((index - 3) / 2) + 1).join('亿');
  }

  function convertGroupDigits(n) {
    if (n === 0) return '';
    var s = String(n);
    while (s.length < 4) s = '0' + s;
    var result = '';
    var pendingZero = false;
    for (var i = 0; i < 4; i++) {
      var digit = Number(s[i]);
      if (digit === 0) {
        if (result) pendingZero = true;
      } else {
        if (pendingZero) {
          result += '零';
          pendingZero = false;
        }
        result += DIGITS[digit] + SMALL_UNITS[i];
      }
    }
    return result;
  }

  function convertGroup(n, keepOneForTen) {
    var text = convertGroupDigits(n);
    if (!keepOneForTen && n >= 10 && n < 20) text = text.replace(/^一/, '');
    return text;
  }

  function toChineseNumber(value) {
    var n = toBigInt(value);
    if (n < 0n) return '负' + toChineseNumber(-n);
    if (n === 0n) return '零';

    var groups = [];
    while (n > 0n) {
      groups.push(Number(n % 10000n));
      n = n / 10000n;
    }

    var parts = [];
    var previousGroup = null;
    var zeroGap = false;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      if (group === 0) {
        if (parts.length > 0) zeroGap = true;
        continue;
      }

      var text = convertGroup(group, i < groups.length - 1) + groupUnit(i);
      if (
        parts.length > 0 &&
        (zeroGap || previousGroup === null || previousGroup % 10 === 0 || group < 1000)
      ) {
        parts.push('零');
      }
      parts.push(text);
      previousGroup = group;
      zeroGap = false;
    }

    return parts.join('');
  }

  global.toChineseNumber = toChineseNumber;
})(typeof window !== 'undefined' ? window : globalThis);
