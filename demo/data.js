// Demo 資料：Figure All Hands 2026，原片 05:22.4–05:34.2
// 時間單位為秒，以 demo 片段起點（原片 322.4s）為 0。
// parts: 字串 = 一般文字；{t:'chunk'|'term', s:'...'} = 標記語塊 / 專有名詞
// times: 英文每個「有字的 token」依序對應的開口時間（純標點 token 不計）
window.DEMO = {
  source: 'Figure All Hands 2026',
  sourceStamp: '05:22',
  duration: 11.8,
  cues: [
    {
      start: 0.10, end: 3.00,
      en: ['And the robots just —', { t: 'chunk', s: "let's call it what it is" }, '— damn hard.'],
      times: [0.14, 0.24, 0.34, 0.54, 1.40, 1.62, 1.78, 1.92, 1.94, 1.98, 2.22, 2.32],
      zh: ['而機器人呢──', { t: 'chunk', s: '說白了' }, '──就是超級難。'],
    },
    {
      start: 3.20, end: 4.75,
      en: ["It's like 40-plus", { t: 'term', s: 'degrees of freedom' }, ','],
      times: [3.28, 3.38, 3.46, 3.94, 4.18, 4.36],
      zh: ['它有 40 多個', { t: 'term', s: '自由度' }, '，'],
    },
    {
      start: 4.78, end: 7.10,
      en: ["it's like", { t: 'chunk', s: 'one of the most complex pieces of hardware' }, 'on the planet.'],
      times: [4.80, 4.90, 4.94, 5.04, 5.10, 5.20, 5.36, 5.80, 6.02, 6.16, 6.32, 6.46, 6.56],
      zh: ['可說是地球上', { t: 'chunk', s: '最複雜的硬體之一' }, '。'],
    },
    {
      start: 7.70, end: 9.68,
      en: ['I think these first two chapters are like,'],
      times: [7.78, 7.92, 8.04, 8.24, 8.46, 8.64, 9.06, 9.30],
      zh: ['我覺得前兩個篇章，就像是──'],
    },
    {
      start: 9.72, end: 11.80,
      en: ['I', { t: 'chunk', s: 'characterize' }, 'like', { t: 'term', s: 'deep engineering' }, 'projects.'],
      times: [9.76, 9.82, 10.04, 10.36, 10.52, 10.90],
      zh: ['我會把它們', { t: 'chunk', s: '定位成' }, { t: 'term', s: '深度工程' }, '專案。'],
    },
  ],
  cards: [
    {
      at: 1.30, type: 'chunk', label: '語塊 CHUNK',
      phrase: "let's call it what it is",
      zh: '說白了／直說吧',
      note: '要直白承認一個不太好聽的事實時，用來開場。',
      ex: { en: "Let's call it what it is — a failure.", zh: '說白了，這就是失敗。' },
    },
    {
      at: 3.90, type: 'term', label: '專有名詞 TERM',
      phrase: 'degrees of freedom', abbr: 'DoF',
      zh: '自由度',
      note: '機器人能獨立活動的關節方向數。數字越大越靈活，控制也越難。',
      stats: [{ k: '工業機械手臂', v: 6 }, { k: '人形機器人', v: 40 }],
    },
    {
      at: 5.30, type: 'chunk', label: '句型 PATTERN',
      phrase: 'one of the most + adj. + Ns',
      zh: '最…的之一（N 用複數）',
      note: '名詞要用複數：pieces 不是 piece。hardware 不可數，要用 a piece of hardware 來數。',
      ex: { en: 'one of the most complex pieces of hardware', zh: '最複雜的硬體之一' },
    },
    {
      at: 9.80, type: 'chunk', label: '語塊 CHUNK',
      phrase: 'characterize A as B',
      zh: '把 A 定位／形容成 B',
      note: '講者口語說成 characterize like，正式寫法要用 as。',
      extra: { label: 'TERM', phrase: 'deep engineering', zh: '深度工程｜需要長期投入、花錢也買不到捷徑的硬核工程' },
    },
  ],
};
