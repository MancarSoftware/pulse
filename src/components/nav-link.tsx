"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";
const icons: Record<string, IconName> = {
  "/dashboard": "dashboard",
  "/members": "members",
  "/check-in": "access",
  "/pos": "pos",
  "/inventory": "inventory",
  "/expenses": "expenses",
  "/reports": "reports",
  "/settings": "settings",
};
export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      aria-current={
        pathname === href || pathname.startsWith(`${href}/`)
          ? "page"
          : undefined
      }
    >
      <Icon name={icons[href] ?? "arrow"} />
      <span>{children}</span>
    </Link>
  );
}
