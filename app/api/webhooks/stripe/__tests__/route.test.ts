import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "../route"

const { mockConstructEvent, mockRetrieveSubscription, mockStripeCtor } = vi.hoisted(() => {
  const mockConstructEvent = vi.fn()
  const mockRetrieveSubscription = vi.fn()
  const mockStripeCtor = vi.fn(function StripeMock() {
    return {
      webhooks: { constructEvent: mockConstructEvent },
      subscriptions: { retrieve: mockRetrieveSubscription },
    }
  })
  return { mockConstructEvent, mockRetrieveSubscription, mockStripeCtor }
})

vi.mock("stripe", () => ({
  default: mockStripeCtor,
}))

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock("@/lib/database/supabase-server", () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

const { mockBulkAddToDeliveryLog } = vi.hoisted(() => ({
  mockBulkAddToDeliveryLog: vi.fn(),
}))

vi.mock("@/lib/database/store-list-history-db", () => ({
  storeListHistoryDB: {
    bulkAddToDeliveryLog: mockBulkAddToDeliveryLog,
  },
}))

const makeRequest = (body = "{}", signature = "sig_test") =>
  new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  })

const createProfileUpdateChain = (eqMock = vi.fn().mockResolvedValue({ error: null })) => {
  const updateMock = vi.fn().mockReturnValue({
    eq: eqMock,
  })
  return {
    chain: { update: updateMock },
    updateMock,
    eqMock,
  }
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123"
  })

  it("returns 500 when webhook config is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({
      error:
        "Missing Stripe webhook configuration. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
    })
  })

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Missing stripe-signature header" })
  })

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching expected signature")
    })

    const res = await POST(makeRequest("{}"))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "No signatures found matching expected signature",
    })
  })

  it("handles checkout.session.completed and updates profile using supabase_user_id", async () => {
    const { chain, updateMock, eqMock } = createProfileUpdateChain()
    mockFrom.mockReturnValue(chain)
    mockBulkAddToDeliveryLog.mockResolvedValue([{ success: true, price_matched: true }])
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_123",
          customer: "cus_123",
          metadata: {
            supabase_user_id: "profile_123",
            clerk_user_id: "user_123",
            cart_items: JSON.stringify([
              { item_id: "i1", product_id: "p1", num_pkgs: 2, frontend_price: 10.5 },
            ]),
          },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_123",
      status: "active",
      customer: "cus_123",
      items: {
        data: [
          {
            current_period_start: 1735689600,
            current_period_end: 1738291200,
            price: { id: "price_123" },
          },
        ],
      },
    })

    const res = await POST(makeRequest('{"ok":true}'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(mockRetrieveSubscription).toHaveBeenCalledWith("sub_123")
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_tier: "premium",
        subscription_status: "active",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        stripe_price_id: "price_123",
      })
    )
    expect(eqMock).toHaveBeenCalledWith("id", "profile_123")
    expect(mockBulkAddToDeliveryLog).toHaveBeenCalledWith([
      { item_id: "i1", product_id: "p1", num_pkgs: 2, frontend_price: 10.5 },
    ])
  })

  it("handles customer.subscription.updated and updates by stripe_customer_id", async () => {
    const { chain, eqMock } = createProfileUpdateChain()
    mockFrom.mockReturnValue(chain)
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_456",
          status: "canceled",
          customer: "cus_456",
          items: {
            data: [
              {
                current_period_start: 1735689600,
                current_period_end: 1738291200,
                price: { id: "price_456" },
              },
            ],
          },
        },
      },
    })

    const res = await POST(makeRequest('{"ok":true}'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(eqMock).toHaveBeenCalledWith("stripe_customer_id", "cus_456")
  })

  it("accepts replayed checkout.session.completed webhook deliveries", async () => {
    const { chain, eqMock } = createProfileUpdateChain()
    mockFrom.mockReturnValue(chain)
    mockBulkAddToDeliveryLog.mockResolvedValue([{ success: true, price_matched: true }])
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_replay",
          customer: "cus_replay",
          metadata: {
            supabase_user_id: "profile_replay",
            cart_items: JSON.stringify([
              { item_id: "i1", product_id: "p1", num_pkgs: 1, frontend_price: 7.5 },
            ]),
          },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_replay",
      status: "active",
      customer: "cus_replay",
      items: {
        data: [
          {
            current_period_start: 1735689600,
            current_period_end: 1738291200,
            price: { id: "price_replay" },
          },
        ],
      },
    })

    const first = await POST(makeRequest('{"delivery":"1"}'))
    const second = await POST(makeRequest('{"delivery":"2"}'))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(mockRetrieveSubscription).toHaveBeenCalledTimes(2)
    expect(eqMock).toHaveBeenCalledTimes(2)
    expect(mockBulkAddToDeliveryLog).toHaveBeenCalledTimes(2)
  })

  it("continues successfully when cart_items metadata is malformed", async () => {
    const { chain, eqMock } = createProfileUpdateChain()
    mockFrom.mockReturnValue(chain)
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_bad_cart",
          customer: "cus_bad_cart",
          metadata: {
            supabase_user_id: "profile_bad_cart",
            cart_items: "{invalid-json",
          },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_bad_cart",
      status: "active",
      customer: "cus_bad_cart",
      items: {
        data: [
          {
            current_period_start: 1735689600,
            current_period_end: 1738291200,
            price: { id: "price_bad_cart" },
          },
        ],
      },
    })

    const res = await POST(makeRequest("{}"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(eqMock).toHaveBeenCalledWith("id", "profile_bad_cart")
    expect(mockBulkAddToDeliveryLog).not.toHaveBeenCalled()
  })

  it("returns 500 when event processing throws unexpectedly", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_boom",
          metadata: { supabase_user_id: "profile_1" },
          customer: "cus_1",
        },
      },
    })
    mockRetrieveSubscription.mockRejectedValue(new Error("stripe outage"))

    const res = await POST(makeRequest("{}"))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Webhook processing failed" })
  })
})
