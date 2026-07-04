/**
 * App-defined roles and access presets.
 * Registered into the framework via WrapRegistry (factory/web.factory.ts);
 * the generic `canAccess` check is exported by @donilite/wrap.
 */
export enum UserRoles {
  ADMIN = "admin",
  USER = "user",
  MAINTAINER = "maintainer",
}

export const READ_ACCESS = [
  UserRoles.ADMIN,
  UserRoles.MAINTAINER,
  UserRoles.USER,
];
export const WRITE_ACCESS = [UserRoles.ADMIN, UserRoles.MAINTAINER];
export const DELETE_ACCESS = [UserRoles.ADMIN];
