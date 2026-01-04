import { env } from "@/lib/env"

const allowlistedRedirects = env.AUTH_REDIRECT_ALLOWLIST.map((value) => {
  try {
    return new URL(value)
  } catch {
    return new URL(value, env.NEXT_PUBLIC_APP_URL)
  }
})

function getBaseAppUrl(baseUrl?: string) {
  return new URL(baseUrl ?? env.NEXT_PUBLIC_APP_URL)
}

export function resolveRedirect(
  target: string | null | undefined,
  fallbackPath: string,
  baseUrl?: string,
): string {
  const baseAppUrl = getBaseAppUrl(baseUrl)

  if (!target) {
    return fallbackPath
  }

  try {
    if (target.startsWith("/api/auth")) {
      return fallbackPath
    }

    const resolved = new URL(target, baseAppUrl)

    if (resolved.origin === baseAppUrl.origin) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`
    }

    const isAllowed = allowlistedRedirects.some((allowedUrl) => {
      if (allowedUrl.href === resolved.href) {
        return true
      }

      return (
        allowedUrl.origin === resolved.origin &&
        resolved.pathname.startsWith(allowedUrl.pathname)
      )
    })

    if (isAllowed) {
      return resolved.toString()
    }
  } catch {
    return fallbackPath
  }

  return fallbackPath
}

export function buildRedirectUrl(
  target: string | null | undefined,
  fallbackPath: string,
  baseUrl?: string,
): string {
  const baseAppUrl = getBaseAppUrl(baseUrl)
  const resolved = resolveRedirect(target, fallbackPath, baseUrl)

  if (resolved.startsWith("http")) {
    return resolved
  }

  return new URL(resolved, baseAppUrl).toString()
}
