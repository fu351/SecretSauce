import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "../route"

const { mockAuth, mockGetUser, mockClerkClient } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockGetUser = vi.fn()
  const mockClerkClient = vi.fn(() => ({ users: { getUser: mockGetUser } }))
  return { mockAuth, mockGetUser, mockClerkClient }
})

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

const { mockCustomersCreate, mockSessionsCreate, mockStripeCtor } = vi.hoisted(() => {
  const mockCustomersCreate = vi.fn()
  const mockSessionsCreate = vi.fn()
  const mockStripeCtor = vi.fn(function StripeMock() {
    return {
      customers: { create: mockCustomersCreate },
      checkout: { sessions: { create: mockSessionsCreate } },
    }
  })
  return { mockCustomersCreate, mockSessionsCreate, mockStripeCtor }
})

vi.mock("stripe", () => ({
  default: mockStripeCtor,
}))

const createMaybeSingleChain = (result: unknown) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue(result),
    }),
  }),
})

const createSingleChain = (result: unknown) => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(result),
    }),
  }),
})

const createUpdateChain = (eqMock = vi.fn().mockResolvedValue({ data: null, error: null })) => ({
  update: vi.fn().mockReturnValue({
    eq: eqMock,
  }),
})

const createInsertSingleChain = (result: unknown) => ({
  insert: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(result),
    }),
  }),
})

