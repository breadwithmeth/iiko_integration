import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(24),
  IIKO_BASE_URL: z.string().url().default("https://api-ru.iiko.services/api"),
  IIKO_API_KEY: z.string().optional().default(""),
  IIKO_APP_ID: z.string().optional().default(""),
  IIKO_CLIENT_SECRET: z.string().optional().default(""),
  IIKO_ORGANIZATION_ID: z.string().optional().default(""),
  IIKO_TERMINAL_GROUP_ID: z.string().optional().default("")
});

export const env = envSchema.parse(process.env);
