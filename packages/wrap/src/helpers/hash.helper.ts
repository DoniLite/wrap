import type { Buffer } from "node:buffer";

// Uses the Bun global at call time (instead of importing the "bun"
// module) so the package stays loadable under Node (e.g. drizzle-kit).

export const hashSomething = async (data: string | Buffer) => {
  return await Bun.password.hash(data, "bcrypt");
};

export const compareHash = async (data: string | Buffer, hash: string) => {
  return await Bun.password.verify(data, hash, "bcrypt");
};
