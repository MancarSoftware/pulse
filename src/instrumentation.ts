export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { readEnvironment } = await import("./infrastructure/env");
    readEnvironment();
    if (process.env.SENTRY_DSN) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        beforeSend(event) {
          delete event.user;
          delete event.request;
          delete event.breadcrumbs;
          delete event.extra;
          return event;
        },
      });
    }
  }
}
