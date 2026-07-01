import { createContext } from "react";

// コンテンツ機能追加時に、ここを実際の Repository interface 型に差し替える。
export type ContentRepository = Record<string, never>;

export const ContentRepositoryContext = createContext<ContentRepository>({});
