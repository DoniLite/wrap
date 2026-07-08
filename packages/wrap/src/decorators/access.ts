import type { Context, Next } from 'hono';
import type { AppRoles, AppVariables } from '../registry';
import { MIDDLEWARE_METADATA } from './constants';

/** Generic role check — role sets are defined by the app. */
export function canAccess(
  role: AppRoles | undefined,
  allowed: readonly AppRoles[],
): boolean {
  return role !== undefined && allowed.includes(role);
}

/**
 * Restrict a route to the given roles (read from the JWT payload set by
 * the auth middleware). Roles are typed through the WrapRegistry.
 *
 * @example
 * @Can(WRITE_ACCESS)
 * @Post({ path: "/" })
 * async create(c: Context) {}
 */
export function Can(allowedRoles: readonly AppRoles[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const middleware = async (
      c: Context<{ Variables: AppVariables }>,
      next: Next,
    ) => {
      const identity = c.get('identity') as { role?: AppRoles } | undefined;
      if (!identity) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      if (!canAccess(identity.role, allowedRoles)) {
        return c.json({ error: 'Access denied' }, 403);
      }
      return await next();
    };

    // Prepend to ensure @Can runs AFTER auth middleware
    // (decorators execute bottom-to-top, but we want Can to always be last)
    const middlewares =
      Reflect.getMetadata(MIDDLEWARE_METADATA, target, propertyKey) || [];
    Reflect.defineMetadata(
      MIDDLEWARE_METADATA,
      [middleware, ...middlewares],
      target,
      propertyKey,
    );
    return descriptor;
  };
}
