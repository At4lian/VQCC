"use client"

import { Suspense, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

import { login } from "@/actions/login"
import { LoginSchema, loginSchema } from "@/schemas"
import { zodResolver } from "@hookform/resolvers/zod"

import { AuthCard } from "@/components/auth-card"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { FieldDescription } from "@/components/ui/field"
import { FormError } from "./form-error"
import { FormSuccess } from "./form-success"

export function LoginForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginFormContent />
    </Suspense>
  )
}

function LoginFormContent() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl")
  const urlError =
    searchParams.get("error") === "OAuthAccountNotLinked"
      ? "Email already in use with different provider!"
      : ""

  const [showTwoFactor, setShowTwoFactor] = useState(false)
  const [error, setError] = useState<string | undefined>("")
  const [success, setSuccess] = useState<string | undefined>("")
  const [pending, startTransition] = useTransition()

  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      code: "",
    },
  })

  function onLoginSubmit(values: LoginSchema) {
    setError("")
    setSuccess("")

    startTransition(() => {
      login(values, callbackUrl)
        .then((data) => {
          if (data?.error) {
            form.reset()
            setError(data.error)
          }

          if (data?.success) {
            form.reset()
            setSuccess(data?.success)
          }

          if (data?.twoFactor) {
            setShowTwoFactor(true)
          }
        })
        .catch(() => setError("Something went wrong!"))
    })
  }

  return (
    <AuthCard
      title={showTwoFactor ? "Check your authenticator" : "Welcome back"}
      description={
        showTwoFactor
          ? "Enter the 6-digit code from your authenticator app."
          : "Sign in with your email and password to continue."
      }
      footer={
        <>
          <FieldDescription className="text-center text-xs leading-relaxed text-muted-foreground">
            By continuing, you agree to our
            {" "}
            <Link className="underline underline-offset-4" href="#">
              Terms of Service
            </Link>{" "}
            and
            {" "}
            <Link className="underline underline-offset-4" href="#">
              Privacy Policy
            </Link>
            .
          </FieldDescription>
          <div className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </div>
        </>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onLoginSubmit)} className="space-y-6">
          <div className="space-y-4">
            {showTwoFactor ? (
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Two-factor code</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="123456"
                        disabled={pending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="example@email.com"
                          disabled={pending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          disabled={pending}
                          {...field}
                        />
                      </FormControl>
                      <div className="flex justify-end">
                        <Link
                          href="/auth/reset"
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
          <div className="space-y-3">
            <FormError message={error || urlError} />
            <FormSuccess message={success} />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {showTwoFactor ? "Confirm code" : "Sign in"}
          </Button>
        </form>
      </Form>
    </AuthCard>
  )
}
