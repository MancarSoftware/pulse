import { AccountAccessPage } from "@/components/account-access-page";
export const dynamic = "force-dynamic";
export default function VerifyEmailPage() {
  return <AccountAccessPage mode="verify" />;
}
