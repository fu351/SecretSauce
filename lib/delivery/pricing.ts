import type { SubscriptionTier } from "@/hooks/use-subscription"

export interface DeliveryFeeRules {
  flatFee: number
  basketFeeRate: number
}

export interface DeliveryFeeBreakdown {
  subtotal: number
  flatFee: number
  basketFeeRate: number
  basketFeeAmount: number
  totalDeliveryFee: number
  grandTotal: number
  subscriptionTierAtCheckout: SubscriptionTier
}

const DELIVERY_FEE_RULES: Record<SubscriptionTier, DeliveryFeeRules> = {
  free: { flatFee: 6.99, basketFeeRate: 0.05 },
  premium: { flatFee: 4.99, basketFeeRate: 0.03 },
}

export function getDeliveryFeeRules(tier: SubscriptionTier): DeliveryFeeRules {
  return DELIVERY_FEE_RULES[tier]
}

export function calculateDeliveryFees(
  subtotal: number,
  tier: SubscriptionTier
): DeliveryFeeBreakdown {
  const rules = getDeliveryFeeRules(tier)
  const basketFeeAmount = Math.round(subtotal * rules.basketFeeRate * 100) / 100
  const totalDeliveryFee = Math.round((rules.flatFee + basketFeeAmount) * 100) / 100
  const grandTotal = Math.round((subtotal + totalDeliveryFee) * 100) / 100

  return {
    subtotal,
    flatFee: rules.flatFee,
    basketFeeRate: rules.basketFeeRate,
    basketFeeAmount,
    totalDeliveryFee,
    grandTotal,
    subscriptionTierAtCheckout: tier,
  }
}
