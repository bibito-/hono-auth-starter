import { Separator } from "@client/components/ui/separator";
import { Link } from "react-router";

export function OrLogin() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mx-auto px-0.5 w-full">
        <Separator className="flex-1" />
        <h4 className="shrink-0">すでにアカウントを持ってますか？</h4>
        <Separator className="flex-1" />
      </div>
      {/* <Button variant="a_hovar" asChild> */}
      <Link to="/login" className="text-primary mx-auto w-fit">ログインへ</Link>
      {/* </Button> */}
    </div>
  );
}
