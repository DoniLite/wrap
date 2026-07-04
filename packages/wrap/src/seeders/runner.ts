export class SeederRunner<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  C extends new () => any,
> {
  constructor(protected seeders: C[]) {}

  async runAll() {
    for (const seeder of this.seeders) {
      const seederInstance = new seeder();
      await seederInstance.run();
    }
  }
}
