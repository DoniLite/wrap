/**
 * Standard response helpers
 */
export class ResponseHelper {
  static success<T>(data: T, message?: string) {
    return {
      success: true,
      message,
      data,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static error(message: string, details?: any) {
    return {
      success: false,
      message,
      details,
    };
  }

  static paginated<T>(
    items: T[],
    page: number,
    pageSize: number,
    total: number,
    message?: string,
  ) {
    return {
      success: true,
      message,
      data: items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      },
    };
  }
}
