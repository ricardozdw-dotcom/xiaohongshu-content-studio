# 视频口播与浏览器声音转文字

本包带跨电脑浏览器工具，不依赖原作者电脑、某个自动化插件、付费账号或音频驱动。它补充音频采集和识别，不绕过平台限制、不自动下载链接视频，也不自动核实画面。

## 路径选择

1. 记录标题、作者、原链接、实际落地链接与可核实的总时长。先找完整字幕；章节要点和 AI 总结不是字幕。
2. 检查宿主暴露的音频转写工具、已授权连接器及本地能力。可直接处理有权取得的音频时先处理，不要求用户手抄。会议摘要插件不能冒充任意浏览器音频转写工具。
3. 只有浏览器可播放时，提供本包的 `tools/browser-transcribe.html`。公开入口：

   https://ricardozdw-dotcom.github.io/xiaohongshu-content-studio/tools/browser-transcribe.html

   共享弹窗由使用者自己选择；代理协助核对导出结果，不能绕过共享权限。不把语音聊天的麦克风收音当标签页录音。
4. 浏览器识别因网络或设备失败时，先保存音频，用已有本地 Whisper 或其他经授权的转写工具。确实缺能力时才请求最小补充材料，并明确缺什么。

## 网页操作

1. 在桌面 Chrome / Edge 打开工具，把视频放在同一浏览器的另一个标签页。不要直接双击 HTML：模块和共享接口需要 HTTPS 或 localhost。
2. 视频暂停于开头；回工具勾选处理权限确认框，点击“录制标签页声音”。
3. 在弹窗选择视频标签页，勾选“共享标签页音频”。不要选整屏。没有音轨会报错，重新检查选项，不生成伪成功记录。
4. 从头正常速度播放到尾，不跳段、不倍速、不切换目标或混入广告。返回工具停止录音，试听首尾，保存音频备份。
5. 选择语言与 Tiny / Base 模型，填原链接和原视频时长。点击转写。首次从 Hugging Face 和 jsDelivr 下载模型、WASM 与固定版本运行库；识别在浏览器 Worker 内进行，不向本站或转写 API 上传音频。
6. 导出 TXT、可用时的 SRT 与原始 JSON。TXT 可编辑；JSON / SRT 保留自动识别结果。未知结束时间戳保持 null，不猜测字幕时间。
7. 交给代理继续第一阶段：结合回听与关键画面输出原始整理 DOCX，保留原来的两个内容确认节点。

Tiny 为体积优先模型，中文、数字和专业术语容易错，Base 也不保证准确。长视频可分段，但要保留原视频起止位置、顺序和去重记录，不能只处理第一段就当全文。模型下载失败可重试一次或转本地路径，不无限重试。移动端、Safari 和内置浏览器不保证支持标签页音频共享。

## 克隆后本地运行网页

在仓库根目录运行（无需额外 Python 包）：

```sh
python -m http.server 8000 --bind 127.0.0.1
```

打开 `http://localhost:8000/tools/browser-transcribe.html`，或直接用上面的 GitHub Pages 地址。首次仍需联网下载模型；源码 ZIP 不附带权重。录音存在当前页面内存，刷新会丢失，建议先备份。模型可能保存在浏览器缓存中。

## 已有本地转写环境的备选

先验证 `ffmpeg`、`whisper-cli` 与兼容模型文件都可用。未找到权重时说明“程序已安装但缺模型”，不要称环境就绪。中文用多语言模型，不用 `.en` 英语专用权重。按上游文档配置；不暗中安装驱动、修改系统声音路由、启用麦克风或调用付费服务。

```sh
ffmpeg -nostdin -i JOB/标签页录音.webm -ar 16000 -ac 1 -c:a pcm_s16le JOB/录音_16k.wav
whisper-cli -m MODELS/ggml-base.bin -f JOB/录音_16k.wav -l zh -otxt -osrt -oj -of JOB/口播转写
```

使用新输出路径，不覆盖原始音频。不传 duration 参数截断。分块则检查每块成功与拼接范围。安装和大模型下载属于环境配置，遵循宿主权限，不在 Skill 内暗中执行。

## 完整性和采集报告

页面可访问不代表音轨可取；摘要不是完整字幕；时长相近不证明没有漏段；处理整个输入文件不证明它是完整视频；自动识别完成不代表内容已经核对。

工具 JSON 始终为 `coverage: unverified`、`checked: false`。代理检查开头结尾、全部可疑有声缺口、数字专名、命令参数和关键画面后，在 job 内另建 `capture-report.json`，不篡改原始识别 JSON。下例值全部必须替换为真实材料的结果：

```json
{
  "version": 1,
  "source_url": "实际用户提供的原链接",
  "basis": "full_audio_transcription",
  "expected_duration_seconds": 120,
  "processed_duration_seconds": 120,
  "full_timeline_checked": true,
  "review": {"checked": true, "note": "实际核对首尾、缺口、技术细节与画面的方法和结果"},
  "unresolved_gaps": [],
  "artifacts": [{"path": "口播转写_待核对.json", "sha256": "该原始文件的真实SHA256"}]
}
```

`basis` 只接受 full_audio_transcription、full_subtitles 或 provided_full_transcript，不接受 chapter_summary。时长不同（录制前后等待等）需 `review.duration_note` 记录实际核对原因，不能假设完整。字幕核对全程，不要求尾部静音有字幕。artifacts 引用真实原始材料并保存在 job 内。

新视频任务 `workflow.py init --source-kind video`；登记 complete 时附 `--capture-report JOB/capture-report.json`。确认、改写、发布时复核报告及原始材料哈希。报告审核不代替用户对 DOCX 的确认；脚本只防缺报告、摘要冒充和文件被改，不验证代理实际听辨是否正确。旧任务不会被自动改写；新视频任务必须登记正确类型。

## 官方依据与上游许可

- [Chrome 标签页音频与共享控制](https://developer.chrome.com/docs/web-platform/screen-sharing-controls)
- [Transformers.js 2.17.2 自动语音识别](https://huggingface.co/docs/transformers.js/v2.17.2/api/pipelines#module_pipelines.AutomaticSpeechRecognitionPipeline)
- [Whisper Tiny 模型](https://huggingface.co/Xenova/whisper-tiny)
- [Whisper.cpp 安装、模型与音频格式](https://github.com/ggml-org/whisper.cpp)

运行库与权重适用上游各自许可，不被复制进本仓库。仓库依用户选择暂不添加源码许可证。
