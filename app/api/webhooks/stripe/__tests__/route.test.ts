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

// Helper: build a mock pending_cart_items select chain
const createPendingCartChain = (result: unknown) => ({
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(result),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
})

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

  it("handles checkout.session.completed: reads cart from pending_cart_items via cart_id", async () => {
    const { chain, updateMock, eqMock } = createProfileUpdateChain()
    const cartItems = [{ item_id: "i1", product_id: "p1", num_pkgs: 2, frontend_price: 10.5 }]
    const pendingCartSelectEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { items: cartItems, stripe_session_id: null },
        error: null,
      }),
    })
    const pendingCartUpdateEq = vi.fn().mockResolvedValue({ error: null })

    mockFrom
      .mockReturnValueOnce(chain)                    // profiles update
      .mockReturnValueOnce({                          // pending_cart_items select
        select: vi.fn().mockReturnValue({ eq: pendingCartSelectEq }),
      })
      .mockReturnValueOnce({                          // pending_cart_items update (mark consumed)
        update: vi.fn().mockReturnValue({ eq: pendingCartUpdateEq }),
      })
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
            cart_id: "pending-cart-uuid-1",
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
    expect(pendingCartSelectEq).toHaveBeenCalledWith("id", "pending-cart-uuid-1")
    expect(pendingCartUpdateEq).toHaveBeenCalledWith("id", "pending-cart-uuid-1")
    expect(mockBulkAddToDeliveryLog).toHaveBeenCalledWith(cartItems)
  })

  it("skips delivery log when pending cart is not found (expired or unknown cart_id)", async () => {
    const { chain, eqMock } = createProfileUpdateChain()
    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      })
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_notfound",
          customer: "cus_notfound",
          metadata: { supabase_user_id: "profile_notfound", cart_id: "missing-cart-id" },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_notfound",
      status: "active",
      customer: "cus_notfound",
      items: { data: [{ current_period_start: 0, current_period_end: 0, price: { id: "price_x" } }] },
    })

    const res = await POST(makeRequest("{}"))

    expect(res.status).toBe(200)
    expect(mockBulkAddToDeliveryLog).not.toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith("id", "profile_notfound")
  })

  it("skips bulkAddToDeliveryLog on webhook replay (pending cart already has stripe_session_id)", async () => {
    const { chain, eqMock } = createProfileUpdateChain()
    mockFrom
      .mockReturnValue(chain)
      // Override for pending_cart_items select on second call
    const pendingCartAlreadyConsumed = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { items: [], stripe_session_id: "ses_already_set" },
            error: null,
          }),
        }),
      }),
    }
    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(pendingCartAlreadyConsumed)
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_replay2",
          customer: "cus_replay2",
          metadata: { supabase_user_id: "profile_replay2", cart_id: "cart-replay-id" },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_replay2",
      status: "active",
      customer: "cus_replay2",
      items: { data: [{ current_period_start: 0, current_period_end: 0, price: { id: "price_r" } }] },
    })

    const res = await POST(makeRequest("{}"))

    expect(res.status).toBe(200)
    expect(mockBulkAddToDeliveryLog).not.toHaveBeenCalled()
  })

  it("falls back to legacy cart_items metadata when cart_id is absent", async () => {
    const { chain, eqMock } = createProfileUpdateChain()
    mockFrom.mockReturnValue(chain)
    const legacyItems = [{ item_id: "i1", product_id: "p1", num_pkgs: 1, frontend_price: 7.5 }]
    mockBulkAddToDeliveryLog.mockResolvedValue([{ success: true, price_matched: true }])
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_legacy",
          customer: "cus_legacy",
          metadata: {
            supabase_user_id: "profile_legacy",
            cart_items: JSON.stringify(legacyItems),
          },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_legacy",
      status: "active",
      customer: "cus_legacy",
      items: { data: [{ current_period_start: 0, current_period_end: 0, price: { id: "price_l" } }] },
    })

    const res = await POST(makeRequest("{}"))

    expect(res.status).toBe(200)
    expect(mockBulkAddToDeliveryLog).toHaveBeenCalledWith(legacyItems)
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

  it("accepts replayed checkout.session.completed webhook deliveries (idempotent via stripe_session_id)", async () => {
    const { chain, eqMock } = createProfileUpdateChain()

    // First delivery: pending cart not yet consumed
    const firstPendingCartSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { items: [{ item_id: "i1", product_id: "p1", num_pkgs: 1, frontend_price: 7.5 }], stripe_session_id: null },
            error: null,
          }),
        }),
      }),
    }
    const firstPendingCartUpdate = {
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }
    // Second delivery: pending cart already consumed
    const secondPendingCartSelect = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { items: [], stripe_session_id: "ses_replay" },
            error: null,
          }),
        }),
      }),
    }

    mockBulkAddToDeliveryLog.mockResolvedValue([{ success: true, price_matched: true }])

    const makeReplayEvent = () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          subscription: "sub_replay",
          customer: "cus_replay",
          metadata: { supabase_user_id: "profile_replay", cart_id: "cart-replay-uuid" },
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_replay",
      status: "active",
      customer: "cus_replay",
      items: { data: [{ current_period_start: 1735689600, current_period_end: 1738291200, price: { id: "price_replay" } }] },
    })

    // First delivery
    mockConstructEvent.mockReturnValueOnce(makeReplayEvent())
    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(firstPendingCartSelect)
      .mockReturnValueOnce(firstPendingCartUpdate)
    const first = await POST(makeRequest('{"delivery":"1"}'))

    // Second delivery (replay)
    mockConstructEvent.mockReturnValueOnce(makeReplayEvent())
    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(secondPendingCartSelect)
    const second = await POST(makeRequest('{"delivery":"2"}'))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(mockRetrieveSubscription).toHaveBeenCalledTimes(2)
    expect(eqMock).toHaveBeenCalledTimes(2)
    // bulkAddToDeliveryLog called only on first delivery, not the replay
    expect(mockBulkAddToDeliveryLog).toHaveBeenCalledTimes(1)
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
