import { SeederRunner } from "@donilite/wrap";
import { ExampleSeeder } from "./example.seeder";


async function runSeeders() {
    const runner = new SeederRunner([ExampleSeeder]);
    await runner.runAll();
}

runSeeders();