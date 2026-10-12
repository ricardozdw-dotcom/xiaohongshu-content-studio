# 生成数据格式与命令

脚本只负责确定性的记录和输出，不能替代理阅读链接、判断许可、确认稿件或检查图片。所有任务数据放在独立 job 目录，不能放进公开 skill 仓库。

## 阶段记录

```sh
python scripts/workflow.py init --job JOB --url URL --rights unknown
python scripts/workflow.py submit-source --job JOB --document JOB/原始内容整理_v1.docx --coverage complete --mode detailed_summary
```

只有收到真实用户的改写请求后，才调用下一条。evidence 填实际用户原话，不能填写脚本示例或代替用户作答。

```sh
python scripts/workflow.py confirm-source --job JOB --evidence '实际用户确认原话'
python scripts/workflow.py submit-rewrite --job JOB --document JOB/重新梳理稿_v1.docx
```

只有收到真实用户对当前稿件的做图确认后，才调用：

```sh
python scripts/workflow.py confirm-rewrite --job JOB --evidence '实际用户确认并要求做图的原话'
python scripts/workflow.py status --job JOB
```

rights 可为 unknown、user_owned、authorized、provided。unknown 禁止登记逐字原文；coverage 可为 complete 或 partial，partial 不能推进。重新提交原稿会使两个确认失效；重新提交改写稿会使做图确认失效。

## 文档

文档 JSON 包含 title、可选 subtitle，以及顺序一致的 blocks。block 可为 heading（text、level）、paragraph/metadata（text）、list（items、ordered）、code（text）或 page_break。技术字符串直接写在 code.text 中，不改写字符。

```sh
python scripts/build-document.py --input JOB/source-plan.json --output JOB/原始内容整理_v1.docx --font '目标环境可用中文字体'
```

正文是可编辑文本，不是图片。build-document.py 不负责渲染，必须使用环境的文档渲染能力打开每页图片检查。优先已提供的 Documents 技能与依赖运行时，不能把未验证字体的空白预览视为成功。

## 图片

publish-plan.json 格式见 assets/example-plan.json。正式稿设置 draft_sha256 为 job.json 中 rewrite.sha256。首个 page 为 cover，后续均为 content。

- cover：title 为分行字符串数组，lead 为短说明，image 为相对 JSON 文件目录的本地图片路径，image_note 为来源提示，blocks 为下方正文。
- content：title 为字符串或分行数组，number 为蓝色编号，footer 为底部短标签，blocks 为正文。
- block 类型：paragraph（text，可选 lead）、meta/label/quote/code（text）、prompt（paragraphs）、steps（items 的 title/text）、schedule（items 的 period/title/text）。

所有文字按文本处理，不能插入 HTML。命令代码使用 code，完整可复制版本另附 TXT。封面图片不能使用远程 URL，先将有权使用的资产保存在 JSON 旁边或其子目录。

```sh
node scripts/render-carousel.cjs --job JOB --input JOB/publish-plan.json --output JOB/release-v1
```

有环境依赖运行时时，使用其 Node 和 Playwright；用 NODE_PATH 指定已有包位置。BROWSER_EXECUTABLE 可以指定现有浏览器路径，未指定则用 Playwright 的浏览器。包内不固定机器路径。

assets/example-plan.json 只是匿名版式测试，不能交付为用户成稿。仅模板测试使用 --preview；它不会通过正式 ZIP 检查。

```sh
node scripts/render-carousel.cjs --preview --input assets/example-plan.json --output NEW_PREVIEW_DIRECTORY
```

输出编号 PNG、carousel.html 与 render-report.json。渲染会检查 1080×1800、横向与纵向溢出、图片加载和页脚间距；不会自动缩小正文。失败时调整文案或增加分页，换新版本目录再输出。全部 PNG 仍需人工视觉检查。

## 发布包

完成视觉检查后，正文与标签写入发布文案.md，命令或提示词写入 TXT。只打包明确列出的成品，不把源稿、登录状态、QA 文件、整个 job 目录混进 ZIP。

```sh
python scripts/package-release.py --job JOB --images JOB/release-v1 --caption JOB/发布文案.md --copyable JOB/可复制文本.txt --output JOB/小红书发布包_v1.zip
```

脚本验证原稿与改写稿哈希、正式渲染报告、PNG 尺寸和图片哈希，拒绝旧稿、改过的图片和测试预览。它只生成 ZIP，不上传小红书。
