import { networkInterfaces } from "node:os";
import { createApp } from "./app.js";
import { assertConfig, config } from "./config.js";
import { processQueueNotifications } from "./services/queueNotifications.js";
import { startScheduledAdminBackups } from "./services/adminBackup.js";

assertConfig();

const app = createApp();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Lyn & Co Salon and Spa Express API listening on port ${config.port}`);
  startScheduledAdminBackups();
  const runQueueNotifications = () => {
    void processQueueNotifications().catch((error: unknown) => {
      console.error("Queue notification processing failed:", error);
    });
  };
  runQueueNotifications();
  setInterval(runQueueNotifications, 15_000);
  const lanAddresses = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => !address.internal && address.family === "IPv4")
    .map((address) => address.address);
  if (lanAddresses.length === 0) {
    console.log("No LAN IPv4 address found. Connect this computer to Wi-Fi or Ethernet for phone/tablet access.");
    return;
  }
  console.log("Phone/tablet addresses (open the web app URL on a device on the same Wi-Fi):");
  for (const address of lanAddresses) {
    console.log(`  Web app: http://${address}:5173/`);
    console.log(`  API check: http://${address}:${config.port}/api/health`);
  }
});
