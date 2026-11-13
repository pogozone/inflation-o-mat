/** Startet Flask mit der virtuellen Umgebung unter Linux, macOS oder Windows. */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const candidates = [".venv/bin/python", ".venv/Scripts/python.exe"];
const executable = candidates.find(existsSync);
if (!executable) {
  console.error("Bitte zuerst .venv anlegen und backend/requirements.txt installieren. Siehe README.md.");
  process.exit(1);
}
const environment = { ...process.env };
const argumentsList = process.argv.slice(2);
for (let index = 0; index < argumentsList.length; index += 1) {
  if (argumentsList[index] === "--host") environment.FLASK_HOST = argumentsList[index + 1];
  if (argumentsList[index] === "--port") environment.PORT = argumentsList[index + 1];
}
const child = spawn(path.resolve(executable), ["backend/dev_server.py"], {
  stdio: "inherit",
  env: environment,
});
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
