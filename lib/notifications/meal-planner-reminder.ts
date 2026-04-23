import { endOfWeek, format, startOfWeek } from "date-fns"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database/supabase"
import { sendPushNotificationToRecipient } from "@/lib/notifications/push-service"

type MealScheduleRow = Database["public"]["Tables"]["meal_schedule"]["Row"]

type MealPlannerReminderRecipientRow = {
  id: string
  email: string
  full_name: string | null
  meal_planner_weekly_reminder_enabled: boolean
}

type MealPlannerReminderLogRow = {
  id: string
  sent_at: string | null
}

type MealPlanSummary = {
  plannedMealCount: number
  plannedDayCount: number
  breakfast: number
  lunch: number
  dinner: number
}

type ReminderBucket = {
  recipient: MealPlannerReminderRecipientRow
  summary: MealPlanSummary
}

function emptySummary(): MealPlanSummary {
  return {
    plannedMealCount: 0,
    plannedDayCount: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  }
}

function buildSummary(rows: MealScheduleRow[]): MealPlanSummary {
  const summary = emptySummary()
  const plannedDates = new Set<string>()

  for (const row of rows) {
    plannedDates.add(row.date)
    summary.plannedMealCount += 1
    if (row.meal_type === "breakfast") summary.breakfast += 1
    if (row.meal_type === "lunch") summary.lunch += 1
    if (row.meal_type === "dinner") summary.dinner += 1
  }

  summary.plannedDayCount = plannedDates.size
  return summary
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
}

