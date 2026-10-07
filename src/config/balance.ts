/**
 * Every tunable number in HOLDOUT lives here (brief §7). Difficulty presets are multipliers applied on
 * top. Systems read balance through `getBalance(difficulty)` so presets never duplicate content.
 */
export type Difficulty = 'story' | 'survivor' | 'hardcore';

export const BALANCE = {
  time: {
    gameMinutesPerRealSecond: 1,
    startDay: 23,
    startHour: 8,
    nightStartHour: 21,
    nightEndHour: 5,
  },
  vision: {
    playerRadiusDay: 14,
    playerRadiusNight: 7,
    flashlightBonus: 6,
    flashlightConeDeg: 50,
    coneDeg: 140,
    rearRadiusFactor: 0.35,
    zombieSightDay: 10,
    zombieSightNight: 6,
    zombieSightFlashlightBonus: 4,
    zombieSightCrouchFactor: 0.6,
    zombieConeDeg: 120,
  },
  needs: {
    hungerHoursToEmpty: 50,
    thirstHoursToEmpty: 30,
    exertionMultiplier: 1.5,
    sleepMultiplier: 0.5,
    lowThreshold: 25,
    lowStaminaRegenPenalty: 0.3,
    starvingHpPerHour: 5,
    dehydratedHpPerHour: 8,
    wellFedThreshold: 85,
    wellFedRegenPerMinute: 0.25,
  },
  health: {
    maxHp: 100,
    maxStamina: 100,
    sprintStaminaPerSecond: 18,
    staminaRegenPerSecond: 22,
    staminaRegenDelay: 0.8,
    infectionChancePerHit: 0.05,
    infectionHoursToDeath: 72,
    antibioticsReduction: 40,
    bleedChancePerHit: 0.2,
    bleedHpPerMinute: 0.5,
    foodPoisoningHpPerMinute: 0.3,
    foodPoisoningMinutes: 120,
    sleepHealPerHour: 6,
  },
  speed: {
    walk: 3.5,
    sprint: 5.5,
    crouch: 2,
    aim: 2,
    encumbered: 2.2,
    walker: 1.5,
    runner: 5,
    bloater: 1,
    bloaterBoss: 1.2,
    screamer: 2.5,
    nightZombieSpeedMultiplier: 1.2,
  },
  zombies: {
    hitDamageMin: 8,
    hitDamageMax: 12,
    attackCooldown: 1.1,
    attackRange: 1.1,
    hearingBase: 1,
    investigateGiveUpSeconds: 12,
    searchSeconds: 8,
    repathIntervalSeconds: 0.5,
    sleepDistanceTiles: 40,
    nightDensityMultiplier: 1.6,
    nightRunnerShare: 0.5,
    dayRunnerShare: 0.15,
    regenPerDay: 0.35,
    doorBashDamage: 10,
    doorBashInterval: 1.5,
    separationRadius: 0.8,
  },
  combat: {
    sneakMultiplier: 3,
    staggerKnockback: 1.5,
    shoveStamina: 15,
    shoveRange: 1.6,
    shoveArcDeg: 110,
    shoveKnockback: 2.2,
    hitStopMs: 60,
    meleeFlashMs: 90,
    bloodDecalCap: 120,
    bloomMovePerSecond: 6,
    bloomPerShot: 4,
    bloomDecayPerSecond: 10,
    aimBloomFactor: 0.4,
  },
  noise: {
    crouch: 1.5,
    walk: 4,
    sprint: 8,
    glassMultiplier: 1.8,
    meleeHit: 5,
    pistol: 28,
    suppressed: 9,
    shotgun: 38,
    rifle: 45,
    crossbow: 3,
    crowbarLock: 12,
    bottleSmash: 14,
    carAlarm: 50,
    search: 3,
    doorOpen: 2,
    doorBash: 8,
    pipeBomb: 40,
    molotov: 10,
    footstepIntervalSeconds: 0.4,
  },
  search: {
    small: 2,
    medium: 3.5,
    large: 5,
    scavengingRankReduction: 0.08,
  },
  carry: {
    base: 20,
    encumberedSprintBlock: true,
  },
  trade: {
    sellMarkup: 1.4,
    buyRate: 0.55,
    wantedCategoryMultiplier: 1.4,
    junkMultiplier: 0.6,
    reputationMaxDiscount: 0.15,
    barterRankDiscount: 0.02,
    restockDays: 3,
    conditionFloor: 0.3,
  },
  travel: {
    footTilesPerMinute: 1,
    footMinutesPerKm: 15,
    vehicleMinutesPerKm: 2,
    fuelPerKm: 1.2,
    footEventChance: 0.35,
    vehicleEventChance: 0.1,
    maxFootKm: 6,
  },
  progression: {
    xpPerLevelBase: 100,
    xpPerLevelGrowth: 1.35,
    maxSkillRank: 5,
    killXp: { walker: 10, runner: 14, bloater: 40, bloater_boss: 200, screamer: 25 } as Record<string, number>,
    discoveryXp: 25,
    craftXp: 5,
  },
  crafting: {
    repairMaxDurabilityLoss: 0.08,
    dismantleReturnRate: 0.5,
    qualityPerBenchTier: 0.08,
    qualityPerCraftingRank: 0.04,
  },
  base: {
    rainCollectorMinutesPerUnit: 180,
    rainCollectorCapacity: 6,
    bedHealPerHour: 6,
  },
} as const;

export type BalanceConfig = typeof BALANCE;

/** Multipliers per difficulty. 1 = as configured above. */
export const DIFFICULTY_PRESETS: Record<
  Difficulty,
  {
    label: string;
    description: string;
    playerDamageTaken: number;
    zombieHp: number;
    zombieDensity: number;
    needsDrain: number;
    lootQuantity: number;
    infectionChance: number;
    durabilityWear: number;
  }
> = {
  story: {
    label: 'Story',
    description: 'Fewer, weaker zombies and slower needs. For the narrative.',
    playerDamageTaken: 0.6,
    zombieHp: 0.75,
    zombieDensity: 0.7,
    needsDrain: 0.7,
    lootQuantity: 1.3,
    infectionChance: 0.5,
    durabilityWear: 0.7,
  },
  survivor: {
    label: 'Survivor',
    description: 'The intended experience.',
    playerDamageTaken: 1,
    zombieHp: 1,
    zombieDensity: 1,
    needsDrain: 1,
    lootQuantity: 1,
    infectionChance: 1,
    durabilityWear: 1,
  },
  hardcore: {
    label: 'Hardcore',
    description: 'Scarce loot, hungry nights, every bite matters.',
    playerDamageTaken: 1.5,
    zombieHp: 1.25,
    zombieDensity: 1.3,
    needsDrain: 1.3,
    lootQuantity: 0.75,
    infectionChance: 1.5,
    durabilityWear: 1.3,
  },
};

export function difficultyOf(d: Difficulty) {
  return DIFFICULTY_PRESETS[d];
}
