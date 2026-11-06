/**
 * 單一 zh-Hant 字串檔（介面）。介面一律用繁體中文書面語；
 * 藥物、儀器、程序名稱依香港醫院習慣保留英文。角色對白（粵語）另放 dialogue.zh-Hant.ts。
 */
export const ui = {
  appTitle: '單獨值夜',
  nav: {
    label: '主要導覽',
    start: '開始',
    settings: '設定',
  },
  start: {
    heading: '單獨值夜',
    tagline: '你是內科病房的值班醫生。今晚，病房只有你一人。',
    startButton: '開始值夜',
    settingsLink: '前往設定頁',
    blockedTitle: '尚未完成設定，無法開始',
    blockedMissingKey: '請先在設定頁填寫 API key。沒有 API key 不能遊玩，亦沒有示範模式。',
    blockedMissingBaseUrl: '請先在設定頁填寫有效的 API base URL。',
    blockedMissingModel: '請先在設定頁填寫 model。',
  },
  game: {
    heading: '值班畫面',
    placeholder: '遊戲主畫面尚未實作（M0 只提供專案骨架）。',
    backToStart: '返回開始畫面',
  },
  settings: {
    heading: '設定',
    aiSection: 'AI 連線',
    baseUrlLabel: 'API base URL',
    baseUrlHint: '任何相容 OpenAI chat/completions 的供應商均可。',
    apiKeyLabel: 'API key',
    apiKeyHint: '只儲存在這個瀏覽器的 localStorage，請使用低額度的 key。',
    showKey: '顯示 API key',
    modelLabel: 'Model',
    modelHint: '建議使用價錢較低的對話模型。',
    gameSection: '遊戲選項',
    nurseConfirmLabel: '護士在高風險 order 前先要求確認',
    save: '儲存設定',
    saved: '設定已儲存。',
    reset: '還原預設值',
    resetDone: '已還原預設值（尚未儲存）。',
    testConnection: '測試連線',
    testing: '測試中……',
    testResult: {
      ok: '連線成功。',
      okNonJson: '連線成功，但供應商未有按要求回覆 JSON；遊戲可能需要更換 model。',
      auth: '認證失敗：API key 無效或沒有權限。',
      network:
        '無法連線：請檢查網絡與 base URL；若供應商不允許瀏覽器直接連線（CORS），需要另行設置代理。',
      timeout: '連線逾時：供應商沒有在限期內回應。',
      http: '供應商回報錯誤，HTTP 狀態碼：',
      format: '供應商回覆的格式不符合 OpenAI chat/completions。',
      invalidConfig: '設定不完整，無法測試。',
    },
    validation: {
      baseUrl: 'API base URL 必須是以 http:// 或 https:// 開頭的網址。',
      apiKey: 'API key 不可留空。',
      model: 'Model 不可留空。',
    },
    shortcutsHeading: '快速鍵',
    shortcutsPending: '快速鍵表將於後續版本提供。',
    privacy: '存檔留在瀏覽器',
    disclaimerHeading: '免責聲明',
    disclaimer: '本遊戲為教學遊戲，並非臨床指引；病例全部虛構，不可用作真實診療依據。',
  },
  errors: {
    contentInvalid: '內容檔驗證失敗，無法啟動遊戲。',
  },
} as const;

export type UiStrings = typeof ui;
