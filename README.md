# 拓曜字幕工作室 Subtitle Studio

把英文影片片段做成「中英雙語字幕＋英文語塊學習卡片」的教學影片，配色沿用拓曜知識宇宙官網品牌色。

## 第一次使用

1. 安裝套件：

   ```bash
   cd ~/Sites/subtitle-studio && npm install
   ```

2. 設定 Claude API 金鑰：把 `.env.example` 複製成 `.env`，在 `ANTHROPIC_API_KEY=` 後面貼上金鑰。`.env` 已列在 `.gitignore`，不會被提交。

3. 啟動工具，然後打開 http://127.0.0.1:5177

   ```bash
   npm start
   ```

需要的本機工具：`ffmpeg`、`whisper`（openai-whisper）、Node.js 20.12 以上。第一次聽寫時，whisper 會先下載模型（medium.en 約 1.4 GB）。

## 使用流程

1. **新增專案**：填影片檔路徑，或把影片拖進上傳區；再填開始、結束時間（格式為 `分:秒`，可以有小數，例如 `5:22.4`）和影片來源名稱。
2. **自動處理**：裁切 → whisper 聽寫英文 → Claude 分句、翻譯、挑語塊與專有名詞、寫學習卡片。
3. **預覽與修改**：
   - 字幕與標記：修改中文翻譯、新增或刪除螢光筆標記（語塊用綠色、專有名詞用紫色）
   - 學習卡片：修改標題、中文意思、用法說明、例句
   - 改完按「儲存並更新預覽」
4. **輸出**：按「輸出影片」產生 1080p MP4，也可以下載 SRT 雙語字幕檔。

## 小提醒

- 一次最多處理 10 分鐘。片段越長，輸出越久：每秒影片約要渲染 24 格字幕圖層。
- 「重新分析」會覆蓋你手動改過的翻譯和卡片。
- 卡片的「對應的字幕標記」必須和某句字幕裡的標記英文相同，卡片才會出現在影片上。
- 目前只支援英文原音的影片。

## 專案結構

```
server.mjs          本機伺服器（只開在 127.0.0.1）
lib/media.mjs       ffmpeg 裁切、whisper 聽寫
lib/analyze.mjs     Claude 分析（claude-opus-5-5、結構化輸出）、時間軸對齊、SRT
lib/render.mjs      逐格渲染字幕圖層，再用 ffmpeg 合成
public/index.html   操作介面
public/overlay.html 字幕與學習卡片版面（品牌色）
projects/<id>/      每個專案的片段、聽寫結果、分析結果、輸出檔
demo/               第一版設計 demo
```
