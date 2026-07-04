/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Context } from "hono";
import type {
  BaseRepository,
  EntityStatistics,
  RepositoryCreate,
  RepositoryEntity,
  RepositoryUpdate,
  RepositoryWith,
} from "./base.repository";
import { ValidateDTO } from "./decorators";
import type { PaginatedResponse, PaginationQuery } from "./types/pagination";
import { logger } from "./logger";

/**
 * Options accepted by BaseService read methods, typed from the repository.
 * For fully-typed populate results, call the repository directly.
 */
export interface ServiceFindOptions<Repo> {
  with?: RepositoryWith<Repo>;
  includeDeleted?: boolean;
}

/**
 * Generic CRUD service. Everything is derived from the repository type:
 * `class ExampleService extends BaseService<ExampleRepository> {}`
 *
 * @template Repo - The concrete repository type
 * @template TCreate - Optional override of the create DTO (defaults to the repository's)
 * @template TUpdate - Optional override of the update DTO (defaults to the repository's)
 */
export abstract class BaseService<
  Repo extends BaseRepository<any, any, any>,
  TCreate = RepositoryCreate<Repo>,
  TUpdate = RepositoryUpdate<Repo>,
> {
  protected logger = logger;

  constructor(protected repository: Repo) {}

  /**
   * Creates a new entity.
   * @param dto - The data transfer object for creating the entity.
   * @param _context - The Hono context, required for validation.
   */
  @ValidateDTO()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(dto: TCreate, _context: Context): Promise<RepositoryEntity<Repo>> {
    this.logger.debug(`Creating entity in ${this.constructor.name}`, {
      className: this.constructor.name,
      method: "create",
    });
    return this.repository.create(dto) as Promise<RepositoryEntity<Repo>>;
  }

  async findById(
    id: string | number,
    options?: ServiceFindOptions<Repo>,
  ): Promise<RepositoryEntity<Repo> | null> {
    return this.repository.findById(id, options);
  }

  async findAll(
    filters?: Partial<RepositoryEntity<Repo>>,
    options?: ServiceFindOptions<Repo>,
  ): Promise<RepositoryEntity<Repo>[]> {
    return this.repository.findAll(filters, options);
  }

  async findPaginated(
    query: PaginationQuery,
    options?: ServiceFindOptions<Repo>,
  ): Promise<PaginatedResponse<RepositoryEntity<Repo>>> {
    return this.repository.findPaginated(query, options);
  }

  @ValidateDTO()
  async update(
    id: string | number,
    dto: TUpdate,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: Context,
  ): Promise<RepositoryEntity<Repo>[] | null> {
    this.logger.debug(`Updating entity ${id} in ${this.constructor.name}`, {
      className: this.constructor.name,
      method: "update",
      id,
    });
    const exists = await this.repository.exists(id);
    if (!exists) {
      this.logger.warn(`Entity ${id} not found for update`, {
        className: this.constructor.name,
        method: "update",
        id,
      });
      throw new Error(`Entity with id ${id} not found`);
    }
    return this.repository.update(id, dto) as Promise<
      RepositoryEntity<Repo>[] | null
    >;
  }

  async delete(id: string | number): Promise<boolean> {
    this.logger.debug(`Deleting entity ${id} in ${this.constructor.name}`, {
      className: this.constructor.name,
      method: "delete",
      id,
    });
    const exists = await this.repository.exists(id);
    if (!exists) {
      this.logger.warn(`Entity ${id} not found for deletion`, {
        className: this.constructor.name,
        method: "delete",
        id,
      });
      throw new Error(`Entity with id ${id} not found`);
    }
    return this.repository.delete(id);
  }

  /**
   * Delete multiple entities by their IDs
   * @param ids - Array of entity IDs to delete
   * @returns Object with deleted count and failed IDs
   */
  async deleteMultiple(ids: (string | number)[]): Promise<{
    deletedCount: number;
    requestedCount: number;
    success: boolean;
  }> {
    if (ids.length === 0) {
      return {
        deletedCount: 0,
        requestedCount: 0,
        success: true,
      };
    }

    const deletedCount = await this.repository.deleteMultiple(ids);

    return {
      deletedCount,
      requestedCount: ids.length,
      success: deletedCount === ids.length,
    };
  }

  async findBy<K extends keyof RepositoryEntity<Repo> & string>(
    field: K,
    value: RepositoryEntity<Repo>[K],
  ): Promise<RepositoryEntity<Repo>[]> {
    return this.repository.findBy(field, value) as Promise<
      RepositoryEntity<Repo>[]
    >;
  }

  async findOneBy<K extends keyof RepositoryEntity<Repo> & string>(
    field: K,
    value: RepositoryEntity<Repo>[K],
  ): Promise<RepositoryEntity<Repo> | null> {
    return this.repository.findOneBy(field, value) as Promise<RepositoryEntity<Repo> | null>;
  }

  async findOne(
    filters?: Partial<RepositoryEntity<Repo>>,
    options?: ServiceFindOptions<Repo>,
  ): Promise<RepositoryEntity<Repo> | null> {
    return this.repository.findOne(filters, options);
  }

  async count(filters?: Partial<RepositoryEntity<Repo>>): Promise<number> {
    return this.repository.count(filters);
  }

  async exists(id: string | number): Promise<boolean> {
    return this.repository.exists(id);
  }

  /**
   * Get statistics for the entity
   * @returns EntityStatistics with monthly, weekly, and yearly data
   */
  async getStatistics(): Promise<EntityStatistics> {
    return this.repository.getStatistics();
  }
}
