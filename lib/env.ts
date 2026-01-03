import { z } from "zod"

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string(),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    AUTH_REDIRECT_ALLOWLIST: z.string().optional(),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_WINDOW: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
    AUTH_LOCKOUT_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    AUTH_LOCKOUT_DURATION: z.coerce
      .number()
      .int()
      .positive()
      .default(900),
    AWS_REGION: z.string().min(1),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET_NAME: z.string().min(1),
    CRON_SECRET: z.string().min(1),
  })
  .superRefine((currentEnv, ctx) => {
   const providerPairs: Array<[keyof typeof currentEnv, keyof typeof currentEnv]> = [
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ]

    for (const [idKey, secretKey] of providerPairs) {
      const hasId = Boolean(currentEnv[idKey])
      const hasSecret = Boolean(currentEnv[secretKey])

      if (hasId !== hasSecret) {
        ctx.addIssue({
          path: [hasId ? secretKey : idKey],
          code: z.ZodIssueCode.custom,
          message: `Both ${idKey} and ${secretKey} must be provided together`,
        })
      }
    }

    const hasResendKey = Boolean(currentEnv.RESEND_API_KEY)
    const hasResendFrom = Boolean(currentEnv.RESEND_FROM_EMAIL)

    if (hasResendKey !== hasResendFrom) {
      ctx.addIssue({
        path: [hasResendKey ? "RESEND_FROM_EMAIL" : "RESEND_API_KEY"],
        code: z.ZodIssueCode.custom,
        message: "RESEND_API_KEY and RESEND_FROM_EMAIL must be provided together",
      })
    }
  })

type RawEnv = z.infer<typeof envSchema>

type NormalisedEnv = Omit<RawEnv, "AUTH_REDIRECT_ALLOWLIST" | "AUTH_RATE_LIMIT_WINDOW" | "AUTH_LOCKOUT_DURATION"> & {
  AUTH_REDIRECT_ALLOWLIST: string[]
  AUTH_RATE_LIMIT_WINDOW_MS: number
  AUTH_LOCKOUT_DURATION_MS: number
}

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const envError = z.treeifyError(parsedEnv.error)
  console.error("Invalid environment variables", envError)
  throw new Error("Invalid environment variables")
}

const raw = parsedEnv.data

const normalisedRedirectAllowlist = raw.AUTH_REDIRECT_ALLOWLIST
  ? raw.AUTH_REDIRECT_ALLOWLIST.split(",").map((value) => value.trim()).filter(Boolean)
  : []

export const env: NormalisedEnv = {
  ...raw,
  AUTH_REDIRECT_ALLOWLIST: normalisedRedirectAllowlist,
  AUTH_RATE_LIMIT_WINDOW_MS: raw.AUTH_RATE_LIMIT_WINDOW * 1000,
  AUTH_LOCKOUT_DURATION_MS: raw.AUTH_LOCKOUT_DURATION * 1000,
}

export type Env = typeof env
