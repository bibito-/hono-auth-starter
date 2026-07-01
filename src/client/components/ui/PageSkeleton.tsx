export default function PageSkeleton() {
  return (
    <main className="bg-background min-h-screen flex flex-col items-center">
      <div className="w-full max-w-xl px-8 pt-8 space-y-3 animate-pulse">
        {/* 入力エリア */}
        <div className="h-10 bg-muted rounded-md" />
        {/* タスク行 */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-muted rounded-md" />
        ))}
      </div>
    </main>
  );
}
