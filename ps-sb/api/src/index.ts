import { createApp } from "./app.js";
import { assertConfig, config } from "./config.js";

assertConfig();

const app = createApp();

app.listen(config.port, () => {
  console.log(`LynQ Express API listening on http://localhost:${config.port}`);
});
