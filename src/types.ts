import type { Row, Recipe, Entry } from "../shared/domain.ts";
export type RecipeRow = Row & { data: Recipe };
export type EntryRow = Row & { data: Entry };
