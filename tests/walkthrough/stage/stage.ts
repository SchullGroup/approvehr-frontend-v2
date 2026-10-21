import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";

/**
 * Brings up everything a walkthrough needs, and takes it down again.
 *
 * ```
 * WALK_OUT=<main checkout>/out/walkthrough/<slug> \
 * WALK_BACKEND_DIR=<backend checkout> \
 * WALK_PG_ADMIN_URL=postgresql://user:password@127.0.0.1:5432 \
 *   npx tsx tests/walkthrough/stage/stage.ts up [--fresh] [--rebuild]
 *   npx tsx tests/walkthrough/stage/stage.ts status
 *   npx tsx tests/walkthrough/stage/stage.ts down [--drop-db]
 * ```
 *
 * ## What it may do, and what it may not
 *
 * It creates and migrates an empty database, starts the API, the web server, a
 * mail sink and a stand-in for Atlassian, and prints every command it ran. It
 * writes **no application data**: no seed, no account, no row. The walkthrough
 * starts at the first screen a brand-new visitor sees, and anything that exists
 * after that was made by a person's hands in the recording.
 *
 * ## Safe by construction
 *
 * - The database name must be `wip_<something>_walkthrough`, and after creating it
 *   the stage asks Postgres which database it is connected to before it migrates.
 *   An unquoted `&` in an env file once sent a seed to the wrong database; the
 *   answer from Postgres, not the string in a variable, is what is believed.
 * - `--fresh` only drops a database with no other connection to it.
 * - It never sets `REDIS_URL`, so the API's worker polls the database and stays
 *   off any shared Redis.
 * - The API gets the mail provider's address and Atlassian's two hosts from the
 *   environment, pointed at the sinks, so nothing can leave the machine.
 * - Secrets (JWT keys, the work-tracker key, the stand-in's client id) are made
 *   fresh each time, kept in a file readable only by the owner, and never printed.
 * - Servers are stopped by the process group the stage started, never by a
 *   pattern match on a command line.
 *
 * Credentials for the admin connection come from `WALK_PG_ADMIN_URL`, which is
 * not written down anywhere in the repository.
 */

type State = {
  db: string;
  startedAt: string;
  pids: Record<string, number>;
  ports: { api: number; web: number; mail: number; atlassian: number };
  commands: string[];
};

const need = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`${name} is not set.`);
  return value;
};

const outRoot = path.resolve(need("WALK_OUT"));
const stageDir = path.join(outRoot, "_stage");
const statePath = path.join(stageDir, "state.json");

const DB = process.env["WALK_DB"] ?? "wip_be_walkthrough";
const PORTS = {
  api: Number(process.env["WALK_API_PORT"] ?? "8797"),
  web: Number(process.env["WALK_WEB_PORT"] ?? "3297"),
  mail: Number(process.env["WALK_MAIL_PORT"] ?? "8798"),
  atlassian: Number(process.env["WALK_ATLASSIAN_PORT"] ?? "8799"),
};
const WEB_ORIGIN = `http://localhost:${String(PORTS.web)}`;
const API_ORIGIN = `http://127.0.0.1:${String(PORTS.api)}`;
const DIST = ".next-walkthrough";

const commands: string[] = [];
const shown = (text: string): string =>
  text.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g, "$1***@");

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const line = `$ ${[command, ...args].map(shown).join(" ")}${options.cwd ? `   (in ${options.cwd})` : ""}`;
  commands.push(line);
  say(line);
  return execFileSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function assertDatabaseName(name: string): void {
  if (!/^wip_[a-z0-9]+(_[a-z0-9]+)*_walkthrough$/.test(name)) {
    throw new Error(
      `${name} is not a walkthrough database. The name has to be wip_<something>_walkthrough, so this can never be pointed at a real one.`,
    );
  }
}

const psql = (database: string, sql: string): string =>
  run("psql", [
    `${need("WALK_PG_ADMIN_URL").replace(/\/+$/, "")}/${database}`,
    "-v",
    "ON_ERROR_STOP=1",
    "-tA",
    "-c",
    sql,
  ]).trim();

