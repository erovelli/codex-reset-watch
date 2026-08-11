import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { AccountStatus, UsageSnapshot, UsageSource } from "../types.js";
import { parseAccountResponse, parseRateLimitsResponse } from "./parser.js";

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

class AppServerConnection {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private nextId = 1;
  private stderr = "";

  constructor(codexPath: string, prefixArgs: string[] = [], private readonly timeoutMs = 20_000) {
    this.process = spawn(codexPath, [...prefixArgs, "app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    createInterface({ input: this.process.stdout }).on("line", (line) => this.onLine(line));
    this.process.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-4000);
    });
    this.process.on("error", (error) => this.rejectAll(error));
    this.process.on("exit", (code, signal) => {
      if (this.pending.size > 0) {
        this.rejectAll(new Error(`Codex App Server exited (${code ?? signal ?? "unknown"}): ${this.stderr.trim()}`));
      }
    });
  }

  private onLine(line: string): void {
    let response: RpcResponse;
    try {
      response = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }
    if (typeof response.id !== "number") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.error) pending.reject(new Error(`Codex App Server error: ${response.error.message ?? response.error.code ?? "unknown"}`));
    else pending.resolve(response.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private send(message: unknown): void {
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ method, id, ...(params === undefined ? {} : { params }) });
    });
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        result,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`Timed out waiting for Codex App Server method ${method}`));
          }, this.timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  notify(method: string, params: unknown = {}): void {
    this.send({ method, params });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "codex_reset_watch", title: "Codex Reset Watch", version: "0.1.0" }
    });
    this.notify("initialized");
  }

  async close(): Promise<void> {
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;
    this.process.stdin.end();
    this.process.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => this.process.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 1000))
    ]);
    if (this.process.exitCode === null && this.process.signalCode === null) this.process.kill("SIGKILL");
  }
}

export class CodexAppServerSource implements UsageSource {
  constructor(private readonly codexPath: string, private readonly prefixArgs: string[] = []) {}

  private async withConnection<T>(callback: (connection: AppServerConnection) => Promise<T>): Promise<T> {
    const connection = new AppServerConnection(this.codexPath, this.prefixArgs);
    try {
      await connection.initialize();
      return await callback(connection);
    } finally {
      await connection.close();
    }
  }

  async readAccount(): Promise<AccountStatus> {
    return this.withConnection(async (connection) => {
      const response = await connection.request("account/read", { refreshToken: false });
      const account = parseAccountResponse(response);
      if (!account.accountType) return { authenticated: false, reason: "Codex is not signed in" };
      if (account.accountType !== "chatgpt") {
        return {
          authenticated: false,
          accountType: account.accountType,
          ...(account.planType === undefined ? {} : { planType: account.planType }),
          reason: "Codex Reset Watch requires a ChatGPT-managed Codex account, not API-key billing"
        };
      }
      return { authenticated: true, accountType: account.accountType, ...(account.planType === undefined ? {} : { planType: account.planType }) };
    });
  }

  async read(): Promise<UsageSnapshot> {
    return this.withConnection(async (connection) => {
      const rawAccount = await connection.request("account/read", { refreshToken: false });
      const account = parseAccountResponse(rawAccount);
      if (account.accountType !== "chatgpt") {
        throw new Error("Codex is not authenticated with a ChatGPT-managed account. Run `codex login`.");
      }
      const rawLimits = await connection.request("account/rateLimits/read");
      return {
        observedAt: Math.floor(Date.now() / 1000),
        accountType: account.accountType,
        windows: parseRateLimitsResponse(rawLimits)
      };
    });
  }
}
