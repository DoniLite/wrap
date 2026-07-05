import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createTestDatabase,
  type TestDatabase,
} from "@donilite/wrap/testing";
import { withTransaction, onEntityEvent } from "@donilite/wrap";
import * as schemas from "@/db";
import { ExampleRepository } from "@/features/example/repository/example.repository";
import { Example } from "@/features/example/entity/example.entity";
import { CreateExampleDTO } from "@/features/example/DTO/example.dto";

let testDb: TestDatabase;
let repository: ExampleRepository;

beforeAll(async () => {
  testDb = await createTestDatabase({ schema: schemas });
  repository = new ExampleRepository();
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

describe("withTransaction", () => {
  it("rolls everything back when the scope throws", async () => {
    expect(
      withTransaction(async () => {
        await repository.create(CreateExampleDTO.from({ name: "tx one" }));
        await repository.create(CreateExampleDTO.from({ name: "tx two" }));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await repository.count()).toBe(0);
  });

  it("commits the whole scope without threading a tx parameter", async () => {
    await withTransaction(async () => {
      await repository.create(CreateExampleDTO.from({ name: "tx one" }));
      await repository.create(CreateExampleDTO.from({ name: "tx two" }));
    });

    expect(await repository.count()).toBe(2);
  });

  it("buffers entity events until the commit", async () => {
    const seen: string[] = [];
    const unsubscribe = onEntityEvent(Example, (event) => {
      seen.push(event.type);
    });

    try {
      await withTransaction(async () => {
        await repository.create(CreateExampleDTO.from({ name: "buffered" }));
        expect(seen).toHaveLength(0); // not delivered before commit
      });
      expect(seen).toEqual(["created"]);
    } finally {
      unsubscribe();
    }
  });

  it("does not deliver events for rolled-back writes", async () => {
    const seen: string[] = [];
    const unsubscribe = onEntityEvent(Example, (event) => {
      seen.push(event.type);
    });

    try {
      await withTransaction(async () => {
        await repository.create(CreateExampleDTO.from({ name: "ghost" }));
        throw new Error("rollback");
      }).catch(() => undefined);

      expect(seen).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });
});
