# DeepSeek 用量增强（Chrome/Edge MV3 扩展）

在 DeepSeek 开放平台用量页（`https://platform.deepseek.com/usage`）右下角显示一张悬浮卡片：

- 用中文普通数字（一、二、三…，非财务大写）显示当前周期总 Token 数；
- 显示缓存命中率、命中/输入明细和进度条；
- 支持一键收起为胶囊，自动跟随浅色/深色主题。

## 功能原理

- 通过主世界 hook 拦截页面自己的用量接口（`/api/v0/usage/amount` 或 `/api/v0/usage/by_api_key/amount`）响应，与页面显示的数据完全一致；
- 命中率 = `PROMPT_CACHE_HIT_TOKEN / (PROMPT_CACHE_HIT_TOKEN + PROMPT_CACHE_MISS_TOKEN)`；
- 自动跟随页面周期切换（本月 / 30 天 / 近 7 天），无需解析页面控件；
- 接口尚未返回时自动回退到页面数字，命中率显示 `—`；
- 刷新页面、SPA 内导航后都会自动重新计算，不会重复插入。

## 安装

1. 打开 Edge/Chrome 扩展管理页（`edge://extensions` 或 `chrome://extensions`）；
2. 开启“开发人员模式”；
3. 点击“加载解压缩的扩展”，选择本项目目录（包含 `manifest.json`）；
4. 登录 `platform.deepseek.com`，打开用量页即可看到效果。

## 打包分发

将以下 5 个文件打成 zip（文件位于 zip 根目录）即可分享给同事：

- `manifest.json`
- `hook.js`
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
- v1 只做“总 Token”主卡片和当前周期聚合命中率，不包含多 Key、按模型拆分或设置页。
