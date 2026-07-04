export enum SortOrder {
  ASC = "asc",
  DESC = "desc",
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
  includeDeleted?: boolean;
  populateChildren?: boolean;
  filters?: Record<string, string | number | boolean | string[] | undefined>;
}

export interface PaginatedResponse<T> {
  items: T[];
  itemCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
