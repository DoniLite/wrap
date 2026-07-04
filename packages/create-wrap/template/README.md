# {{APP_NAME}}

A modern backend API built with [Hono](https://hono.dev/), [Drizzle ORM](https://orm.drizzle.team/), and [Bun](https://bun.sh/).

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/) (for PostgreSQL)

### Quick Start

```bash
# Start PostgreSQL
bun run wake:db

# Push database schema
bun run push:db

# Start development server
bun run dev
```

Then visit http://localhost:5000/docs for Swagger UI.

## 📁 Project Structure

```
src/
├── core/              # Base classes, decorators, utilities
│   ├── decorators/    # @Controller, @Get, @Post, etc.
│   ├── config/        # App configuration
│   ├── swagger/       # OpenAPI generator
│   ├── base.controller.ts
│   ├── base.repository.ts
│   ├── base.service.ts
│   ├── dto.ts         # DTO utilities
│   └── logger.ts
├── db/                # Database schemas
│   └── schema/        # Drizzle table definitions
├── features/          # Feature modules
│   └── example/       # Example CRUD feature
│       ├── DTO/
│       ├── repository/
│       ├── services/
│       ├── web/       # Controllers
│       └── app/       # Route mounting
├── factory/           # Factories (Service, Web)
├── helpers/           # Utility functions
├── middleware/        # Hono middleware
├── types/             # TypeScript types
├── index.ts           # App entry point
└── index.controller.ts # API router
```

## 🏗️ Creating a New Feature

1. **Create the schema** in `src/db/schema/`:

   ```typescript
   export const MyTable = pgTable("my_table", {
     ...BaseRow,
     name: text("name").notNull(),
   });
   ```

2. **Create DTOs** in `src/features/my-feature/DTO/`:

   ```typescript
   @DTO()
   export class CreateMyDTO extends BaseDTO {
     @IsString()
     name!: string;
   }
   ```

3. **Create Repository** in `src/features/my-feature/repository/`:

   ```typescript
   @Repository("MyRepository")
   export class MyRepository extends BaseRepository<...> {
     protected table = MyTable;
   }
   ```

4. **Create Service** in `src/features/my-feature/services/`:

   ```typescript
   @Service()
   export class MyService extends BaseService<...> {}
   ```

5. **Create Controller** in `src/features/my-feature/web/`:

   ```typescript
   @Controller({ basePath: "/api/my-resource", tags: ["MyResource"] })
   export class MyController extends BaseController<...> {}
   ```

6. **Mount the route** in `src/index.controller.ts`.

## 📜 Available Scripts

| Command                       | Description                              |
| ----------------------------- | ---------------------------------------- |
| `bun run dev`                 | Start development server with hot reload |
| `bun run start`               | Start production server                  |
| `bun run wake:db`             | Start PostgreSQL container               |
| `bun run down:db`             | Stop PostgreSQL container                |
| `bun run push:db`             | Push schema to database                  |
| `bun run generate:migrations` | Generate migrations                      |
| `bun run migrate:db`          | Run migrations                           |
| `bun run lint`                | Run ESLint                               |
| `bun run fmt`                 | Format code with Prettier                |

## 🔧 Configuration

Environment variables are loaded from `.env`. See `.env.example` for available options.

## 📚 Decorators

| Decorator                                       | Description                    |
| ----------------------------------------------- | ------------------------------ |
| `@Controller({ basePath, tags })`               | Register a controller          |
| `@Get`, `@Post`, `@Put`, `@Delete`              | HTTP method decorators         |
| `@ApiResponse(status, { description, schema })` | Document API response          |
| `@Serialize(DTO)`                               | Transform response through DTO |
| `@ValidateDTO(DTO)`                             | Validate request body          |
| `@Cache({ ttl })`                               | Cache response                 |
| `@RateLimit({ max, window })`                   | Rate limit endpoint            |
| `@UseMiddleware([...])`                         | Apply middleware               |

## 📝 License

MIT
