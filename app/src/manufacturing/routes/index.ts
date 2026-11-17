// The routes that come with the app (`dec_manufacturing_contract` point 7): the app makes a registry and registers these. A route is added to or taken out of the list here and nowhere else.
import type { Route } from "../contract/index.ts";
import { laserOutline } from "./laser-outline/index.ts";

export const builtInRoutes: Route[] = [laserOutline];
