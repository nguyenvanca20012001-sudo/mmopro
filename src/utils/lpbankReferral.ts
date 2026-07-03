export const LPBANK_REFERRAL_TIER_REWARDS = [100000, 110000, 120000] as const // lần 1, 2, 3
export const LPBANK_REFERRAL_MAX_TIER_REWARD = 150000 // lần 4 trở đi

export function getLpbankReferralRewardByCount(successCountBefore: number): number {
  const nextNumber = successCountBefore + 1
  if (nextNumber === 1) return LPBANK_REFERRAL_TIER_REWARDS[0]
  if (nextNumber === 2) return LPBANK_REFERRAL_TIER_REWARDS[1]
  if (nextNumber === 3) return LPBANK_REFERRAL_TIER_REWARDS[2]
  return LPBANK_REFERRAL_MAX_TIER_REWARD
}
