import { BaseTable } from "./base-db"
import type { Database } from "./supabase"
import type { DeliveryFeeBreakdown } from "@/lib/delivery/pricing"

type DeliveryOrderRow = Database["public"]["Tables"]["delivery_orders"]["Row"]
type DeliveryOrderInsert = Database["public"]["Tables"]["delivery_orders"]["Insert"]
type DeliveryOrderUpdate = Database["public"]["Tables"]["delivery_orders"]["Update"]

class DeliveryOrdersTable extends BaseTable<
  "delivery_orders",
  DeliveryOrderRow,
  DeliveryOrderInsert,
  DeliveryOrderUpdate
> {
  private static instance: DeliveryOrdersTable | null = null
  readonly tableName = "delivery_orders" as const

  private constructor() {
    super()
  }

  static getInstance(): DeliveryOrdersTable {
    if (!DeliveryOrdersTable.instance) {
      DeliveryOrdersTable.instance = new DeliveryOrdersTable()
    }
    return DeliveryOrdersTable.instance
  }

  async upsertOrderFees(
    orderId: string,
    userId: string,
    breakdown: DeliveryFeeBreakdown
  ): Promise<boolean> {
    const { error } = await this.supabase.from(this.tableName).upsert({
      id: orderId,
      user_id: userId,
      subtotal: breakdown.subtotal,
      flat_fee: breakdown.flatFee,
      basket_fee_rate: breakdown.basketFeeRate,
      basket_fee_amount: breakdown.basketFeeAmount,
      total_delivery_fee: breakdown.totalDeliveryFee,
      grand_total: breakdown.grandTotal,
      subscription_tier_at_checkout: breakdown.subscriptionTierAtCheckout,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      this.handleError(error, `upsertOrderFees(${orderId})`)
      return false
    }

    return true
  }

  async findByUserId(userId: string): Promise<DeliveryOrderRow[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      this.handleError(error, `findByUserId(${userId})`)
      return []
    }

    return data || []
  }

  async findById(orderId: string, userId: string): Promise<DeliveryOrderRow | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      this.handleError(error, `findById(${orderId})`)
      return null
    }

    return data
  }
}

export const deliveryOrdersDB = DeliveryOrdersTable.getInstance()
