import { z } from "zod";

const YOUTUBE_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

function isYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return YOUTUBE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export const newVideoSchema = z.object({
  youtubeUrl: z
    .string()
    .url("Enter a valid URL")
    .refine(isYoutubeUrl, "Must be a youtube.com or youtu.be URL"),
});

export const clipUpdateSchema = z
  .object({
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
  })
  .refine((d) => d.endSeconds > d.startSeconds, {
    message: "endSeconds must be greater than startSeconds",
  });

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
