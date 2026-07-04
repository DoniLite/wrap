import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createTestDatabase,
  testContext,
  type TestDatabase,
} from "@donilite/wrap/testing";
import { ValidationError, ServiceFactory } from "@donilite/wrap";
import * as schemas from "@/db";
import { ExampleService } from "@/features/example/services/example.service";
import { CreateExampleDTO } from "@/features/example/DTO/example.dto";

let testDb: TestDatabase;
let service: ExampleService;

beforeAll(async () => {
  testDb = await createTestDatabase({ schema: schemas });
  service = ServiceFactory.getService(ExampleService);
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

describe("ExampleService", () => {
  it("creates when the body is valid", async () => {
    const dto = CreateExampleDTO.from({ name: "Valid" });
    const created = await service.create(
      dto,
      testContext({ json: { name: "Valid" } }),
    );

    expect(created.name).toBe("Valid");
  });

  it("rejects an invalid body with a ValidationError", async () => {
    const dto = CreateExampleDTO.from({ name: "placeholder" });

    expect(
      service.create(dto, testContext({ json: { name: 42 } })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws when updating a missing entity", async () => {
    expect(
      service.update(
        "missing-id",
        CreateExampleDTO.from({ name: "x" }),
        testContext({ json: { name: "x" } }),
      ),
    ).rejects.toThrow("not found");
  });
});
