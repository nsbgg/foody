import { z } from "zod";
import type { Recipe } from "./domain.ts";

export const recipeShareTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("guest") }).strict(),
  z
    .object({
      kind: z.literal("user"),
      email: z.string().trim().toLowerCase().email().max(254),
    })
    .strict(),
  z
    .object({ kind: z.literal("household"), householdId: z.string().uuid() })
    .strict(),
]);
export const createRecipeShareSchema = z
  .object({
    recipeIds: z
      .array(z.string().min(1).max(500))
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    target: recipeShareTargetSchema,
    expiresInDays: z.number().int().min(1).max(30).default(7),
  })
  .strict();
export const recipeShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export type RecipeShareTarget = z.infer<typeof recipeShareTargetSchema>;
export type CreateRecipeShare = z.infer<typeof createRecipeShareSchema>;
export type RecipeShareView = {
  id: string;
  sourceHouseholdName: string;
  recipeTitles: string[];
  recipeCount: number;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  target: RecipeShareTarget;
};
/** Capability holders receive only the selected recipe snapshots and link expiry. */
export type RecipeShareContent = {
  id: string;
  recipeCount: number;
  createdAt: number;
  expiresAt: number;
  recipes: Recipe[];
  /** Only present after authorization for a household-bound share. */
  targetHouseholdId?: string;
};
