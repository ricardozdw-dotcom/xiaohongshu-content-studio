# 图片来源

demo-photo.jpg 为内置 ImageGen 生成的职业梳理概念照片的 JPEG 版本，非真实软件截图或个人实测照片。reference-cover.png、reference-content.png 是本次工作流自行排版生成的参考成品，用于记录字体、字号、配色和留白。它们不是外部小红书作者原图。

真实任务应更换封面主题和署名，不沿用参考样图的作者标识。按宿主支持的方式保留或标注 AI 生成内容。

## v0.3.0 多风格预览

assets/style-previews/ 下的 WebP 是同一匿名 example-plan.json 经本包渲染后的网页缩略版（810×1350）；正式导出仍为 1080×1800 PNG。editorial 封面复用上面的 AI 示例照片，其他封面是 CSS 几何与真实字体构图，不是新生成的照片。预览不是用户稿件，也不是外部作者的小红书原图。

重建：先用 `node scripts/preview-styles.cjs --output NEW_DIRECTORY` 导出 PNG，再用图像转换工具等比例缩至 810×1350 WebP，对应保存为 `风格ID-cover.webp` 与 `风格ID-content.webp`。所有图片须重新视觉检查。styles.html 与风格清单同时维护，不能把任务原稿复制到此目录。

## 示例照片生成提示词

Use case: photorealistic-natural
Asset type: horizontal 3:2 editorial photographic banner for a Chinese Xiaohongshu carousel about using AI to review work experience and career opportunities
Scene/backdrop: a quiet contemporary home workspace in daylight, natural white and warm gray room, modest wooden desk, restrained dusty blue details
Subject: one real East Asian adult professional in their late twenties or thirties viewed from behind and slightly over the shoulder, thoughtfully reviewing work experience at a laptop. Hands naturally rest near an open notebook. On the desk are a few clean resume-like sheets and portfolio printouts; laptop shows a simple abstract chat interface with organized rectangular text blocks, no legible letters. No money or get-rich imagery.
Style/medium: photorealistic candid editorial photography, plausible natural skin and fabric texture, realistic paper and desk materials, not a stock-photo grin
Composition/framing: wide horizontal 3:2 shot, career notes and laptop are central, person secondary; all important objects sit comfortably inside the center for a wide crop
Lighting/mood: soft window daylight, calm, thoughtful, grounded and practical
Constraints: no readable text, no letters, no numbers, no logos, no brand marks, no watermark; no illustrations, no holograms, no cyberpunk, no extra fingers, no celebrity likeness; screen content is only a conceptual mockup
