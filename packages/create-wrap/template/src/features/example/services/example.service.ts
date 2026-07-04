import { BaseService } from "@donilite/wrap";
import { Service } from "@donilite/wrap";
import { ExampleRepository } from "../repository/example.repository";

@Service()
export class ExampleService extends BaseService<ExampleRepository> {
  constructor() {
    super(new ExampleRepository());
  }
}
