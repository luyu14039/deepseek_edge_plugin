import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../version.js', import.meta.url), 'utf8');
const sandbox = {};
new Function('globalThis', code)(sandbox);
const { parseVersion, compareVersions, extractUpdateInfo } = sandbox.DsUpdate;

test('parseVersion 解析常见格式', () => {
  assert.deepEqual(parseVersion('0.4.0'), [0, 4, 0]);
  assert.deepEqual(parseVersion('v0.4.0'), [0, 4, 0]);
  assert.deepEqual(parseVersion('0.4.1-beta'), [0, 4, 1]);
  assert.deepEqual(parseVersion('0.4'), [0, 4, 0]);
  assert.deepEqual(parseVersion(1), [1, 0, 0]);
  assert.equal(parseVersion('abc'), null);
  assert.equal(parseVersion(''), null);
});

test('compareVersions 大小比较', () => {
  assert.equal(compareVersions('0.4.0', '0.3.9'), 1);
  assert.equal(compareVersions('0.4.0', '0.4.0'), 0);
  assert.equal(compareVersions('v0.3.9', '0.4.0'), -1);
  assert.equal(compareVersions('bad', '0.4.0'), null);
});

test('extractUpdateInfo 仅在远端更新时返回信息', () => {
  assert.equal(extractUpdateInfo(null, '0.4.0'), null);
  assert.equal(extractUpdateInfo({ tag_name: 'v0.4.0' }, '0.4.0'), null);
  assert.equal(extractUpdateInfo({ tag_name: 'v0.3.9' }, '0.4.0'), null);
  const info = extractUpdateInfo(
    {
      tag_name: 'v0.4.1',
      html_url: 'https://github.com/luyu14039/deepseek_edge_plugin/releases/tag/v0.4.1',
      body: '修复一些细节'
    },
    '0.4.0'
  );
  assert.deepEqual(info, {
    version: '0.4.1',
    tag: 'v0.4.1',
    url: 'https://github.com/luyu14039/deepseek_edge_plugin/releases/tag/v0.4.1',
    notes: '修复一些细节'
  });
});
