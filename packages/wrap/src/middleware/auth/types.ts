import { z } from "zod";
import { DTO } from "../../decorators";
import { SchemaDTO } from "../../dto";
import type { AppRoles } from "../../registry";

const jwtSessionBaseSchema = z.object({
  userId: z.string(),
  role: z.string(),
});

@DTO()
export class JWTSessionBase extends SchemaDTO(jwtSessionBaseSchema) {
  declare role: AppRoles;

  /**
   * Creates a JWTSessionBase from a user object, properly mapping 'id' to 'userId'
   */
  static fromUser(user: Record<string, unknown>): JWTSessionBase {
    const instance = new JWTSessionBase();
    instance.userId = user.id as string;
    instance.role = user.role as AppRoles;
    return instance;
  }
}

@DTO()
export class JWTSession extends JWTSessionBase {
  static override schema = jwtSessionBaseSchema.extend({
    exp: z.number(),
  });

  declare exp: number;
}
