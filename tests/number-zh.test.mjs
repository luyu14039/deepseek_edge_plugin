import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../number-zh.js', import.meta.url), 'utf8');
const sandbox = {};
new Function('window', code)(sandbox);
const { toChineseNumber } = sandbox;

test('基本数字', () => {
  assert.equal(toChineseNumber(0), '零');
  assert.equal(toChineseNumber(1), '一');
  assert.equal(toChineseNumber(10), '十');
  assert.equal(toChineseNumber(11), '十一');
  assert.equal(toChineseNumber(20), '二十');
});

test('百千与零的插入', () => {
  assert.equal(toChineseNumber(101), '一百零一');
  assert.equal(toChineseNumber(1000), '一千');
  assert.equal(toChineseNumber(1010), '一千零一十');
  assert.equal(toChineseNumber(1001), '一千零一');
});

test('万以上分组', () => {
  assert.equal(toChineseNumber(10000), '一万');
  assert.equal(toChineseNumber(100000), '十万');
  assert.equal(toChineseNumber(123456789), '一亿二千三百四十五万六千七百八十九');
  assert.equal(toChineseNumber(100000001), '一亿零一');
  assert.equal(toChineseNumber(1000000012), '十亿零一十二');
});

test('亿以上单位', () => {
  assert.equal(toChineseNumber(100000000), '一亿');
  assert.equal(toChineseNumber(1000000000000), '一万亿');
  assert.equal(
    toChineseNumber(987654321012345),
    '九百八十七万亿六千五百四十三亿二千一百零一万二千三百四十五'
  );
});

test('字符串、逗号、小数与 BigInt 输入', () => {
  assert.equal(toChineseNumber('1,234,567'), '一百二十三万四千五百六十七');
  assert.equal(toChineseNumber('1234.56'), '一千二百三十四');
  assert.equal(toChineseNumber('1 0000 0001'), '一亿零一');
  assert.equal(toChineseNumber(100000001n), '一亿零一');
  assert.equal(toChineseNumber(-12), '负十二');
});

test('非法输入抛错', () => {
  assert.throws(() => toChineseNumber('abc'), TypeError);
  assert.throws(() => toChineseNumber(Infinity), TypeError);
});
