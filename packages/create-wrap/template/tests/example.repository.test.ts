import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  createTestDatabase,
  type TestDatabase,
} from "@donilite/wrap/testing";
import { eq } from "drizzle-orm";
import * as schemas from "@/db";
import { ExampleRepository } from "@/features/example/repository/example.repository";
import {
  ExampleItemTable,
  ExampleTable,
} from "@/features/example/entity/example.entity";
import { CreateExampleDTO } from "@/features/example/DTO/example.dto";

let testDb: TestDatabase;
let repository: ExampleRepository;

beforeAll(async () => {
  // In-process PGlite: no docker required. Pass `url` for a real Postgres.
  testDb = await createTestDatabase({ schema: schemas });
  repository = new ExampleRepository();
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.truncateAll();
});

describe("ExampleRepository", () => {
  it("creates and reads an entity", async () => {
    const created = await repository.create(
      CreateExampleDTO.from({ name: "First", description: "desc" }),
    );

    expect(created.id).toBeDefined();
    expect(created.name).toBe("First");

    const found = await repository.findById(created.id);
    expect(found?.name).toBe("First");
  });

  it("populates relations with a typed `with`", async () => {
    const parent = await repository.create(
      CreateExampleDTO.from({ name: "Parent" }),
    );
    await testDb.db
      .insert(ExampleItemTable)
      .values({ label: "child A", exampleId: parent.id });

    const found = await repository.findById(parent.id, {
      with: { items: true },
    });

    expect(found?.items).toHaveLength(1);
    expect(found?.items[0]?.label).toBe("child A");
  });

  it("excludes soft-deleted rows by default", async () => {
    const created = await repository.create(
      CreateExampleDTO.from({ name: "Ghost" }),
    );
    // deletedAt is not part of the update DTO (by design) — arrange
    // the soft-deleted state directly through the test database.
    await testDb.db
      .update(ExampleTable)
      .set({ deletedAt: new Date() })
      .where(eq(ExampleTable.id, created.id));

    expect(await repository.findById(created.id)).toBeNull();
    expect(
      await repository.findById(created.id, { includeDeleted: true }),
    ).not.toBeNull();
  });

  it("searches on the configured searchable fields", async () => {
    await repository.create(CreateExampleDTO.from({ name: "Alpha One" }));
    await repository.create(CreateExampleDTO.from({ name: "Beta Two" }));

    const page = await repository.findPaginated({ search: "Alpha" });
    expect(page.itemCount).toBe(1);
    expect(page.items[0]?.name).toBe("Alpha One");
  });
});
