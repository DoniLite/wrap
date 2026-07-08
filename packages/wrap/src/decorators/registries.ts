// ===== REGISTRIES =====
/* eslint-disable @typescript-eslint/no-explicit-any */
export const DTO_CLASSES = new Map<string, any>();
export const REPOSITORY_CLASSES = new Map<string, any>();
export const SERVICE_CLASSES = new Map<string, any>();
export const CONTROLLER_CLASSES = new Map<string, any>();

// ===== REGISTRY GETTERS =====

export function getDTOClass(name: string) {
  return DTO_CLASSES.get(name);
}

export function getRepositoryClass(name: string) {
  return REPOSITORY_CLASSES.get(name);
}

export function getServiceClass(name: string) {
  return SERVICE_CLASSES.get(name);
}

export function getControllerClass(name: string) {
  return CONTROLLER_CLASSES.get(name);
}

export function getAllControllers() {
  return Array.from(CONTROLLER_CLASSES.values());
}

export function getAllServices() {
  return Array.from(SERVICE_CLASSES.values());
}

export function getAllRepositories() {
  return Array.from(REPOSITORY_CLASSES.values());
}

export function getAllDTOs() {
  return Array.from(DTO_CLASSES.values());
}

// ===== CONTROLLER MOUNT TRACKING =====
//
// A controller's real mount path isn't fully determined by its own
// @Controller basePath alone once controllers compose each other
// (Wrap.register() / RouterController.register()): the actual path also
// depends on what prefix it was registered with and which parent
// controller it was registered under, both resolved only at runtime.
// register() records that here as each mount happens, so SwaggerGenerator
// can walk the chain back to an absolute path instead of using each
// controller's basePath in isolation — see swagger/index.ts.

export interface ControllerMountInfo {
  /** The controller class this one was registered under, or undefined for a root mount (directly on Wrap). */
  parent?: any;
  /** This mount's own path segment (prefix + this controller's basePath), relative to its parent. */
  mountPath: string;
}

export const CONTROLLER_MOUNTS = new Map<any, ControllerMountInfo>();

export function recordControllerMount(
  controllerClass: any,
  mountPath: string,
  parent?: any,
): void {
  CONTROLLER_MOUNTS.set(controllerClass, { parent, mountPath });
}

/** Join path segments, collapsing slashes — `""`/`"/"` segments drop out. */
export function joinPath(...segments: string[]): string {
  const joined = segments
    .map((segment) => segment.replace(/^\/|\/$/g, ""))
    .filter(Boolean)
    .join("/");
  return joined ? `/${joined}` : "/";
}

/**
 * Resolve a controller's absolute mount path by walking up whatever
 * parent chain register() recorded. Returns undefined when the
 * controller was never registered (decorated but unused, or resolved
 * before registration ran) — callers fall back to the bare basePath.
 */
export function resolveControllerPath(controllerClass: any): string | undefined {
  const info = CONTROLLER_MOUNTS.get(controllerClass);
  if (!info) return undefined;
  const parentPath = info.parent ? (resolveControllerPath(info.parent) ?? "") : "";
  return joinPath(parentPath, info.mountPath);
}
