import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createTestDatabase,
  type TestDatabase,
} from "@donilite/wrap/testing";
import * as schemas from "@/db";
import { ExampleRepository } from "@/features/example/repository/example.repository";
import { CreateExampleDTO } from "@/features/example/DTO/example.dto";

let testDb: TestDatabase;
let repository: ExampleRepository;

const EPOCH = new Date(0).toISOString();

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

describe("offline-first sync (findChangedSince / applyBatch)", () => {
  it("pulls rows changed since a cursor, oldest first", async () => {
    const a = await repository.create(CreateExampleDTO.from({ name: "A" }));
    const b = await repository.create(CreateExampleDTO.from({ name: "B" }));

    const page = await repository.findChangedSince(EPOCH);

    expect(page.items.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(page.nextCursor).toBeNull();
  });

  it("paginates via limit and nextCursor", async () => {
    await repository.create(CreateExampleDTO.from({ name: "A" }));
    await repository.create(CreateExampleDTO.from({ name: "B" }));
    await repository.create(CreateExampleDTO.from({ name: "C" }));

    const page = await repository.findChangedSince(EPOCH, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();

    const nextPage = await repository.findChangedSince(page.nextCursor as string);
    expect(nextPage.items).toHaveLength(1);
    expect(nextPage.nextCursor).toBeNull();
  });

  it("does not return rows created before the cursor", async () => {
    await repository.create(CreateExampleDTO.from({ name: "Old" }));
    const cursor = new Date(Date.now() + 1000).toISOString();

    const page = await repository.findChangedSince(cursor);
    expect(page.items).toHaveLength(0);
  });

  it("applies a create through applyBatch", async () => {
    const result = await repository.applyBatch([
      {
        op: "create",
        data: CreateExampleDTO.from({ name: "Batched" }),
        updatedAt: new Date().toISOString(),
      },
    ]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.applied).toHaveLength(1);
    expect((await repository.findOneBy("name", "Batched"))?.name).toBe(
      "Batched",
    );
  });

  it("rejects a stale update as a conflict (last-write-wins)", async () => {
    const created = await repository.create(
      CreateExampleDTO.from({ name: "Original" }),
    );

    const result = await repository.applyBatch([
      {
        op: "update",
        id: created.id,
        data: { name: "Should be rejected" },
        updatedAt: new Date(0).toISOString(), // older than the row's real updatedAt
      },
    ]);

    expect(result.applied).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.id).toBe(created.id);

    const stillOriginal = await repository.findById(created.id);
    expect(stillOriginal?.name).toBe("Original");
  });

  it("applies a fresh update when the client's change is newer", async () => {
    const created = await repository.create(
      CreateExampleDTO.from({ name: "Original" }),
    );

    const result = await repository.applyBatch([
      {
        op: "update",
        id: created.id,
        data: { name: "Updated" },
        updatedAt: new Date(Date.now() + 10_000).toISOString(),
      },
    ]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.applied).toEqual([created.id]);
    expect((await repository.findById(created.id))?.name).toBe("Updated");
  });

  it("soft-deletes through applyBatch and surfaces the tombstone via findChangedSince", async () => {
    const created = await repository.create(
      CreateExampleDTO.from({ name: "Temp" }),
    );

    const result = await repository.applyBatch([
      { op: "delete", id: created.id, updatedAt: new Date().toISOString() },
    ]);

    expect(result.applied).toEqual([created.id]);
    // Soft-deleted: excluded from normal reads...
    expect(await repository.findById(created.id)).toBeNull();

    // ...but present as a tombstone for a syncing client.
    const page = await repository.findChangedSince(EPOCH);
    const tombstone = page.items.find((i) => i.id === created.id);
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).not.toBeNull();
  });
});
