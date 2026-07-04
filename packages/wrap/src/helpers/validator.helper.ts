/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom validation helpers
 */
import type { DTOClass } from "../dto";

export class ValidatorHelper {
  /**
   * Validate an object against a DTO class's zod schema
   */
  static async validateDTO<T>(
    dtoClass: DTOClass<T>,
    data: any,
  ): Promise<{ valid: boolean; errors?: any[] }> {
    const result = dtoClass.schema.safeParse(data);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map((issue) => ({
          property: issue.path.join("."),
          constraints: { [issue.code]: issue.message },
          value: (issue as any).input,
        })),
      };
    }

    return { valid: true };
  }

  /**
   * Validate array of objects
   */
  static async validateArray<T>(
    dtoClass: DTOClass<T>,
    dataArray: any[],
  ): Promise<{ valid: boolean; errors?: Record<number, any[]> }> {
    const allErrors: Record<number, any[]> = {};
    let hasErrors = false;

    for (let i = 0; i < dataArray.length; i++) {
      const result = await this.validateDTO(dtoClass, dataArray[i]);
      if (!result.valid && result.errors) {
        allErrors[i] = result.errors;
        hasErrors = true;
      }
    }

    return hasErrors ? { valid: false, errors: allErrors } : { valid: true };
  }
}
