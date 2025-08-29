'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth, SignUpData } from '@/lib/auth/auth-context'

function SignupContent() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    recoveryEmail: "",
    phoneNumber: "",
    userCategory: "" as "Provider" | "coder" | "",
    npi: "",
    affiliatedInstitutions: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [availableInstitutions, setAvailableInstitutions] = useState<{id: string, name: string}[]>([])
  const [institutionsLoading, setInstitutionsLoading] = useState(true)
  const router = useRouter()
  const { signUp } = useAuth()

  // Load available institutions
  useEffect(() => {
    const fetchInstitutions = async () => {
      setInstitutionsLoading(true)
      try {
        const response = await fetch('/api/institutions')
        if (!response.ok) {
          throw new Error('Failed to fetch institutions')
        }
        const data = await response.json()
        setAvailableInstitutions(data)
      } catch (error) {
        console.error('Error fetching institutions:', error)
        setErrors((prev) => ({ ...prev, affiliatedInstitutions: "Could not load institutions." }))
      } finally {
        setInstitutionsLoading(false)
      }
    }

    fetchInstitutions()
  }, [])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }


  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.firstName.trim()) newErrors.firstName = "First name is required"
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required"
    if (!formData.email.trim()) newErrors.email = "Email is required"
    if (!formData.password.trim()) newErrors.password = "Password is required"
    if (!formData.confirmPassword.trim()) newErrors.confirmPassword = "Please confirm your password"
    if (!formData.userCategory) newErrors.userCategory = "User category is required"

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (formData.email && !emailRegex.test(formData.email)) {
      newErrors.email = "Please enter a valid email address"
    }

    // Password validation
    if (formData.password && formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters long"
    }

    // Password confirmation
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
    }

    // NPI validation for providers
    if (formData.userCategory === "Provider" && !formData.npi.trim()) {
      newErrors.npi = "NPI is required for providers"
    }

    // Phone number validation (basic)
    if (formData.phoneNumber && !/^\+?[\d\s\-\(\)]{10,}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Please enter a valid phone number"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)
    setSuccessMessage(null)

    try {
      const userData: SignUpData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        userCategory: formData.userCategory as "Provider" | "coder",
        npi: formData.userCategory === "Provider" ? formData.npi : undefined,
        recoveryEmail: formData.recoveryEmail || undefined,
        phoneNumber: formData.phoneNumber || undefined,
        affiliatedInstitutions: formData.affiliatedInstitutions ? [formData.affiliatedInstitutions] : undefined,
      }

      const { error } = await signUp()

      if (error) {
        console.error("[Signup] Error signing up:", error)
        setErrors({ submit: error.message })
      } else {
        setSuccessMessage("Account created successfully! Please check your email for verification instructions.")
        // Clear form
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          confirmPassword: "",
          recoveryEmail: "",
          phoneNumber: "",
          userCategory: "",
          npi: "",
          affiliatedInstitutions: '',
        })
      }
    } catch (err) {
      console.error("[Signup] Exception during sign up:", err)
      setErrors({ submit: "An unexpected error occurred. Please try again." })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center mb-6 pt-4">
          <button
            onClick={() => router.push('/auth/login')}
            className="rounded-full mr-4 px-3 py-2 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-gray-600 font-medium"
            aria-label="Go back to login page"
          >
            ← Back
          </button>
          <div className="text-2xl font-bold text-gray-900">
            Oxkair Platform
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="text-center py-6 px-6 border-b border-gray-100">
            <h1 className="text-2xl font-semibold text-gray-900">Create Account</h1>
            <p className="text-gray-600 text-sm mt-1">Faster Coding, Smarter Billing</p>
            <p className="text-gray-500 text-xs mt-2">Note: Non-HIPAA Compliant, please see our Pro version</p>
          </div>

          <div className="p-6">
            {errors.submit && (
              <div className="rounded-md bg-red-50 p-4 mb-4 border border-red-200">
                <div className="text-sm text-red-700">{errors.submit}</div>
              </div>
            )}

            {successMessage && (
              <div className="rounded-md bg-green-50 p-4 mb-4 border border-green-200">
                <div className="text-sm text-green-700">{successMessage}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                    First Name *
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    aria-describedby={errors.firstName ? "firstName-error" : undefined}
                    aria-invalid={!!errors.firstName}
                  />
                  {errors.firstName && (
                    <span id="firstName-error" className="text-red-600 text-xs">
                      {errors.firstName}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                    Last Name *
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    aria-describedby={errors.lastName ? "lastName-error" : undefined}
                    aria-invalid={!!errors.lastName}
                  />
                  {errors.lastName && (
                    <span id="lastName-error" className="text-red-600 text-xs">
                      {errors.lastName}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email *
                </label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  aria-describedby={errors.email ? "email-error" : undefined}
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <span id="email-error" className="text-red-600 text-xs">
                    {errors.email}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  aria-describedby={errors.password ? "password-error" : undefined}
                  aria-invalid={!!errors.password}
                />
                {errors.password && (
                  <span id="password-error" className="text-red-600 text-xs">
                    {errors.password}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password *
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                  aria-invalid={!!errors.confirmPassword}
                />
                {errors.confirmPassword && (
                  <span id="confirmPassword-error" className="text-red-600 text-xs">
                    {errors.confirmPassword}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="userCategory" className="block text-sm font-medium text-gray-700">
                  User Category *
                </label>
                <select
                  id="userCategory"
                  value={formData.userCategory}
                  onChange={(e) => handleInputChange("userCategory", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                >
                  <option value="">Select Category</option>
                  <option value="Provider">Provider</option>
                  <option value="coder">coder</option>
                </select>
                {errors.userCategory && (
                  <span className="text-red-600 text-xs">{errors.userCategory}</span>
                )}
              </div>

              {formData.userCategory === "Provider" && (
                <div className="space-y-2 transition-all duration-300 ease-in-out">
                  <label htmlFor="npi" className="block text-sm font-medium text-gray-700">
                    NPI Number *
                  </label>
                  <input
                    id="npi"
                    type="text"
                    value={formData.npi}
                    onChange={(e) => handleInputChange("npi", e.target.value)}
                    placeholder="National Provider Identifier"
                    className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    aria-describedby={errors.npi ? "npi-error" : undefined}
                    aria-invalid={!!errors.npi}
                  />
                  {errors.npi && (
                    <span id="npi-error" className="text-red-600 text-xs">
                      {errors.npi}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="recoveryEmail" className="block text-sm font-medium text-gray-700">
                  Recovery Email
                </label>
                <input
                  id="recoveryEmail"
                  type="email"
                  value={formData.recoveryEmail}
                  onChange={(e) => handleInputChange("recoveryEmail", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
                  Phone Number
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  aria-describedby={errors.phoneNumber ? "phoneNumber-error" : undefined}
                  aria-invalid={!!errors.phoneNumber}
                />
                {errors.phoneNumber && (
                  <span id="phoneNumber-error" className="text-red-600 text-xs">
                    {errors.phoneNumber}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="affiliatedInstitutions" className="block text-sm font-medium text-gray-700">
                  Affiliated Institution
                </label>
                <select
                  id="affiliatedInstitutions"
                  value={formData.affiliatedInstitutions}
                  onChange={(e) => handleInputChange("affiliatedInstitutions", e.target.value)}
                  className="w-full px-3 py-3 border border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                  disabled={institutionsLoading}
                >
                  <option value="">{institutionsLoading ? "Loading..." : "Select Institution"}</option>
                  {availableInstitutions.map((institution) => (
                    <option key={institution.id} value={institution.id}>
                      {institution.name}
                    </option>
                  ))}
                </select>
                {errors.affiliatedInstitutions && (
                  <span className="text-red-600 text-xs">{errors.affiliatedInstitutions}</span>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-medium py-3 px-4 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 transition-colors duration-200 mt-6"
              >
                {isLoading ? "Creating Account..." : "Sign Up"}
              </button>
            </form>

            <div className="text-center mt-4">
              <Link href="/auth/login" className="text-sm text-blue-600 hover:text-blue-500">
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <SignupContent />
    </Suspense>
  )
}