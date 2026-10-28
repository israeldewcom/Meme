import { cacheDel } from "../config/redis";
import { CACHE_KEYS } from "../config/constants";

export const invalidateBootstrap = (slug: string) => cacheDel(CACHE_KEYS.bootstrap(slug));
