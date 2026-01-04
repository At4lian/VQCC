import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"

import authConfig from "./auth.config"
import { db } from "./lib/prisma"
import { getAccountByUserId } from "./data/account"
import { getTwoFactorConfirmationByUserId } from "./data/two-factor-confirmation"
import { getUserById } from "./data/user"
import { DEFAULT_LOGIN_REDIRECT } from "./routes"
import { buildRedirectUrl } from "./lib/safe-redirect"

export const { auth, handlers, signIn, signOut } = NextAuth({
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  events: {
    async linkAccount({ user }) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() }
      })
    }
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.id) {
        return false
      }

      const existingUser = await getUserById(user.id)

      if (!existingUser) {
        return false
      }

      if (existingUser.lockedUntil && existingUser.lockedUntil > new Date()) {
        return false
      }

      if (account?.provider === "credentials") {
        if (!existingUser.emailVerified) {
          return false
        }
      }

      if (existingUser.isTwoFactorEnabled) {
        const twoFactorConfirmation =
          await getTwoFactorConfirmationByUserId(existingUser.id)

        // If not have a confirmation, block login
        if (!twoFactorConfirmation) return false

        // Delete two factor confirmation for next sign in
        await db.twoFactorConfirmation.delete({
          where: { userId: existingUser.id }
        })
      }

      return true
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
      }

      if (token.role && session.user) {
        session.user.role = token.role
      }

      if (session.user) {
        session.user.isTwoFactorEnabled = Boolean(token.isTwoFactorEnabled)
      }

      if (session.user) {
        if (typeof token.name === "string") {
          session.user.name = token.name
        }
        if (typeof token.email === "string") {
          session.user.email = token.email
        }
        session.user.isOAuth = Boolean(token.isOAuth)
      }

      return session
    },
    async jwt({ token }) {
      if (!token.sub) return token
      const existingUser = await getUserById(token.sub)

      if (!existingUser) return token

      const existingAccount = await getAccountByUserId(existingUser.id)

      token.isOAuth = !!existingAccount
      token.name = existingUser.name
      token.email = existingUser.email ?? token.email
      token.role = existingUser.role
      token.isTwoFactorEnabled = existingUser.isTwoFactorEnabled

      return token
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/api/auth")) {
        return new URL(url, baseUrl).toString()
      }

      return buildRedirectUrl(url, DEFAULT_LOGIN_REDIRECT, baseUrl)
    },
  },
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  ...authConfig,
})
