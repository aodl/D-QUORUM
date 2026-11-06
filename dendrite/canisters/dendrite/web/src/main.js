import { createApplication } from "./app.js";

createApplication({
  root: document.querySelector("#app"),
  location,
  onHashChange: addEventListener,
}).start();
