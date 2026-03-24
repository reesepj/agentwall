#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { defaultConfig, OnboardingMode, writeStarterFiles } from "./onboarding";

type CliFlags = Record<string, string | boolean>;

function printHelp() {
  console.log(`Agentwall CLI

Usage:
  agentwall <command> [options]

Commands:
  init        Create agentwall.config.yaml and policy.yaml
  start       Start Agentwall server from current directory config
  dev         Start in ts-node dev mode
  doctor      Validate local install and starter files
  version     Print version
  help        Show this message

Init options:
  --mode <monitor|guarded|strict>   Operating mode (default: guarded)
  --host <host>                     Bind host (default: 127.0.0.1)
  --port <port>                     Bind port (default: 3000)
  --allow-hosts <a,b,c>             Comma-separated egress allowlist
  --lan                             Bind to 0.0.0.0
  --force                           Overwrite existing config/policy files
`);
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

function getPackageVersion(): string {
  const packageJsonPath = path.resolve(__dirname, "..", "package.json");
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function runNodeScript(args: string[]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function commandInit(flags: CliFlags) {
  const modeInput = String(flags.mode || "guarded").toLowerCase();
  const mode: OnboardingMode = modeInput === "monitor" || modeInput === "strict" ? modeInput : "guarded";

  const host = String(flags.host || defaultConfig.host);
  const port = Number(flags.port || defaultConfig.port);
  const allowedHosts = String(flags["allow-hosts"] || "api.openai.com")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const lanAccess = Boolean(flags.lan);
  const force = Boolean(flags.force);

  const configPath = path.resolve(process.cwd(), "agentwall.config.yaml");
  const policyPath = path.resolve(process.cwd(), "policy.yaml");

  if (!force && (fs.existsSync(configPath) || fs.existsSync(policyPath))) {
    console.error("Refusing to overwrite existing agentwall.config.yaml or policy.yaml. Re-run with --force.");
    process.exit(1);
  }

  const { config } = writeStarterFiles(process.cwd(), {
    mode,
    host,
    port: Number.isFinite(port) ? port : defaultConfig.port,
    allowedHosts,
    lanAccess,
  });

  console.log("Created Agentwall starter files:");
  console.log(`- ${configPath}`);
  console.log(`- ${policyPath}`);
  console.log(`\nRun: agentwall start  (dashboard: http://${config.host}:${config.port})`);
}

function commandDoctor() {
  const checks = [
    {
      name: "Node version >= 20",
      ok: Number(process.versions.node.split(".")[0]) >= 20,
      detail: process.versions.node,
    },
    {
      name: "dist/index.js exists",
      ok: fs.existsSync(path.resolve(process.cwd(), "dist/index.js")),
      detail: "npm run build",
    },
    {
      name: "agentwall.config.yaml exists",
      ok: fs.existsSync(path.resolve(process.cwd(), "agentwall.config.yaml")),
      detail: "agentwall init",
    },
    {
      name: "policy.yaml exists",
      ok: fs.existsSync(path.resolve(process.cwd(), "policy.yaml")),
      detail: "agentwall init",
    },
  ];

  let failures = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`✅ ${check.name}`);
    } else {
      failures += 1;
      console.log(`❌ ${check.name} (hint: ${check.detail})`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

function main() {
  const [, , command = "help", ...args] = process.argv;
  const flags = parseFlags(args);

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "version":
    case "--version":
    case "-v":
      console.log(getPackageVersion());
      return;
    case "init":
      commandInit(flags);
      return;
    case "start":
      runNodeScript([path.resolve(process.cwd(), "dist/index.js")]);
      return;
    case "dev":
      runNodeScript([path.resolve(process.cwd(), "node_modules/ts-node/dist/bin.js"), "src/index.ts"]);
      return;
    case "doctor":
      commandDoctor();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main();
