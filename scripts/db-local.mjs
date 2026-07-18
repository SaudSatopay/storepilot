// Supervised local PGlite Postgres server. pglite-server is experimental and
// can crash under connection churn; this wrapper restarts it automatically so
// a dev session or demo never loses its database. If a server is already
// listening on the port it reuses that one instead of fighting over it.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import process from "node:process";

const PORT = Number(process.env.PGLITE_PORT ?? "5433");
const DATA_DIR = "./.data/storepilot-pglite";
const MAX_RESTARTS = 20;
const RESTART_DELAY_MS = 700;

mkdirSync(".data", { recursive: true });

let restarts = 0;
let stopping = false;
let child = null;

for (const signalName of ["SIGINT", "SIGTERM"]) {
  process.on(signalName, () => {
    stopping = true;

    if (child) {
      child.kill();
    }

    process.exit(0);
  });
}

function portInUse() {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: PORT, timeout: 900 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function binPath() {
  const bin = process.platform === "win32" ? "pglite-server.CMD" : "pglite-server";
  return path.join("node_modules", ".bin", bin);
}

function start() {
  child = spawn(
    binPath(),
    [
      `--db=${DATA_DIR}`,
      `--port=${PORT}`,
      "--host=127.0.0.1",
      "--max-connections=25",
    ],
    { stdio: "inherit", shell: process.platform === "win32" },
  );

  child.on("exit", async (code, signal) => {
    if (stopping) {
      return;
    }

    if (await portInUse()) {
      console.log(
        `[db-local] Port ${PORT} is served by another process now. Handing over and exiting.`,
      );
      process.exit(0);
    }

    restarts += 1;

    if (restarts > MAX_RESTARTS) {
      console.error(
        `[db-local] pglite-server exited (code ${code}, signal ${signal}) and hit the restart limit. Giving up.`,
      );
      process.exit(1);
    }

    console.error(
      `[db-local] pglite-server exited (code ${code}, signal ${signal}). Restart ${restarts}/${MAX_RESTARTS} in ${RESTART_DELAY_MS}ms.`,
    );
    setTimeout(start, RESTART_DELAY_MS);
  });
}

const alreadyRunning = await portInUse();

if (alreadyRunning) {
  console.log(
    `[db-local] A database server is already listening on 127.0.0.1:${PORT}. Reusing it; nothing to start.`,
  );
  process.exit(0);
}

console.log(`[db-local] Starting supervised PGlite Postgres on 127.0.0.1:${PORT}`);
start();
