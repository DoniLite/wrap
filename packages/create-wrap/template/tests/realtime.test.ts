import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import {
  createTestDatabase,
  type TestDatabase,
} from "@donilite/wrap/testing";
import { createRealtime, type Realtime } from "@donilite/wrap/realtime";
import * as schemas from "@/db";
import { ExampleRepository } from "@/features/example/repository/example.repository";
import { CreateExampleDTO } from "@/features/example/DTO/example.dto";

let testDb: TestDatabase;
let realtime: Realtime;
let server: ReturnType<typeof Bun.serve>;
let unbind: () => void;

beforeAll(async () => {
  testDb = await createTestDatabase({ schema: schemas });

  const app = new Hono();
  realtime = createRealtime(); // single instance: no Redis needed
  app.get("/realtime", realtime.upgrade);
  unbind = realtime.bindEntityEvents();

  server = Bun.serve({
    port: 0, // random free port
    fetch: app.fetch,
    websocket: realtime.websocket,
  });
  realtime.attach(server);
});

afterAll(async () => {
  unbind();
  await realtime.close();
  server.stop(true);
  await testDb.destroy();
});

async function until(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for websocket message");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("realtime (native Bun WebSocket topics)", () => {
  it("delivers entity events to channel subscribers", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [];
    const ws = new WebSocket(`ws://localhost:${server.port}/realtime`);
    ws.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
    await new Promise((resolve) => (ws.onopen = resolve));

    ws.send(
      JSON.stringify({ action: "subscribe", channel: "entity:examples" }),
    );
    await until(() => messages.some((m) => m.type === "subscribed"));

    const repository = new ExampleRepository();
    await repository.create(CreateExampleDTO.from({ name: "Realtime" }));

    await until(() => messages.some((m) => m.type === "message"));
    const message = messages.find((m) => m.type === "message");

    expect(message.channel).toBe("entity:examples");
    expect(message.data.type).toBe("created");
    expect(message.data.data.name).toBe("Realtime");

    ws.close();
  });

  it("rejects unknown actions", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [];
    const ws = new WebSocket(`ws://localhost:${server.port}/realtime`);
    ws.onmessage = (event) => messages.push(JSON.parse(String(event.data)));
    await new Promise((resolve) => (ws.onopen = resolve));

    ws.send(JSON.stringify({ action: "nope" }));
    await until(() => messages.some((m) => m.type === "error"));

    expect(messages[0]?.error).toBe("unknown action");
    ws.close();
  });
});
