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
