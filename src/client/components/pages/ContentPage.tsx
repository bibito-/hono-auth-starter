import { AuthContext } from "@client/contexts/AuthContext";
import { ContentRepositoryContext } from "@client/contexts/ContentRepositoryContext";
import { use } from "react";

/**
 * ログイン後のプレースホルダーページ。
 * このテンプレートには具体的なコンテンツがまだ無いため、
 * 認証済みユーザー向けの最小限の「ようこそ」表示のみ行う。
 *
 * `ContentRepositoryContext` からコンテンツリポジトリを取得する配線例を兼ねる。
 * `ContentRepository` は現状空の型のため、取得した値自体は未使用。
 * 実際のコンテンツ機能を実装する際は、ここで取得した repository を使って
 * データ取得・表示ロジックを組み立てる。
 */
const ContentPage = () => {
  const { authUser } = use(AuthContext);
  use(ContentRepositoryContext);
  const displayName = authUser?.username ?? authUser?.name ?? "ゲスト";

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-2">ようこそ、{displayName}さん</h1>
      <p className="text-muted-foreground">ここにアプリのコンテンツを実装してください。</p>
    </main>
  );
};

export default ContentPage;
