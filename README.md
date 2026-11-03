# Bitter Sweet Endroll i18n

游戏 [ビタースイートエンドロール ～Bitter Sweets／The End～](https://www.dlsite.com/aix/work/=/product_id/RJ01685413.html) 的非官方多语言补丁，在程序「设置」界面内添加多语言菜单，游戏内可随时切换任意语言。

目前提供中文翻译，由 AI 模型 DeepSeek V4.1 Flash Max 校对。友情提示，由于文本部分全由 AI 进行处理，因此部分台词会出现特别生草的内容。

使用其他语言阅读：[English](./README.md) | 中文 | [日本語](./README.ja.md)

## 下载

从 [GitHub Releases](https://github.com/xueelf/bitter-sweet-endroll-i18n/releases/latest) 下载安装器：

- `BitterSweetEndroll-i18n.exe`

## 使用

1. 完全退出游戏。
2. 将 `BitterSweetEndroll-i18n.exe` 放进游戏根目录，与 `Data` 文件夹同级。
3. 双击 exe，按数字选择：

```text
1) 安装/更新
2) 卸载
3) 退出
```

安装时会将游戏原版 `Data/resources/app.asar` 备份为 `Data/resources/base.asar`。卸载会恢复原版，并删除备份。

程序界面语言跟随 Windows 系统语言，例如系统为中文时显示中文，系统为日语时显示日语。当系统语言没有对应的多语言文案时（locales 文件夹内不存在翻译文本），默认显示日语。

## 开发

补丁使用 Bun 与 .NET 8 SDK 构建：

```bash
# 扫描游戏文本，同步进词条文件
bun run extract -- --game "<解包目录>"
# 构建补丁（需要游戏本体）
bun run build -- --game "<游戏根目录或 Data 目录>"
# 构建程序（需要 .NET 8 SDK）
bun run installer
```

译文放在 `locales/<语言代码>/` 下，路径与游戏原文件一一对应。未翻译的条目标记为 `null`，游戏内会显示原文：

```json
{
  "設定": "设置",
  "終了": null
}
```

可以在 `locales/<语言代码>/index.js` 内声明语言的基本信息：

```js
export default {
  // 语言在「设置」列表里显示的名字
  label: '中文',
  messages: {
    // 「设置」界面里语言菜单行的标题
    language: '语言',
    // 启动画面上的文字
    startup: '启动中…',
  },
};
```

## 声明

补丁会修改游戏脚本，exe 图标使用了游戏本体资源，版权归相关方所有。本项目仅供学习用途，请勿肆意宣传滥用。请支持正版游戏。
