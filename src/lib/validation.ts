import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  genre: z.string().trim().max(100).optional(),
  publishedYear: z.number().int().min(0).max(new Date().getFullYear() + 1).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

export const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  genre: z.string().trim().max(100).optional(),
  author: z.string().trim().max(200).optional(),
  minRating: z.number().int().min(1).max(5).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  weightTitle: z.number().min(0).max(10).optional(),
  weightAuthor: z.number().min(0).max(10).optional(),
  weightGenre: z.number().min(0).max(10).optional(),
  weightDescription: z.number().min(0).max(10).optional(),
  alpha: z.number().min(0).max(1).optional(),
});

export const autocompleteSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const browseSchema = z.object({
  genre: z.string().trim().max(100).optional(),
  author: z.string().trim().max(200).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
});
