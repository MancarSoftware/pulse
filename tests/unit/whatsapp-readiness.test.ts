import { expect, it } from "vitest";
import { whatsappSetupChecklist } from "@/modules/notifications/whatsapp-platform";
it("explains missing setup without exposing credentials or claiming provider approval", () => {
  const missing = whatsappSetupChecklist({ NODE_ENV: "test" });
  expect(missing).toHaveLength(4);
  expect(missing.every((item) => !item.ready)).toBe(true);
  const ready = whatsappSetupChecklist({
    NODE_ENV: "test",
    BETTER_AUTH_URL: "https://gym.example.test",
    WHATSAPP_META_APP_ID: "123",
    WHATSAPP_META_CONFIG_ID: "456",
    WHATSAPP_META_APP_SECRET: "private-meta-key",
    WHATSAPP_GRAPH_VERSION: "v24.0",
    WHATSAPP_ENCRYPTION_KEY: "a".repeat(64),
    WHATSAPP_WELCOME_TEMPLATE: "welcome",
    WHATSAPP_RENEWAL_TEMPLATE: "renewal",
  });
  expect(ready.every((item) => item.ready)).toBe(true);
  expect(JSON.stringify(ready)).not.toContain("private-meta-key");
  expect(JSON.stringify(ready)).not.toContain("aprobada");
});
