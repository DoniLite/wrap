import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import {
  createTestDatabase,
  type TestDatabase,
} from "@donilite/wrap/testing";
import * as schemas from "@/db";
import { ExampleRepository } from "@/features/example/repository/example.repository";
import { Example, ExampleTable } from "@/features/example/entity/example.entity";
import { CreateExampleDTO } from "@/features/example/DTO/example.dto";
import { onEntityEvent, type EntityEvent } from "@donilite/wrap";

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

describe("entity-scope cache (cacheTtl on the repository)", () => {
  it("serves reads from cache and invalidates the scope on write", async () => {
    const created = await repository.create(
      CreateExampleDTO.from({ name: "Cached" }),
    );

    // Populate the cache
    expect((await repository.findById(created.id))?.name).toBe("Cached");

    // Out-of-band change (no repository write → no invalidation):
    await testDb.db
      .update(ExampleTable)
      .set({ name: "Changed behind the cache" })
      .where(eq(ExampleTable.id, created.id));

    // Proof of caching: the stale value is served
    expect((await repository.findById(created.id))?.name).toBe("Cached");

    // A repository write invalidates the whole entity scope
    await repository.update(created.id, { name: "Fresh" });
    expect((await repository.findById(created.id))?.name).toBe("Fresh");
  });
});

describe("entity events", () => {
  it("emits created, updated and deleted", async () => {
    const events: EntityEvent[] = [];
    const unsubscribe = onEntityEvent(Example, (event) => {
      events.push(event);
    });

    try {
      const created = await repository.create(
        CreateExampleDTO.from({ name: "Evented" }),
      );
      await repository.update(created.id, { name: "Evented 2" });
      await repository.delete(created.id);

      expect(events.map((e) => e.type)).toEqual([
        "created",
        "updated",
        "deleted",
      ]);
      expect(events[0]?.table).toBe("examples");
    } finally {
      unsubscribe();
    }
  });
});
