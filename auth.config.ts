import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Github from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import { compare } from "bcryptjs"

import { getUserByEmail } from "@/data/user"
import { loginSchema } from "@/schemas"
import { env } from "@/lib/env"
import { db } from "@/lib/prisma"

const providers: NextAuthConfig["providers"] = []

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  providers.push(
    Github({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
      checks: ["state"],
    }),
  )
}

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
          access_type: "offline",
          prompt: "consent",
        },
      },
      checks: ["pkce", "state"],
    }),
  )
}

const secureCookies = new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:"
const baseCookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  secure: secureCookies,
}

providers.push(
  Credentials({
    name: "Credentials",
    async authorize(credentials) {
      const parsedCredentials = loginSchema.safeParse(credentials)

      if (!parsedCredentials.success) {
        return null
      }

      const { email, password } = parsedCredentials.data
      const user = await getUserByEmail(email)

      if (!user || !user.password) {
        return null
      }

      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        return null
      }

      const isPasswordValid = await compare(password, user.password)

      if (!isPasswordValid) {
        const updatedUser = await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: { increment: 1 },
          },
          select: {
            failedLoginAttempts: true,
          },
        })

        if (updatedUser.failedLoginAttempts >= env.AUTH_LOCKOUT_THRESHOLD) {
          await db.user.update({
            where: { id: user.id },
            data: {
              lockedUntil: new Date(Date.now() + env.AUTH_LOCKOUT_DURATION_MS),
              failedLoginAttempts: 0,
            },
          })
        }

        return null
      }

      if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        })
      }

      return user
    },
  }),
)

const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: env.AUTH_SECRET,
  providers,
  cookies: {
    sessionToken: {
      name: `${secureCookies ? "__Secure-" : ""}authjs.session-token`,
      options: {
        ...baseCookieOptions,
      },
    },
    callbackUrl: {
      name: `${secureCookies ? "__Secure-" : ""}authjs.callback-url`,
      options: {
        ...baseCookieOptions,
      },
    },
    csrfToken: {
      name: `${secureCookies ? "__Host-" : ""}authjs.csrf-token`,
      options: {
        ...baseCookieOptions,
      },
    },
    pkceCodeVerifier: {
      name: `${secureCookies ? "__Secure-" : ""}authjs.pkce.code_verifier`,
      options: {
        ...baseCookieOptions,
      },
    },
    state: {
      name: `${secureCookies ? "__Secure-" : ""}authjs.state`,
      options: {
        ...baseCookieOptions,
      },
    },
  },
}

export default authConfig
