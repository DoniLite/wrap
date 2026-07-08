import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestDatabase, type TestDatabase } from '@donilite/wrap/testing';
import {
  Controller,
  Get,
  JwtCookieAuthController,
  RouterController,
  SwaggerGenerator,
  UseMiddleware,
} from '@donilite/wrap';
import type { Context } from 'hono';
import * as schemas from '@/db';
import { webFactory } from '@/factory/web.factory';
// Side-effect imports: registers @Controller/@Route metadata used below.
import '@/features/example/web/example.controller';
import '@/index.controller';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase({ schema: schemas });
});

afterAll(async () => {
  await testDb.destroy();
});

const testAuth = new JwtCookieAuthController({ secret: 'swagger-test' });

@Controller({ basePath: '/secure', tags: ['Secure'] })
class SecureTestController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: '/' })
  @UseMiddleware([testAuth.authMiddleware])
  async guarded(c: Context) {
    return c.json({ ok: true });
  }
}
void SecureTestController; // registered as a side effect of the decorator, never instantiated

@Controller({ basePath: '/regex-things', tags: ['RegexThings'] })
class RegexParamTestController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  // Hono's regex-constrained param syntax — must still resolve to `{id}`
  // in the OpenAPI path/parameter, not `{id{[0-9]+}}`.
  @Get({ path: '/:id{[0-9]+}' })
  async byNumericId(c: Context) {
    return c.json({ ok: true });
  }
}
void RegexParamTestController;

describe('SwaggerGenerator', () => {
  it('derives path parameters from :id routes instead of requiring route.params', () => {
    const generator = new SwaggerGenerator({ title: 'Test', version: '0.0.0' });
    const spec = generator.generateSpec();

    const byId = spec.paths['/api/examples/{id}'];
    expect(byId).toBeDefined();
    expect(byId.get.parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: undefined,
      },
    ]);
  });

  it("handles Hono's regex-constrained param syntax (:id{regex})", () => {
    const generator = new SwaggerGenerator({ title: 'Test', version: '0.0.0' });
    const spec = generator.generateSpec();

    const byNumericId = spec.paths['/regex-things/{id}'];
    expect(byNumericId).toBeDefined();
    expect(byNumericId.get.parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: undefined,
      },
    ]);
  });

  it("uses the registered AuthController's security schemes instead of the hardcoded default", () => {
    const generator = new SwaggerGenerator(
      { title: 'Test', version: '0.0.0' },
      testAuth,
    );
    const spec = generator.generateSpec();

    expect(Object.keys(spec.components.securitySchemes)).toEqual([
      'bearerAuth',
      'cookieAuth',
    ]);
  });

  it('marks routes guarded by an AuthController middleware, tagged rather than name-sniffed', () => {
    const generator = new SwaggerGenerator({ title: 'Test', version: '0.0.0' });
    const spec = generator.generateSpec();

    const guarded = spec.paths['/secure']?.get;
    expect(guarded).toBeDefined();
    expect(guarded.security).toBeDefined();
    expect(guarded.security.length).toBeGreaterThan(0);
    expect(guarded.responses['401']).toBeDefined();

    // An unguarded route on the same generator must NOT get a security block.
    const unguarded = spec.paths['/api/examples/{id}']?.get;
    expect(unguarded.security).toBeUndefined();
  });
});
