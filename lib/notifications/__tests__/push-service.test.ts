import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendPushNotificationToRecipient } from "../push-service"

const {
  mockSetVapidDetails,
  mockSendNotification,
} = vi.hoisted(() => ({
  mockSetVapidDetails: vi.fn(),
  mockSendNotification: vi.fn(),
}))

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}))

function createProfileChain(result: any) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue(result),
      })),
    })),
  }
}

describe("sendPushNotificationToRecipient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BOr6Xv1public"
    process.env.VAPID_PRIVATE_KEY = "private-key"
    process.env.VAPID_SUBJECT = "mailto:notify@example.com"
  })

  it("sends push notifications to enabled recipients with subscriptions", async () => {
    mockSendNotification.mockResolvedValue(undefined)

    const db = {
      from: vi.fn((table: string) => {
        if (table === "profiles") return createProfileChain({ data: { id: "profile_1", notification_push_enabled: true }, error: null })
        if (table === "push_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [
                  {
                    id: "push_1",
                    endpoint: "https://push.test/1",
                    subscription: {
                      endpoint: "https://push.test/1",
                      keys: { auth: "auth", p256dh: "p256dh" },
                    },
                  },
                ],
                error: null,
              })),
            })),
            delete: vi.fn(),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    } as any

    const sent = await sendPushNotificationToRecipient(db, "profile_1", {
      title: "New like",
      body: "Someone liked your post",
      url: "https://app.secretsauce.test/dashboard#notifications",
      tag: "post_like",
    })

    expect(sent).toBe(1)
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:notify@example.com",
      "BOr6Xv1public",
      "private-key"
    )
    expect(mockSendNotification).toHaveBeenCalledTimes(1)
  })

  it("skips push delivery when the profile has push disabled", async () => {
    const db = {
      from: vi.fn(() => createProfileChain({ data: { id: "profile_1", notification_push_enabled: false }, error: null })),
    } as any

    const sent = await sendPushNotificationToRecipient(db, "profile_1", {
      title: "Weekly reminder",
      body: "Plan your meals",
      url: "https://app.secretsauce.test/meal-planner",
      tag: "meal_planner_weekly_reminder",
    })

    expect(sent).toBe(0)
    expect(mockSendNotification).not.toHaveBeenCalled()
  })
})
