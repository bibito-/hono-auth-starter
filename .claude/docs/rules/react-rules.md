# React ルール

## use() を useContext() の代わりに使う

React 19.2.0 以降のため `useContext()` ではなく `use()` を使う。Context だけでなく Promise の解決にも `use()` が推奨されている。

参照: https://ja.react.dev/reference/react/use
