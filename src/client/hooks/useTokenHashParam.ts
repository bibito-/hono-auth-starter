import { useRef } from "react";

/**
 * URL クエリの `token_hash` を読み取り、直後に `history.replaceState` でクエリを URL から
 * 除去して React state（ref）に保持する。リファラ・履歴・ブックマーク経由の露出面を
 * 減らすため（auth-email-flows spec）。
 *
 * マウント時の最初のレンダーで 1 度だけ読み取る。ref の初期化ガード（`current === undefined`）
 * により React Strict Mode の二重レンダーでも URL 読み取り・削除は 1 回しか行われない
 * （2 回目のレンダー時には ref がすでに確定しているため）。
 */
export function useTokenHashParam(): string | null {
  const tokenHashRef = useRef<string | null | undefined>(undefined);

  if (tokenHashRef.current === undefined) {
    if (typeof window === "undefined") {
      tokenHashRef.current = null;
    } else {
      const params = new URLSearchParams(window.location.search);
      const value = params.get("token_hash");
      tokenHashRef.current = value;
      if (value) {
        const url = new URL(window.location.href);
        url.searchParams.delete("token_hash");
        url.searchParams.delete("type");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }

  return tokenHashRef.current;
}