const makeRequest = (body?: unknown) =>
  new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
  })

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockReset()
    mockGetUser.mockReset()
    mockFrom.mockReset()
    mockCustomersCreate.mockReset()
    mockSessionsCreate.mockReset()
    mockStripeCtor.mockClear()
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_PREMIUM_PRICE_ID = "price_test_123"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_123"
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com"
    process.env.NODE_ENV = "test"
    delete process.env.STRIPE_DISCOUNT_COUPON_ID
  })

  it("returns 500 when required configuration is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({
      error:
        "Missing configuration. Set STRIPE_SECRET_KEY, STRIPE_PREMIUM_PRICE_ID, and SUPABASE_SERVICE_ROLE_KEY.",
    })
  })

  it("returns 500 when service key is publishable", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_publishable_abc"

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({
      error:
        "SUPABASE_SERVICE_ROLE_KEY is invalid. Use the Supabase service_role secret key, not a publishable key.",
    })
  })

  it("returns 500 when STRIPE_PREMIUM_PRICE_ID is not a price id", async () => {
    process.env.STRIPE_PREMIUM_PRICE_ID = "prod_123"

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({
      error:
        "STRIPE_PREMIUM_PRICE_ID must be a Stripe Price ID (price_...), not a Product ID (prod_...).",
    })
  })

  it("returns 401 when no authenticated user is found", async () => {
    mockAuth.mockResolvedValue({ userId: null })

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized or missing linked profile" })
  })

  it("returns 400 for invalid pricing payload", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom.mockReturnValueOnce(
      createMaybeSingleChain({
        data: {
          id: "profile_1",
          email: "user@example.com",
          full_name: "Test User",
          stripe_customer_id: "cus_existing",
          clerk_user_id: "user_1",
        },
      })
    )

    const res = await POST(makeRequest({ totalAmount: -5 }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid pricing data" })
    expect(mockSessionsCreate).not.toHaveBeenCalled()
  })

  it("creates a Stripe customer, stores cart in DB, and applies discount for non-active subscribers", async () => {
    const updateStripeCustomerEq = vi.fn().mockResolvedValue({ data: null, error: null })

    process.env.STRIPE_DISCOUNT_COUPON_ID = "coupon_intro"
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom
      .mockReturnValueOnce(
        createMaybeSingleChain({
          data: {
            id: "profile_1",
            email: "user@example.com",
            full_name: "Jane Doe",
            stripe_customer_id: null,
            clerk_user_id: "user_1",
          },
        })
      )
      .mockReturnValueOnce(createUpdateChain(updateStripeCustomerEq))
      .mockReturnValueOnce(
        createSingleChain({
          data: {
            subscription_tier: null,
            subscription_expires_at: null,
          },
        })
      )
      // pending_cart_items insert
      .mockReturnValueOnce(
        createInsertSingleChain({ data: { id: "cart-uuid-1" }, error: null })
      )
    mockCustomersCreate.mockResolvedValue({ id: "cus_new_1" })
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_1" })

    const res = await POST(
      makeRequest({
        totalAmount: 42.5,
        itemCount: 3,
        cartItems: [
          { item_id: "i1", product_id: "p1", num_pkgs: 1, frontend_price: 12.99 },
          { item_id: "i2", product_id: "p2", num_pkgs: 2, frontend_price: 29.51 },
        ],
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/session_1" })
    expect(mockStripeCtor).toHaveBeenCalledWith("sk_test_123")
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "Jane Doe",
      metadata: {
        supabase_user_id: "profile_1",
        clerk_user_id: "user_1",
      },
    })
    expect(updateStripeCustomerEq).toHaveBeenCalledWith("id", "profile_1")

    const sessionConfig = mockSessionsCreate.mock.calls[0][0]
    expect(sessionConfig.customer).toBe("cus_new_1")
    expect(sessionConfig.discounts).toEqual([{ coupon: "coupon_intro" }])
    expect(sessionConfig.success_url).toBe(
      "https://app.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}"
    )
    expect(sessionConfig.cancel_url).toBe("https://app.example.com/checkout/cancel")
    expect(sessionConfig.metadata).toMatchObject({
      supabase_user_id: "profile_1",
      clerk_user_id: "user_1",
      total_amount: "42.5",
      item_count: "3",
      cart_id: "cart-uuid-1",
    })
    expect(sessionConfig.metadata.cart_items).toBeUndefined()
  })

  it("omits cart_id from metadata when pending_cart_items insert fails (graceful degradation)", async () => {
    mockAuth.mockResolvedValue({ userId: "user_err" })
    mockFrom
      .mockReturnValueOnce(
        createMaybeSingleChain({
          data: {
            id: "profile_err",
            email: "err@example.com",
            full_name: null,
            stripe_customer_id: "cus_err",
            clerk_user_id: "user_err",
          },
        })
      )
      .mockReturnValueOnce(
        createSingleChain({
          data: { subscription_tier: null, subscription_expires_at: null },
        })
      )
      // pending_cart_items insert fails
      .mockReturnValueOnce(
        createInsertSingleChain({ data: null, error: { message: "DB error" } })
      )
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/degraded" })

    const res = await POST(
      makeRequest({
        cartItems: [{ item_id: "i1", product_id: "p1", num_pkgs: 1, frontend_price: 5.0 }],
      })
    )

    expect(res.status).toBe(200)
    const sessionConfig = mockSessionsCreate.mock.calls[0][0]
    expect(sessionConfig.metadata.cart_id).toBeUndefined()
    expect(sessionConfig.metadata.cart_items).toBeUndefined()
  })

  it("reuses existing Stripe customer and skips discount for active subscribers", async () => {
    process.env.STRIPE_DISCOUNT_COUPON_ID = "coupon_intro"
    mockAuth.mockResolvedValue({ userId: "user_active" })
    mockFrom
      .mockReturnValueOnce(
        createMaybeSingleChain({
          data: {
            id: "profile_active",
            email: "active@example.com",
            full_name: "Active User",
            stripe_customer_id: "cus_existing",
            clerk_user_id: "user_active",
          },
        })
      )
      .mockReturnValueOnce(
        createSingleChain({
          data: {
            subscription_tier: "premium",
            subscription_expires_at: "2999-01-01T00:00:00.000Z",
          },
        })
      )
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_existing" })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/session_existing" })
    expect(mockCustomersCreate).not.toHaveBeenCalled()

    const sessionConfig = mockSessionsCreate.mock.calls[0][0]
    expect(sessionConfig.customer).toBe("cus_existing")
    expect(sessionConfig.discounts).toBeUndefined()
  })

  it("falls back to email identity, links clerk id, and stores cart in DB", async () => {
    const linkClerkEq = vi.fn().mockResolvedValue({ data: null, error: null })

    mockAuth.mockResolvedValue({ userId: "user_fallback" })
    mockGetUser.mockResolvedValue({
      primaryEmailAddressId: "email_1",
      emailAddresses: [{ id: "email_1", emailAddress: "fallback@example.com" }],
    })
    mockFrom
      .mockReturnValueOnce(createMaybeSingleChain({ data: null }))
      .mockReturnValueOnce(
        createMaybeSingleChain({
          data: {
            id: "profile_email",
            email: "fallback@example.com",
            full_name: "Fallback User",
            stripe_customer_id: "cus_fallback",
            clerk_user_id: null,
          },
        })
      )
      .mockReturnValueOnce(createUpdateChain(linkClerkEq))
      .mockReturnValueOnce(
        createSingleChain({
          data: {
            subscription_tier: null,
            subscription_expires_at: null,
          },
        })
      )
      // pending_cart_items insert
      .mockReturnValueOnce(
        createInsertSingleChain({ data: { id: "cart-fallback-1" }, error: null })
      )
    mockSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_fallback" })

    const res = await POST(
      makeRequest({
        cartItems: [{ item_id: "i1", product_id: "p1", num_pkgs: 1, frontend_price: 9.99 }],
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/session_fallback" })
    expect(linkClerkEq).toHaveBeenCalledWith("id", "profile_email")

    const sessionConfig = mockSessionsCreate.mock.calls[0][0]
    expect(sessionConfig.metadata.clerk_user_id).toBe("user_fallback")
    expect(sessionConfig.metadata.cart_id).toBe("cart-fallback-1")
    expect(sessionConfig.metadata.cart_items).toBeUndefined()
  })

  it("returns 500 with details when Stripe checkout creation throws", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1" })
    mockFrom
      .mockReturnValueOnce(
        createMaybeSingleChain({
          data: {
            id: "profile_1",
            email: "user@example.com",
            full_name: "Test User",
            stripe_customer_id: "cus_existing",
            clerk_user_id: "user_1",
          },
        })
      )
      .mockReturnValueOnce(
        createSingleChain({
          data: {
            subscription_tier: null,
            subscription_expires_at: null,
          },
        })
      )
    mockSessionsCreate.mockRejectedValue(new Error("stripe unavailable"))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: "Failed to create checkout session",
      details: "stripe unavailable",
    })
  })
})
