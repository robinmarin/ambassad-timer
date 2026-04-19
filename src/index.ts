import { loadConfig } from "./config.js";
import { startScheduler } from "./scheduler.js";

const config = loadConfig();
console.log("ambassad-timer starting up...");
console.log(`Targeting unit: ${config.booking.unitCode} (Swedish Embassy London)`);
console.log(`Sniper window: Wednesday ${config.polling.sniperWindowStartHour}:00–${config.polling.sniperWindowEndHour}:00`);

startScheduler(config);
