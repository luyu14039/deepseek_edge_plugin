# DeepSeek 用量增强（Chrome/Edge MV3 扩展）

在 DeepSeek 开放平台用量页（`https://platform.deepseek.com/usage`）的“总 Token”主卡片下方：

- 用中文普通数字（一、二、三…，非财务大写）重新显示总 Token 数；
- 自动计算并显示当前选中月份的缓存命中率（命中 / 输入）。

## 功能原理

- 通过页面同源调用平台私有接口 `/api/v0/usage/amount?year=&month=` 获取真实 Token 数据；
- 命中率 = `PROMPT_CACHE_HIT_TOKEN / (PROMPT_CACHE_HIT_TOKEN + PROMPT_CACHE_MISS_TOKEN)`；
- 接口不可用时自动回退到页面数字，命中率显示 `—`；
- 切换月份、刷新页面、SPA 内导航后都会自动重新计算，不会重复插入。

## 安装

1. 打开 Edge/Chrome 扩展管理页（`edge://extensions` 或 `chrome://extensions`）；
2. 开启“开发人员模式”；
3. 点击“加载解压缩的扩展”，选择本项目目录（包含 `manifest.json`）；
4. 登录 `platform.deepseek.com`，打开用量页即可看到效果。

## 打包分发

将以下 4 个文件打成 zip（文件位于 zip 根目录）即可分享给同事：

- `manifest.json`
- `number-zh.js`
- `content.js`
- `README.md`

## 运行单元测试

需要 Node.js 18+：

```powershell
node --test tests/number-zh.test.mjs
```

## 已知限制

- 平台用量接口是私有接口，DeepSeek 可能调整，届时命中率会显示 `—`，中文数字仍可回退显示；
- 需要保持平台页面登录态；
- v1 只做“总 Token”主卡片和当前月份聚合命中率，不包含多 Key、按模型拆分或设置页。
