import { text } from "drizzle-orm/pg-core";
import { Entity, relationsOf } from "@donilite/wrap";

/**
 * Entities live inside their feature slice, defined as classes.
 * `BaseRow` columns (id, createdAt, updatedAt, deletedAt) are injected
 * automatically; `InstanceType<typeof Example>` is the typed row.
 */

export class ExampleCategory extends Entity("example_categories", {
  title: text("title").notNull(),
}) {}

export class Example extends Entity("examples", {
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("active"),
  categoryId: text("category_id").references(() => ExampleCategory.table.id, {
    onDelete: "set null",
  }),
}) {}

export class ExampleItem extends Entity("example_items", {
  label: text("label").notNull(),
  exampleId: text("example_id")
    .notNull()
    .references(() => Example.table.id, { onDelete: "cascade" }),
}) {}

/**
 * Explicit relations — both kinds can be combined: `many` (arrays) and
 * `one` (objects). Declared via relationsOf(entity, cb) so entities can
 * reference each other freely (thunks avoid import/type cycles).
 *
 * These named exports are required: drizzle-kit reads them for
 * migrations, and `db.query.<ExportName>` / populate typing rely on them.
 */
export const ExampleTable = Example.table;
export const ExampleRelations = relationsOf(Example, ({ one, many, self }) => ({
  items: many(() => ExampleItem),
  category: one(() => ExampleCategory, { fields: [self.categoryId] }),
}));

export const ExampleItemTable = ExampleItem.table;
export const ExampleItemRelations = relationsOf(ExampleItem, ({ one, self }) => ({
  example: one(() => Example, { fields: [self.exampleId] }),
}));

export const ExampleCategoryTable = ExampleCategory.table;
export const ExampleCategoryRelations = relationsOf(
  ExampleCategory,
  ({ many }) => ({
    examples: many(() => Example),
  }),
);

// Row type aliases
export type ExampleTableType = InstanceType<typeof Example>;
export type ExampleTableInsert = typeof ExampleTable.$inferInsert;
export type ExampleItemTableType = InstanceType<typeof ExampleItem>;
export type ExampleItemTableInsert = typeof ExampleItemTable.$inferInsert;
export type ExampleCategoryTableType = InstanceType<typeof ExampleCategory>;
export type ExampleCategoryTableInsert =
  typeof ExampleCategoryTable.$inferInsert;
