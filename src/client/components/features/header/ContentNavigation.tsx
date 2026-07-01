import type { UserRole } from "@client/entities/UserRole";
import { Link } from "react-router";

type ContentNavigationProps = {
  role: UserRole | null;
};

export default function ContentNavigation({ role }: ContentNavigationProps) {
  const showUserManagement = role === "admin" || role === "manager";

  if (!showUserManagement) return null;

  return (
    <ul className="flex items-center gap-3">
      <li>
        <Link to="/users">
          <ContentTitle value="ユーザー管理" />
        </Link>
      </li>
    </ul>
  );
}

type ContentTitleProps = {
  value: string;
};

function ContentTitle({ value }: ContentTitleProps) {
  return (
    <div className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
      <span>{value}</span>
    </div>
  );
}
