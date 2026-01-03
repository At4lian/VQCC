"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { BeatLoader } from "react-spinners"

import { newVerification } from "@/actions/new-verification"

import { AuthCard } from "@/components/auth-card"
import { FormError } from "@/components/form-error"
import { FormSuccess } from "@/components/form-success"

function NewVerificationFormContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState<string | undefined>()

  useEffect(() => {
    if (!token) {
      return
    }

    newVerification(token)
      .then((data) => {
        setSuccess(data.success)
        setError(data.error)
      })
      .catch(() => {
        setError("Something went wrong!")
      })
  }, [token])

  if (!token) {
    return (
      <AuthCard
        title="Confirming your verification"
        description="We&apos;re validating your email address."
        footer={
          <Link
            href="/auth/login"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to login
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <FormError message="Missing token!" />
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Confirming your verification"
      description="We&apos;re validating your email address."
      footer={
        <Link
          href="/auth/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to login
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {!success && !error ? <BeatLoader /> : null}
        <FormSuccess message={success} />
        <FormError message={error} />
      </div>
    </AuthCard>
  )
}

export function NewVerificationForm() {
  return (
    <Suspense fallback={<BeatLoader />}>
      <NewVerificationFormContent />
    </Suspense>
  )
}
