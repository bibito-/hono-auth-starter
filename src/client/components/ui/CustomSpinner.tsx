export default function Spinner() {
  return (
    // h-[calc(100vh-7rem)]: HeaderはApp.tsxで常にレンダリングされ sticky で上部を占有する。
    // Headerの高さは p-4(上下1rem×2) + h-20(5rem) = 7rem。
    // min-h-screen のままだとページ全体が 7rem + 100vh になりスクロールが発生するため、
    // Header分を引いた高さにすることでスピナーをヘッダー下の表示領域中央に配置する。
    <main className="bg-background h-[calc(100vh-7rem)] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-muted border-t-foreground rounded-full animate-spin" />
    </main>
  );
}
