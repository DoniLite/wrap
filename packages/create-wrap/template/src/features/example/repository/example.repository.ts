import { BaseRepository } from "@donilite/wrap";
import { Example, type ExampleTableType } from "../entity/example.entity";
import type { CreateExampleDTO } from "../DTO/example.dto";
import { Repository } from "@donilite/wrap";

@Repository("ExampleRepository")
export class ExampleRepository extends BaseRepository<
  typeof Example.table,
  CreateExampleDTO,
  Partial<CreateExampleDTO>
> {
  protected table = Example.table;

  // Enables populate: relations are declared in ../entity/example.entity.ts
  // (thunk: the database is resolved at query time, not at construction)
  protected override relationalQuery = () => this.db.query.ExampleTable;

  // Relations loaded when a request asks `populateChildren=true` —
  // any combination of many (arrays) and one (objects) relations
  protected override defaultWith = { items: true, category: true } as const;

  protected override searchableFields: (keyof ExampleTableType)[] = [
    "name",
    "description",
  ];

  // Entity-scope cache: reads go through the configured store (memory by
  // default, Redis via configureCache); any write invalidates the scope.
  protected override cacheTtl = 30;
}
