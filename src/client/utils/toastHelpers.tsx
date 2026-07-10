import { toast } from "sonner";

export const showErrorToast = (title: string, description?: string) => {
  toast(title, {
    description: <pre className="mt-2 max-w-[320px] overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-md bg-code p-4 text-code-foreground">
          <code>{description}</code>
        </pre>,
  });
};

export const showSuccessToast = (title: string, description?: string) => {
  toast.success(title, { description });
};

export const showConflictToast = () => {
  toast.warning("データが更新されています", {
    description: "他の端末またはタブで変更がありました。最新の状態を読み込みました。",
  });
};

export const showRealtimeErrorToast = () => {
  toast.error("リアルタイム同期に接続できませんでした", {
    description: "他のウィンドウでの変更が自動反映されません。ページを再読み込みしてください。",
  });
};

export function formatRetryAfter(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  if (h === 0) return `約${m}分`;
  if (m === 0) return `約${h}時間`;
  return `約${h}時間${m}分`;
}

/**
 * AI タグ付けのレート制限（429）を scope で出し分ける。
 * account-scope は duration: Infinity の永続 Toast（id: "rate-limit-account"）。
 * 次回 analyze 成功（202）時に呼び出し元が toast.dismiss("rate-limit-account") で消す。
 * user-scope（60秒）は短命・自己解消のため自動消滅 Toast のまま。
 */
export const showRateLimitToast = (
  scope: "user" | "account",
  retryAfter: number,
) => {
  if (scope === "account") {
    toast.warning("本日の AI タグ付け上限に達しました", {
      id: "rate-limit-account",
      duration: Infinity,
      description: `あと${formatRetryAfter(retryAfter)}でリセットされます（00:00 UTC）`,
    });
    return;
  }
  toast.warning("タグ付けの回数制限に達しました", {
    description: `少し待って再度お試しください（約${retryAfter}秒後）。`,
  });
};
