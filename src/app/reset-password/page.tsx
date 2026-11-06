import { AccountAccessPage } from "@/components/account-access-page";
export const dynamic = "force-dynamic";
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const search = await searchParams;
  const token =
    typeof search.token === "string" &&
    /^[a-zA-Z0-9_-]{20,200}$/.test(search.token) &&
    !search.error
      ? search.token
      : undefined;
  return <AccountAccessPage mode="reset" token={token} />;
}