function free(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

async function healthy(url: string, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function detach(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): number {
  mkdirSync(stageDir, { recursive: true });
  const log = openSync(path.join(stageDir, `${name}.log`), "a");
  commands.push(
    `$ ${[command, ...args].map(shown).join(" ")}   (in ${options.cwd}, detached, log ${name}.log)`,
  );
  say(commands[commands.length - 1] ?? "");
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  if (!child.pid) throw new Error(`${name} did not start`);
  return child.pid;
}

const secret = (bytes = 24): string => randomBytes(bytes).toString("hex");

async function up(flags: Set<string>): Promise<void> {
  assertDatabaseName(DB);
  const backend = path.resolve(need("WALK_BACKEND_DIR"));
  const frontend = process.cwd();
  if (existsSync(statePath)) {
    throw new Error("A stage is already recorded. Run `down` first.");
  }
  for (const [name, port] of Object.entries(PORTS)) {
    if (!(await free(port)))
      throw new Error(`Port ${String(port)} (${name}) is not free.`);
  }

  /* 1. The database: empty, migrated, never seeded. */
  const exists =
    psql(
      "postgres",
      `select count(*) from pg_database where datname = '${DB}'`,
    ) === "1";
  if (exists) {
    if (!flags.has("--fresh")) {
      throw new Error(
        `${DB} already exists. Use --fresh to drop and recreate it (only allowed with no other connection).`,
      );
    }
    const connections = Number(
      psql(
        "postgres",
        `select count(*) from pg_stat_activity where datname = '${DB}'`,
      ),
    );
    if (connections > 0)
      throw new Error(
        `${DB} has ${String(connections)} connection(s); not dropping it.`,
      );
    psql("postgres", `drop database ${DB}`);
  }
  psql("postgres", `create database ${DB}`);
  const confirmed = psql(DB, "select current_database()");
  if (confirmed !== DB)
    throw new Error(
      `Connected to ${confirmed}, expected ${DB}. Stopping before any write.`,
    );
  say(`database: Postgres says it is ${confirmed}`);

  const databaseUrl = `${need("WALK_PG_ADMIN_URL").replace(/\/+$/, "")}/${DB}`;
  run("npx", ["prisma", "migrate", "deploy"], {
    cwd: backend,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  /* 2. The sinks. */
  const pids: Record<string, number> = {};
  const here = __dirname;
  const sinkEnv = { ...process.env };
  pids["mail"] = detach(
    "mail-sink",
    "npx",
    ["tsx", path.join(here, "mail-sink.ts"), String(PORTS.mail)],
    { cwd: frontend, env: sinkEnv },
  );
  pids["atlassian"] = detach(
    "atlassian",
    "npx",
    ["tsx", path.join(here, "atlassian-standin.ts"), String(PORTS.atlassian)],
    { cwd: frontend, env: sinkEnv },
  );
  if (!(await healthy(`http://127.0.0.1:${String(PORTS.mail)}/health`, 20)))
    throw new Error("The mail sink did not come up.");
  if (
    !(await healthy(`http://127.0.0.1:${String(PORTS.atlassian)}/health`, 20))
  )
    throw new Error("The Atlassian stand-in did not come up.");

  /* 3. The API, with every external pointed at a sink and no Redis. */
  const apiEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    LOG_LEVEL: "warn",
    PORT: String(PORTS.api),
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: WEB_ORIGIN,
    APP_WEB_URL: WEB_ORIGIN,
    CAREERS_PUBLIC_URL: WEB_ORIGIN,
    API_PUBLIC_URL: `http://localhost:${String(PORTS.api)}`,
    JWT_ACCESS_SECRET: secret(32),
    JWT_REFRESH_SECRET: secret(32),
    ACCESS_TOKEN_TTL: "12h",
    REFRESH_TOKEN_TTL: "30d",
    RATE_LIMIT_MAX: "20000",
    RATE_LIMIT_WINDOW_MINUTES: "15",
    MAIL_FROM: "Fictional Works <hr@walkthrough.example>",
    RESEND_API_KEY: `re_${secret(12)}`,
    RESEND_API_BASE_URL: `http://127.0.0.1:${String(PORTS.mail)}`,
    JIRA_CLIENT_ID: secret(8),
    JIRA_CLIENT_SECRET: secret(16),
    JIRA_AUTH_BASE_URL: `http://127.0.0.1:${String(PORTS.atlassian)}`,
    JIRA_API_BASE_URL: `http://127.0.0.1:${String(PORTS.atlassian)}`,
    WORK_TRACKER_SECRET: secret(32),
  };
  delete apiEnv["REDIS_URL"];
  delete apiEnv["MAIL_SES_ENDPOINT_URL"];
  pids["api"] = detach(
    "api",
    "npx",
    ["tsx", "--env-file-if-exists=.env", "src/server.ts"],
    { cwd: backend, env: apiEnv },
  );
  if (!(await healthy(`${API_ORIGIN}/health`, 60)))
    throw new Error("The API did not come up; see _stage/api.log.");

  /* 4. The web app: a production build in its own folder. */
  const webEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_DIST_DIR: DIST,
    NEXT_PUBLIC_API_URL: `${API_ORIGIN}/api/v1`,
  };
  if (
    flags.has("--rebuild") ||
    !existsSync(path.join(frontend, DIST, "BUILD_ID"))
  ) {
    run("npx", ["next", "build"], { cwd: frontend, env: webEnv });
  }
  pids["web"] = detach(
    "web",
    "npx",
    ["next", "start", "-p", String(PORTS.web)],
    { cwd: frontend, env: webEnv },
  );
  if (!(await healthy(WEB_ORIGIN, 60)))
    throw new Error("The web server did not come up; see _stage/web.log.");

  const state: State = {
    db: DB,
    startedAt: new Date().toISOString(),
    pids,
    ports: PORTS,
    commands,
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  say("");
  say("Up. The walkthrough needs:");
  say(`  WALK_OUT=${outRoot}`);
  say(`  WALK_WEB_URL=${WEB_ORIGIN}   WALK_API_URL=${API_ORIGIN}`);
  say(
    `  WALK_MAIL_URL=http://127.0.0.1:${String(PORTS.mail)}   WALK_ATLASSIAN_URL=http://127.0.0.1:${String(PORTS.atlassian)}`,
  );
}

function read(): State | null {
  return existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, "utf8")) as State)
    : null;
}

