import { Button } from "@client/components/ui/button";
import { AuthContext } from "@client/contexts/AuthContext";
import type { AuthUser } from "@client/entities/AuthUser";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { use } from "react";
import ContentNavigation from "../features/header/ContentNavigation";
import { Link } from "react-router";

const Header = () => {
  const { authUser, logoutMutation } = use(AuthContext);
  const displayName = authUser ? (authUser.username ?? authUser.name ?? "名称未設定") : "ゲスト";
  const homeHref = authUser ? "/" : "/login";

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-[1280px] mx-auto flex justify-between items-center px-6 h-16">
        <nav className="flex items-center justify-between w-full gap-3">
          <Link to={homeHref} className="flex items-center gap-2">
            <span className="flex items-center justify-center size-[26px] rounded-md bg-primary text-primary-foreground text-sm font-semibold">
              T
            </span>
            <h1 className="text-base font-semibold">hono-auth-starter</h1>
          </Link>
          <div className="flex flex-1 justify-start items-center px-6">
            <ContentNavigation role={authUser?.role ?? null} />
          </div>
          <UserProfile displayName={displayName} logout={async () => logoutMutation.mutate()} user={authUser} />
        </nav>
      </div>
    </header>
  );
};

export default Header;

interface AuthUserProps {
  displayName: string;
  logout: () => Promise<void>;
}

function AuthenticatedUser({ displayName, logout }: AuthUserProps) {
  return (
    <div className="flex items-center gap-1.5">
      {displayName ? (
        <p className="text-sm text-muted-foreground">{displayName}さん</p>
      ) : (
        <p className="text-sm text-muted-foreground">名称未設定</p>
      )}
      <Button type="button" variant="header-ghost" className="px-3.5" onClick={logout}>
        ログアウト
      </Button>
    </div>
  );
}

interface UserProfileProps {
  displayName: string ;
  logout: () => Promise<void>;
  user: AuthUser | null;
}

function UserProfile({ displayName, logout, user }: UserProfileProps) {
  return (
    <ul className="flex items-center gap-2">
      <li>
        <ThemeToggle />
      </li>
      {user ? (
        <li>
          <AuthenticatedUser displayName={displayName} logout={logout} />
        </li>
      ) : (
        <li>
          <Button variant="header-ghost" className="px-3.5" asChild>
            <Link to="/login">ログイン</Link>
          </Button>
        </li>
      )}
    </ul>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="header-ghost"
      size="icon"
      aria-label={isDark ? "ライトテーマに切り替え" : "ダークテーマに切り替え"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
