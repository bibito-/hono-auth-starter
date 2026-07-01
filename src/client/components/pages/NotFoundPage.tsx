import { Button } from "@client/components/ui/button";
import { Link } from "react-router";

const NotFoundPage = () => {
  return (
    <div
      className="bg-[oklch(0.955_0_0)] dark:bg-background"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <main
        style={{
          flex: 1,
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "48px 24px",
          flexDirection: "column",
        }}
      >
        <p
          className="text-[oklch(0.87_0_0)] dark:text-[oklch(0.24_0_0)]"
          style={{
            fontSize: "clamp(96px, 20vw, 160px)",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          404
        </p>
        <h1
          style={{
            marginTop: 24,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--foreground)",
          }}
        >
          ページが見つかりません
        </h1>
        <p
          style={{
            marginTop: 12,
            maxWidth: 420,
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--muted-foreground)",
          }}
        >
          お探しのページは移動または削除された可能性があります。URL をご確認のうえ、もう一度お試しください。
        </p>
        <Button
          asChild
          variant="default"
          style={{ height: 40, padding: "0 20px", fontSize: 14, fontWeight: 500, marginTop: 32 }}
        >
          <Link to="/">トップへ戻る</Link>
        </Button>
      </main>
    </div>
  );
};

export default NotFoundPage;
