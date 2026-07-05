import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createTestDatabase,
  requestJson,
  type TestDatabase,
} from "@donilite/wrap/testing";
import * as schemas from "@/db";
import { ExampleController } from "@/features/example/web/example.controller";
import { ExampleItemTable } from "@/features/example/entity/example.entity";

let testDb: TestDatabase;
let app: ReturnType<ExampleController["getApp"]>;

beforeAll(async () => {
  testDb = await createTestDatabase({ schema: schemas });
  app = new ExampleController().getApp();
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

describe("ExampleController", () => {
  it("POST / creates and returns 201", async () => {
    const res = await requestJson(app, "POST", "/", { name: "Via HTTP" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Via HTTP");
    expect(res.body.deletedAt).toBeUndefined(); // excluded from the public DTO
  });

  it("POST / returns 400 with the standard error shape on invalid body", async () => {
    const res = await requestJson(app, "POST", "/", { description: "no name" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details.errors[0].property).toBe("name");
  });

  it("GET /?populateChildren=true returns populated relations", async () => {
    const created = await requestJson(app, "POST", "/", { name: "Parent" });
    await testDb.db
      .insert(ExampleItemTable)
      .values({ label: "child", exampleId: created.body.id });

    const res = await requestJson(app, "GET", "/?populateChildren=true");

    expect(res.status).toBe(200);
    expect(res.body.items[0].items).toHaveLength(1);
    expect(res.body.items[0].items[0].label).toBe("child");
  });

  it("DELETE /:id then GET /:id returns 400", async () => {
    const created = await requestJson(app, "POST", "/", { name: "Temp" });

    const del = await requestJson(app, "DELETE", `/${created.body.id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const get = await requestJson(app, "GET", `/${created.body.id}`);
    expect(get.status).toBe(400);
    expect(get.body.message).toBe("No operation performed");
  });
});
