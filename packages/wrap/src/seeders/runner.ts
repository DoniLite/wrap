
export interface Seeder {
  run(): Promise<void>;
}


export class SeederRunner<
  C extends new () => Seeder,
> {
  constructor(protected seeders: C[]) {}

  async runAll() {
    for (const seeder of this.seeders) {
      const seederInstance = new seeder();
      await seederInstance.run();
    }
  }
}
