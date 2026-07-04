/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import type { RepositoryOptions, ServiceOptions } from "./interfaces";
import {
  REPOSITORY_METADATA,
  SERVICE_METADATA,
  DTO_METADATA,
} from "./constants";
import { REPOSITORY_CLASSES, SERVICE_CLASSES, DTO_CLASSES } from "./registries";

// ===== UTILITY FUNCTIONS =====

export function getRepositoryMetadata(
  target: any,
): RepositoryOptions | undefined {
  return Reflect.getMetadata(REPOSITORY_METADATA, target);
}

export function getServiceMetadata(target: any): ServiceOptions | undefined {
  return Reflect.getMetadata(SERVICE_METADATA, target);
}

// ===== BASIC DECORATORS =====

/**
 * Repository decorator - marks a class as a repository
 * @example
 * @Repository({ tableName: "users", cache: true, cacheTTL: 300 })
 * export class UserRepository extends BaseRepository<...> {}
 */
export function Repository(options: string | RepositoryOptions) {
  return <T>(constructor: new (...args: any[]) => T) => {
    const opts: RepositoryOptions =
      typeof options === "string" ? { tableName: options } : options;

    Reflect.defineMetadata(REPOSITORY_METADATA, opts, constructor);
    REPOSITORY_CLASSES.set(constructor.name, constructor);
    return constructor;
  };
}

/**
 * Service decorator - marks a class as a service
 * @example
 * @Service({ name: "UserService", singleton: true })
 * export class UserService extends BaseService<...> {}
 */
export function Service(options: ServiceOptions = {}) {
  return <T>(constructor: new (...args: any[]) => T) => {
    Reflect.defineMetadata(SERVICE_METADATA, options, constructor);
    SERVICE_CLASSES.set(options.name || constructor.name, constructor);
    return constructor;
  };
}

/**
 * DTO decorator - marks a class as a DTO for validation
 * @example
 * @DTO()
 * export class CreateUserDTO extends BaseCreateDTO {}
 */
export function DTO() {
  return <T extends new (...args: any[]) => any>(constructor: T) => {
    DTO_CLASSES.set(constructor.name, constructor);
    Reflect.defineMetadata(DTO_METADATA, true, constructor);
    return constructor;
  };
}
