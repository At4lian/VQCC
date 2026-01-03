"use client"

import { Suspense, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

import { newPassword } from "@/actions/new-password"
import { NewPasswordSchema, newPasswordSchema } from "@/schemas"
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
import { FormError } from "@/components/form-error"
import { FormSuccess } from "@/components/form-success"

function NewPasswordFormContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [error, setError] = useState<string | undefined>(token ? undefined : "Missing token!")
  const [success, setSuccess] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  const form = useForm<NewPasswordSchema>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: {
      password: "",
    },
  })

  function onSubmit(values: NewPasswordSchema) {
    if (!token) {
      setError("Missing token!")
      return
    }

    setError(undefined)
    setSuccess(undefined)

    startTransition(() => {
      newPassword(values, token)
        .then((data) => {
          setError(data.error)
          setSuccess(data.success)
        })
        .catch(() => setError("Something went wrong!"))
    })
  }

  return (
    <AuthCard
      title="Create a new password"
      description="Choose a strong password to secure your account."
      footer={
        <Link
          href="/auth/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Return to login
        </Link>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Enter a new password"
                    disabled={pending || !token}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="space-y-3">
            <FormError message={error} />
            <FormSuccess message={success} />
          </div>
          <Button type="submit" disabled={pending || !token} className="w-full">
            Update password
          </Button>
        </form>
      </Form>
    </AuthCard>
  )
}

export function NewPasswordForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewPasswordFormContent />
    </Suspense>
  )
}
