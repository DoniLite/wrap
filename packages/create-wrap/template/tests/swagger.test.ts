import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestDatabase, type TestDatabase } from '@donilite/wrap/testing';
import {
  Controller,
  Get,
  JwtCookieAuthController,
  RouterController,
  SwaggerGenerator,
  UseMiddleware,
  Wrap,
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

// Regression coverage: a controller's real mount path depends on the
// register() chain (prefix + parent), not just its own @Controller
// basePath — a parent mounted at "/" (like IndexController) masks this
// bug entirely, since joining with "/" contributes nothing. This parent
// has a non-trivial basePath specifically so the bug would show up.
@Controller({ basePath: '/nested-child', tags: ['Nested'] })
class NestedChildController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: '/:id' })
  async byId(c: Context) {
    return c.json({ ok: true });
  }
}

@Controller({ basePath: '/secondary-nested-child', tags: ['Nested'] })
class SecondaryNestedChildController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: '/:id' })
  async byId(c: Context) {
    return c.json({ ok: true });
  }
}

@Controller({ basePath: '/nested-parent', tags: ['Nested'] })
class NestedParentController extends RouterController {
  constructor() {
    super(webFactory.createApp());
    this.register(NestedChildController, '/scoped');
    this.register(SecondaryNestedChildController);
  }
}
// Registering the parent on a Wrap is what makes the whole chain
// resolvable — it's how a real app composes controllers, and the only
// way resolveControllerPath() has anything recorded to walk.
new Wrap().register(NestedParentController);

// Route-level tags: a route's own `tags` should REPLACE the controller's
// tags for that operation only, not merge with them.
@Controller({ basePath: '/tag-override', tags: ['Parent'] })
class TagOverrideTestController extends RouterController {
  constructor() {
    super(webFactory.createApp());
  }

  @Get({ path: '/inherits' })
  async inheritsControllerTag(c: Context) {
    return c.json({ ok: true });
  }

  @Get({ path: '/overrides', tags: ['Parent: Child'] })
  async overridesControllerTag(c: Context) {
    return c.json({ ok: true });
  }
}
void TagOverrideTestController;

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

  it('resolves a child controller mounted with a prefix under a non-root parent to its real absolute path', () => {
    const generator = new SwaggerGenerator({ title: 'Test', version: '0.0.0' });
    const spec = generator.generateSpec();

    // Real runtime path: "/nested-parent" (parent's own basePath) +
    // "/scoped" (prefix given to register()) + "/nested-child" (child's
    // own basePath) + "/:id" (the route itself).
    const resolved = spec.paths['/nested-parent/scoped/nested-child/{id}'];
    expect(resolved).toBeDefined();

    const secondaryResolved = spec.paths['/nested-parent/secondary-nested-child/{id}'];
    expect(secondaryResolved).toBeDefined();

    // The bug: using the child's bare basePath in isolation would have
    // produced this path instead — assert it's NOT what got generated.
    expect(spec.paths['/nested-child/{id}']).toBeUndefined();
  });

  it('merges config.tags descriptions into the generated top-level tags instead of discarding them', () => {
    const generator = new SwaggerGenerator({
      title: 'Test',
      version: '0.0.0',
      tags: [{ name: 'Secure', description: 'Endpoints requiring authentication' }],
    });
    const spec = generator.generateSpec();

    const secureTag = spec.tags.find((t: { name: string }) => t.name === 'Secure');
    expect(secureTag).toEqual({
      name: 'Secure',
      description: 'Endpoints requiring authentication',
    });

    // A controller-declared tag with no matching config entry still falls
    // back to a bare { name }.
    const nestedTag = spec.tags.find((t: { name: string }) => t.name === 'Nested');
    expect(nestedTag).toEqual({ name: 'Nested' });
  });

  it("a route's own tags replace (not merge with) its controller's tags", () => {
    const generator = new SwaggerGenerator({ title: 'Test', version: '0.0.0' });
    const spec = generator.generateSpec();

    const inherited = spec.paths['/tag-override/inherits']?.get;
    expect(inherited.tags).toEqual(['Parent']);

    const overridden = spec.paths['/tag-override/overrides']?.get;
    expect(overridden.tags).toEqual(['Parent: Child']);

    // The overriding tag must still surface in the top-level tags list.
    expect(spec.tags.some((t: { name: string }) => t.name === 'Parent: Child')).toBe(true);
  });
});
