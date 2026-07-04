import { webFactory } from "@/factory/web.factory";
import exampleApp from "./features/example/app/example.app";

const api = webFactory.createApp();

api.route("/examples", exampleApp);

export default api;
