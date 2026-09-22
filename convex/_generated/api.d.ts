/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalogue from "../catalogue.js";
import type * as crons from "../crons.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_pages from "../lib/pages.js";
import type * as lib_trash from "../lib/trash.js";
import type * as library from "../library.js";
import type * as pages from "../pages.js";
import type * as settings from "../settings.js";
import type * as sites from "../sites.js";
import type * as trash from "../trash.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalogue: typeof catalogue;
  crons: typeof crons;
  "lib/auth": typeof lib_auth;
  "lib/constants": typeof lib_constants;
  "lib/pages": typeof lib_pages;
  "lib/trash": typeof lib_trash;
  library: typeof library;
  pages: typeof pages;
  settings: typeof settings;
  sites: typeof sites;
  trash: typeof trash;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
