import { PaginationQuerysDTO } from "../dto";
import { SortOrder, type PaginationQuery } from "../types/pagination";

export default function buildQuery<T extends Record<string, unknown>>(
  query: T,
): PaginationQuery {
  const out: PaginationQuery = {};

  for (const [key, value] of Object.entries(query)) {
    if (
      (key === "page" ||
        key === "pageSize" ||
        key === "search" ||
        key === "sortBy" ||
        key === "sortOrder" ||
        key === "includeDeleted" ||
        key === "populateChildren") &&
      (value || value === false || value === 0)
    ) {
      if (
        ["page", "pageSize"].includes(key) &&
        typeof value !== "number" &&
        isNaN(Number(value))
      ) {
        continue;
      }

      if (["page", "pageSize"].includes(key)) {
        Object.assign(out, { [key]: Number(value) });
        continue;
      }

      if (
        ["includeDeleted", "populateChildren"].includes(key) &&
        typeof value !== "boolean" &&
        value !== "true" &&
        value !== "false"
      ) {
        continue;
      }

      if (["includeDeleted", "populateChildren"].includes(key)) {
        Object.assign(out, { [key]: value === "true" || value === true });
        continue;
      }

      if (
        key === "sortOrder" &&
        !Object.values(SortOrder).includes(value as SortOrder)
      ) {
        continue;
      }

      Object.assign(out, { [key]: value });
    } else if (value || (typeof value === "string" && value.length > 2)) {
      out.filters = {
        ...out.filters,
        [key]: value as string | number | boolean,
      };
    }
  }

  return PaginationQuerysDTO.from(out);
}
