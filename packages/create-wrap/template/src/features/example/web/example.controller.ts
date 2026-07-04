import { BaseController } from "@donilite/wrap";
import {
  CreateExampleDTO,
  UpdateExampleDTO,
  ExampleBase,
  ExamplePopulated,
} from "../DTO/example.dto";
import { ExampleService } from "../services/example.service";
import {
  ApiResponse,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Serialize,
  UseMiddleware,
} from "@donilite/wrap";
import { ServiceFactory } from "@donilite/wrap";
import { webFactory } from "@/factory/web.factory";
import type { Context } from "hono";
import { buildQuery } from "@donilite/wrap";
import {
  BaseDeletedSuccessDTO,
  BaseErrorDTO,
  PaginatedResponseDTO,
} from "@donilite/wrap";

@Controller({
  basePath: "/api/examples",
  tags: ["Examples"],
  description: "Example CRUD endpoints",
})
export class ExampleController extends BaseController<ExampleService> {
  constructor() {
    const service = ServiceFactory.getService(ExampleService);
    const app = webFactory.createApp();

    super(service, app, {
      middlewares: {},
    });
  }

  @Get({
    path: "/",
    description: "Get paginated examples",
  })
  @ApiResponse(200, {
    description: "Success",
    schema: PaginatedResponseDTO(ExamplePopulated),
  })
  @ApiResponse(500, {
    description: "Internal Server Error",
    schema: BaseErrorDTO,
  })
  @Serialize(PaginatedResponseDTO(ExamplePopulated))
  async getPaginatedExamples(c: Context) {
    try {
      const query = buildQuery(c.req.query());
      const examples = await this.service.findPaginated(query);
      return c.json(examples);
    } catch (e) {
      return this.handleError(c, e);
    }
  }

  @Get({
    path: "/:id",
    description: "Get example by ID",
  })
  @ApiResponse(200, {
    description: "Success",
    schema: ExampleBase,
  })
  @ApiResponse(404, {
    description: "Not Found",
    schema: BaseErrorDTO,
  })
  @Serialize(ExampleBase)
  @UseMiddleware([])
  async getExampleById(c: Context) {
    try {
      const id = c.req.param("id")!;
      const example = await this.service.findById(id);
      if (!example) {
        return c.json({ success: false, message: "Example not found" }, 404);
      }
      return c.json(example);
    } catch (e) {
      return this.handleError(c, e);
    }
  }

  @Post({
    path: "/",
    description: "Create example",
    body: CreateExampleDTO,
  })
  @ApiResponse(201, {
    description: "Created",
    schema: ExampleBase,
  })
  @ApiResponse(400, {
    description: "Bad Request",
    schema: BaseErrorDTO,
  })
  @Serialize(ExampleBase)
  async createExample(c: Context) {
    try {
      const body = await c.req.json();
      const dto = CreateExampleDTO.from(body);
      const example = await this.service.create(dto, c);
      return c.json(example, 201);
    } catch (e) {
      return this.handleError(c, e);
    }
  }

  @Put({
    path: "/:id",
    description: "Update example",
    body: UpdateExampleDTO,
  })
  @ApiResponse(200, {
    description: "Success",
    schema: ExampleBase,
  })
  @ApiResponse(404, {
    description: "Not Found",
    schema: BaseErrorDTO,
  })
  @Serialize(ExampleBase)
  async updateExample(c: Context) {
    try {
      const id = c.req.param("id")!;
      const body = await c.req.json();
      const dto = UpdateExampleDTO.from(body);
      const example = await this.service.update(id, dto, c);
      return c.json(example);
    } catch (e) {
      return this.handleError(c, e);
    }
  }

  @Delete({
    path: "/:id",
    description: "Delete example",
  })
  @ApiResponse(200, {
    description: "Success",
    schema: BaseDeletedSuccessDTO,
  })
  @ApiResponse(404, {
    description: "Not Found",
    schema: BaseErrorDTO,
  })
  async deleteExample(c: Context) {
    try {
      const id = c.req.param("id")!;
      const result = await this.service.delete(id);

      if (!result) {
        return c.json({ success: false, message: "Example not found" }, 404);
      }

      return c.json({ deleted: true, id });
    } catch (e) {
      return this.handleError(c, e);
    }
  }
}