async function status(): Promise<void> {
  const state = read();
  if (!state) {
    say("No stage recorded.");
    return;
  }
  say(`database ${state.db}, started ${state.startedAt}`);
  const checks: [string, string][] = [
    ["api", `${API_ORIGIN}/health`],
    ["web", WEB_ORIGIN],
    ["mail", `http://127.0.0.1:${String(PORTS.mail)}/health`],
    ["atlassian", `http://127.0.0.1:${String(PORTS.atlassian)}/health`],
  ];
  for (const [name, url] of checks) {
    say(
      `  ${name.padEnd(10)} ${(await healthy(url, 1)) ? "up" : "DOWN"}   pid ${String(state.pids[name] ?? "?")}`,
    );
  }
}

async function down(flags: Set<string>): Promise<void> {
  const state = read();
  if (!state) {
    say("No stage recorded; nothing to stop.");
  } else {
    for (const [name, pid] of Object.entries(state.pids)) {
      try {
        /* A negative pid is the process group the stage started, which takes the
           wrapper and the server behind it, and nothing else. */
        process.kill(-pid, "SIGTERM");
        say(`stopped ${name} (process group ${String(pid)})`);
      } catch {
        say(`${name} was not running`);
      }
    }
    rmSync(statePath);
  }
  if (flags.has("--drop-db")) {
    assertDatabaseName(DB);
    const connections = Number(
      psql(
        "postgres",
        `select count(*) from pg_stat_activity where datname = '${DB}'`,
      ),
    );
    if (connections > 0)
      throw new Error(
        `${DB} still has ${String(connections)} connection(s); not dropping it.`,
      );
    psql("postgres", `drop database ${DB}`);
  }
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest);
const done = (error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
};

if (command === "up") void up(flags).catch(done);
else if (command === "status") void status().catch(done);
else if (command === "down") void down(flags).catch(done);
else
  done(
    new Error(
      "Usage: stage.ts up [--fresh] [--rebuild] | status | down [--drop-db]",
    ),
  );
