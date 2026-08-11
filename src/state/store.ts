import type { MonitorState } from "../types.js";
import { atomicWriteJson, readJsonFile } from "./json-store.js";

export function emptyState(): MonitorState {
  return { schemaVersion: 1, windows: {} };
}

export async function loadState(path: string): Promise<MonitorState> {
  const value = await readJsonFile<unknown>(path);
  if (value === undefined) return emptyState();
  if (typeof value !== "object" || value === null) throw new Error("State file is not an object");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || typeof raw.windows !== "object" || raw.windows === null) {
    throw new Error("State file has an unsupported or invalid schema");
  }
  return raw as unknown as MonitorState;
}

export async function saveState(path: string, state: MonitorState): Promise<void> {
  await atomicWriteJson(path, state);
}