function buildMealPlannerReminderEmail(params: {
  recipientName: string
  summary: MealPlanSummary
  weekStartDate: string
  weekEndDate: string
  plannerUrl: string
}): { subject: string; text: string; html: string } {
  const { recipientName, summary, weekStartDate, weekEndDate, plannerUrl } = params
  const subject = "Plan your meals for this week"
  const hasMeals = summary.plannedMealCount > 0
  const intro = hasMeals
    ? `You have ${summary.plannedMealCount} meals planned across ${summary.plannedDayCount} day${summary.plannedDayCount === 1 ? "" : "s"}.`
    : "Your meal plan is still empty for this week."
  const text = [
    `Weekly meal planning reminder for ${recipientName}`,
    `Week: ${weekStartDate} - ${weekEndDate}`,
    intro,
    `Breakfast: ${summary.breakfast}`,
    `Lunch: ${summary.lunch}`,
    `Dinner: ${summary.dinner}`,
    "",
    `Open meal planner: ${plannerUrl}`,
  ].join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 12px 0">Plan your meals for this week</h1>
      <p style="margin:0 0 12px 0">Hi ${escapeHtml(recipientName)}, ${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 0;color:#444">Week</td><td style="padding:4px 0;text-align:right;font-weight:600">${escapeHtml(weekStartDate)} - ${escapeHtml(weekEndDate)}</td></tr>
        <tr><td style="padding:4px 0;color:#444">Breakfast</td><td style="padding:4px 0;text-align:right;font-weight:600">${summary.breakfast}</td></tr>
        <tr><td style="padding:4px 0;color:#444">Lunch</td><td style="padding:4px 0;text-align:right;font-weight:600">${summary.lunch}</td></tr>
        <tr><td style="padding:4px 0;color:#444">Dinner</td><td style="padding:4px 0;text-align:right;font-weight:600">${summary.dinner}</td></tr>
      </table>
      <p style="margin:0"><a href="${plannerUrl}">Open your meal planner</a></p>
    </div>
  `

  return { subject, text, html }
}

async function sendDigestEmail(params: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.NOTIFICATIONS_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    console.warn("[meal-planner-reminders] missing RESEND_API_KEY or NOTIFICATIONS_FROM_EMAIL; skipping email send")
    return false
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    console.error("[meal-planner-reminders] resend send failed:", response.status, body)
    return false
  }

  return true
}

function groupMealRowsByRecipient(rows: Array<MealScheduleRow & { profiles?: MealPlannerReminderRecipientRow | null }>) {
  const map = new Map<string, MealScheduleRow[]>()
  for (const row of rows) {
    if (!row.user_id) continue
    const existing = map.get(row.user_id)
    if (existing) {
      existing.push(row)
      continue
    }
    map.set(row.user_id, [row])
  }
  return map
}

export async function sendWeeklyMealPlannerReminders(
  db: SupabaseClient<Database>,
  options?: { now?: Date }
): Promise<{ recipientsProcessed: number; remindersSent: number }> {
  const now = options?.now ?? new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const weekStartDate = format(weekStart, "yyyy-MM-dd")
  const weekEndDate = format(weekEnd, "yyyy-MM-dd")
  const plannerUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/meal-planner`

  const [{ data: profileRows, error: profileError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
    db
      .from("profiles")
      .select("id, email, full_name, meal_planner_weekly_reminder_enabled")
      .eq("meal_planner_weekly_reminder_enabled", true),
    db
      .from("meal_schedule")
      .select("user_id, date, meal_type")
      .gte("date", weekStartDate)
      .lte("date", weekEndDate),
  ])

  if (profileError) {
    console.error("[meal-planner-reminders] failed to load profiles:", profileError)
    return { recipientsProcessed: 0, remindersSent: 0 }
  }
  if (scheduleError) {
    console.error("[meal-planner-reminders] failed to load meal schedule:", scheduleError)
    return { recipientsProcessed: 0, remindersSent: 0 }
  }

  const recipients = ((profileRows ?? []) as MealPlannerReminderRecipientRow[]).filter(
    (row) => row.meal_planner_weekly_reminder_enabled && typeof row.email === "string" && row.email.length > 0
  )
  const schedulesByUser = groupMealRowsByRecipient((scheduleRows ?? []) as MealScheduleRow[])

  let remindersSent = 0

  for (const recipient of recipients) {
    const rows = schedulesByUser.get(recipient.id) ?? []
    const summary = buildSummary(rows)

    const { data: existing, error: lookupError } = await db
      .from("meal_planner_weekly_reminders")
      .select("id, sent_at")
      .eq("recipient_id", recipient.id)
      .eq("reminder_week_start", weekStartDate)
      .eq("reminder_week_end", weekEndDate)
      .maybeSingle()

    if (lookupError) {
      console.error("[meal-planner-reminders] failed to check send log:", lookupError)
      continue
    }

    let reminderLogId = (existing as MealPlannerReminderLogRow | null)?.id ?? null
    if (!existing) {
      const insertResult = await db
        .from("meal_planner_weekly_reminders")
        .insert({
          recipient_id: recipient.id,
          reminder_week_start: weekStartDate,
          reminder_week_end: weekEndDate,
          planned_meal_count: summary.plannedMealCount,
          planned_day_count: summary.plannedDayCount,
        })
        .select("id")
        .single()

      if (insertResult.error) {
        console.error("[meal-planner-reminders] failed to create send log:", insertResult.error)
        continue
      }

      reminderLogId = insertResult.data.id
    } else if (existing.sent_at) {
      continue
    }

    const displayName = recipient.full_name ?? recipient.email
    const intro = summary.plannedMealCount > 0
      ? `You have ${summary.plannedMealCount} meals planned across ${summary.plannedDayCount} day${summary.plannedDayCount === 1 ? "" : "s"} this week.`
      : "Your meal plan is still empty for this week."

    void sendPushNotificationToRecipient(db, recipient.id, {
      title: "Plan your meals for this week",
      body: intro,
      url: plannerUrl,
      tag: "meal_planner_weekly_reminder",
    })

    const { subject, text, html } = buildMealPlannerReminderEmail({
      recipientName: displayName,
      summary,
      weekStartDate,
      weekEndDate,
      plannerUrl,
    })

    const sent = await sendDigestEmail({
      to: recipient.email,
      subject,
      text,
      html,
    })

    if (!sent || !reminderLogId) {
      continue
    }

    const { error: updateError } = await db
      .from("meal_planner_weekly_reminders")
      .update({
        sent_at: new Date().toISOString(),
        planned_meal_count: summary.plannedMealCount,
        planned_day_count: summary.plannedDayCount,
      })
      .eq("id", reminderLogId)

    if (updateError) {
      console.error("[meal-planner-reminders] failed to finalize send log:", updateError)
      continue
    }

    remindersSent += 1
  }

  return { recipientsProcessed: recipients.length, remindersSent }
}
