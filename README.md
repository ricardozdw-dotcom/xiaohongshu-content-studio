# 小红书成稿工坊

`xiaohongshu-content-studio` 将链接或上传材料整理为文档，经内容确认后改写，再制作带文字的小红书图文。它是一个可安装的 Agent Skill，不是自动抓取所有视频或自动发布账号的服务。

## 三阶段流程

1. **内容整理**：读取链接的有效正文、视频口播和关键画面，输出原始内容整理文档，等待用户检查或要求改写。
2. **重新梳理**：观点类重建表达；教程保留前置条件、步骤、命令、参数与验收标准。输出改写文档，等待确认并要求做图。
3. **图文制作**：按白底宋体、黑色标题、灰色划线、蓝色编号和写实封面制作 1080×1800 PNG，附标题、正文、标签、可复制文本及 ZIP。

全局的“后续操作都允许”不替代内容确认。阶段记录绑定文档版本，修改后旧确认失效；模板测试预览不能打包成正式稿。

## 安装与调用

本仓库根目录就是 skill 目录。可以在支持技能安装的 Codex 环境中提出：

> 使用 skill-installer，从 https://github.com/ricardozdw-dotcom/xiaohongshu-content-studio 安装根目录的 skill，名字保持 xiaohongshu-content-studio。

也可以把完整目录放在宿主支持的个人技能目录。当前 Codex 文档列出用户目录 `~/.agents/skills`，仓库目录 `.agents/skills`；不同宿主请使用其实际技能位置。[官方技能说明](https://learn.chatgpt.com/docs/build-skills)

安装后可这样请求：

> 使用 $xiaohongshu-content-studio，先整理这个链接的内容，输出文档，等我确认后再改写和制作小红书图文。

## 能力与限制

- 链接读取、登录访问、音视频转写、图像生成由宿主提供。本包不自带登录凭据、转写模型或付费 API。
- 无完整字幕或授权转写能力时，请用户补充媒体或字幕；无法访问的内容不补写成“全文”。
- 自有、授权或直接提供材料可按许可范围完整转写；普通第三方链接提供全部要点的详细整理，不默认逐字复制整篇。
- 写实封面由可用的图像生成能力或用户提供的图片制作；准确文字用模板排版。示例照片为 AI 生成，不是亲测截图。
- 文档和所有 PNG 都要渲染并逐页检查；自动检测不能验证内容正确性或中文字体视觉质量。
- 仅交付发布素材，不自动操作小红书账号，不自动把每次用户稿件上传 GitHub。

## 固定模板

参考图用于版式复现，真实任务更换主题、署名和封面素材。

<img src="assets/reference-cover.png" alt="封面版式参考" width="270">
<img src="assets/reference-content.png" alt="正文版式参考" width="270">

可编辑样式在 `assets/carousel.css`，匿名计划示例在 `assets/example-plan.json`。用户数据存入独立任务目录，不提交到此仓库。

## 本地导出依赖

优先使用宿主已有的依赖运行时。不具备时，开发环境可安装本包列出的依赖：

```sh
python -m pip install -r requirements.txt
npm install
npx playwright install chromium
```

Node.js 至少 18；Python 至少 3.9。测试版本为 Playwright 1.62.1 与 python-docx 1.2.0。[Playwright 安装文档](https://playwright.dev/docs/intro)，[python-docx 安装文档](https://python-docx.readthedocs.io/en/latest/user/install.html)

浏览器可用 `BROWSER_EXECUTABLE` 指定；中文字体必须在渲染环境可用。Word 渲染由宿主文档能力完成，导出脚本不会暗中安装软件或调用收费接口。

脚本用法与 JSON 格式见 [生成数据格式](references/artifact-format.md)。测试命令：

```sh
python -m unittest discover -s tests
```

## 文件

- `SKILL.md`：三阶段工作流与路由。
- `agents/openai.yaml`：中文名称、描述与启动提示。
- `references/`：采集、改写、版式与生成格式。
- `assets/`：CSS、匿名示例、AI 示例照片与参考样图。
- `scripts/`：确认记录、Word 生成、PNG 导出与发布包检查。
- `tests/`：确认节点、版本变更与文本保真测试。

公开仓库不等于已获得所有第三方素材的再分发许可。用户原稿、第三方视频、任务发布包、密码、验证码和 API 密钥不属于本仓库发布内容。
