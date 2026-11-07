/** 離開遊戲畫面之前，等已排隊的存檔寫完，避免開始頁讀到舊清單。 */
let chain: Promise<void> = Promise.resolve();

export function trackSaves(pending: Promise<void>): void {
  chain = chain.then(() =>
    pending.then(
      () => undefined,
      () => undefined,
    ),
  );
}

export function whenSavesSettled(): Promise<void> {
  return chain;
}
