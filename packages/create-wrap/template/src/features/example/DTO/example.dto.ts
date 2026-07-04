import { z } from "zod";
import { DTO } from "@donilite/wrap";
import { SelectDTO, InsertDTO, PartialDTO } from "@donilite/wrap";
import {
  Example,
  ExampleCategory,
  ExampleItem,
} from "../entity/example.entity";

// DTOs derived from the entity classes — the entity is the single source
// of truth. The `exclude` option leaves internal columns out of the
// public shape (validation, serialization and OpenAPI all follow).
export const ExampleBase = SelectDTO(Example, { exclude: ["deletedAt"] });
export const ExampleItemBase = SelectDTO(ExampleItem, {
  exclude: ["deletedAt"],
});
export const ExampleCategoryBase = SelectDTO(ExampleCategory, {
  exclude: ["deletedAt"],
});

/**
 * Example enriched with its populated relations — both kinds at once:
 * `items` is a many relation (array), `category` a one relation (object).
 * Used to serialize responses when `populateChildren=true` (or an explicit
 * `with: { items: true, category: true }`) is requested.
 */
@DTO()
export class ExamplePopulated extends ExampleBase {
  static override schema = ExampleBase.schema.extend({
    items: z.array(ExampleItemBase.schema).optional(),
    category: ExampleCategoryBase.schema.nullable().optional(),
  });

  declare items?: InstanceType<typeof ExampleItemBase>[];
  declare category?: InstanceType<typeof ExampleCategoryBase> | null;
}

/**
 * Create DTO derived from the insert shape (id/timestamps excluded).
 * Refine fields by overriding the schema:
 * `static override schema = super.schema.extend({ name: z.string().min(3) })`
 */
@DTO()
export class CreateExampleDTO extends InsertDTO(Example) {}

export const UpdateExampleDTO = PartialDTO(CreateExampleDTO);
