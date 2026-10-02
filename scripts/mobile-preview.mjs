import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { isIPv4 } from "node:net";

const privateAddress = (address) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
const adapters = Object.entries(networkInterfaces()).sort(
  ([a], [b]) =>
    Number(/wi-?fi|wireless/i.test(b)) - Number(/wi-?fi|wireless/i.test(a)),
);
const addresses = adapters
  .filter(([name]) => !/virtual|vethernet|vpn|loopback|wsl/i.test(name))
  .flatMap(([, entries]) => entries ?? [])
  .filter(
    (entry) =>
      entry.family === "IPv4" &&
      !entry.internal &&
      privateAddress(entry.address),
  );
const host = process.env.MOBILE_HOST ?? addresses[0]?.address;
if (!host || !isIPv4(host) || !privateAddress(host)) {
  console.error(
    "Conecta la computadora al Wi-Fi. Si no se detecta, define MOBILE_HOST con su dirección IPv4 local.",
  );
  process.exit(1);
}
const url = `http://${host}:3001`;
console.log(
  `\nAbre en tu teléfono: ${url}\nAmbos dispositivos deben estar en el mismo Wi-Fi. Mantén esta terminal abierta.\n`,
);
if (!process.argv.includes("--check")) {
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      host,
      "--port",
      "3001",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development", BETTER_AUTH_URL: url },
    },
  );
  child.on("error", (error) => {
    console.error(`No se pudo iniciar la vista móvil: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}
