import { PRODUCT_NAME } from "@/shared/brand";
export function Brand() {
  return (
    <>
      <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
        <rect width="36" height="36" rx="9" fill="#d4f478" />
        <path
          d="M25 12a10 10 0 1 0 1 11v-5h-8"
          fill="none"
          stroke="#142a31"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {PRODUCT_NAME}
    </>
  );
}
