import { ExampleRepository } from '@/features/example/repository/example.repository';
import { Example } from '@/features/example/entity/example.entity';
import { CreateExampleDTO, UpdateExampleDTO } from '@/features/example/DTO/example.dto';
import { BaseSeeder } from '@donilite/wrap';

export class ExampleSeeder extends BaseSeeder<
  Example,
  CreateExampleDTO,
  typeof UpdateExampleDTO,
  ExampleRepository
> {
  constructor() {
    const mocks = [
      {
        name: 'Example 1',
        description: 'This is the first example.',
      },
      {
        name: 'Example 2',
        description: 'This is the second example.',
      },
    ];

    const mocksInstance = mocks.map((mock) => CreateExampleDTO.from(mock));
    super(new ExampleRepository(), mocksInstance, 'name');
  }
}
