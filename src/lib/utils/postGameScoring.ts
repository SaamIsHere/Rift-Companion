import type {
  PostGameMatch,
  PostGameTeam,
  PostGameParticipant,
  PostGameBadge,
  BadgeTier,
  Role,
  GameModeType,
  TimelineEvent,
  TimelineFramePoint,
  PostGameTimeline,
} from "../types";
import { queueNameFromId } from "./ddragon";

export function detectGameMode(queueId?: number, rawMode?: string): GameModeType {
  const mode = (rawMode || "").toUpperCase();
  if (queueId === 450 || mode === "ARAM") {
    return "aram";
  }
  if (queueId === 1700 || queueId === 1710 || mode === "CHERRY" || mode === "ARENA") {
    return "arena";
  }
  return "classic";
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Evaluates individual player badges based on in-depth match stats.
 */
function assignBadges(
  p: PostGameParticipant,
  team: { totalKills: number; totalDamage: number; totalGold: number; totalDamageTaken: number },
  matchMax: {
    damage: number;
    dpm: number;
    csPerMin: number;
    visionPerMin: number;
    visionScore: number;
    goldPerMin: number;
    tanked: number;
    objectiveDamage: number;
    ccTime: number;
    ccScore: number;
  },
  durationMinutes: number,
  isWinningTeam: boolean,
  modeType: GameModeType = "classic"
): PostGameBadge[] {
  const badges: PostGameBadge[] = [];

  // --- 1. TIERED PERFORMANCE BADGES ---

  // A. High DPS / Damage Dealer
  if (p.totalDamage === matchMax.damage || p.dpm >= 1000) {
    badges.push({
      id: "high_dps_gold",
      name: "High DPS",
      category: "damage",
      tier: "gold",
      icon: "🔥",
      description: "Highest damage dealt in the entire game or >1,000 damage/min.",
      valueDisplay: `${p.totalDamage.toLocaleString()} Dmg (${Math.round(p.dpm)}/m)`,
      isHighlight: true,
      priority: 55,
    });
  } else if (p.damageShare >= 0.32 || p.dpm >= 800) {
    badges.push({
      id: "high_dps_silver",
      name: "High DPS",
      category: "damage",
      tier: "silver",
      icon: "🔥",
      description: "Outstanding damage share (>32% of team) or >800 DPM.",
      valueDisplay: `${p.totalDamage.toLocaleString()} Dmg (${Math.round(p.damageShare * 100)}%)`,
      priority: 35,
    });
  } else if (p.damageShare >= 0.25 || p.dpm >= 650) {
    badges.push({
      id: "high_dps_bronze",
      name: "Solid DPS",
      category: "damage",
      tier: "bronze",
      icon: "🔥",
      description: "Strong damage contribution (>25% of team damage).",
      valueDisplay: `${Math.round(p.damageShare * 100)}% Dmg`,
      priority: 20,
    });
  }

  // B. CS Machine (carries/laners & jungle, not support - only in Summoner's Rift)
  if (modeType === "classic" && p.role !== "support") {
    if (p.csPerMin >= 9.0) {
      badges.push({
        id: "cs_machine_gold",
        name: "CS Machine",
        category: "farming",
        tier: "gold",
        icon: "🌾",
        description: "Exceptional CS farming with over 9.0 CS per minute.",
        valueDisplay: `${p.csPerMin} CS/m`,
        isHighlight: true,
        priority: 53,
      });
    } else if (p.csPerMin >= 7.8) {
      badges.push({
        id: "cs_machine_silver",
        name: "CS Master",
        category: "farming",
        tier: "silver",
        icon: "🌾",
        description: "Very strong minion farming with over 7.8 CS per minute.",
        valueDisplay: `${p.csPerMin} CS/m`,
        priority: 33,
      });
    } else if (p.csPerMin >= 6.5) {
      badges.push({
        id: "cs_machine_bronze",
        name: "Good CS",
        category: "farming",
        tier: "bronze",
        icon: "🌾",
        description: "Solid last-hitting with over 6.5 CS per minute.",
        valueDisplay: `${p.csPerMin} CS/m`,
        priority: 18,
      });
    }
  }

  // C. Vision Lord / Map Control (only in Summoner's Rift)
  if (modeType === "classic") {
    const isSupp = p.role === "support";
    const visionThresholdGold = isSupp ? 2.5 : 1.8;
    const visionThresholdSilver = isSupp ? 1.9 : 1.3;
    const visionThresholdBronze = isSupp ? 1.4 : 0.9;

    if (p.visionPerMin >= visionThresholdGold || (p.visionScore === matchMax.visionScore && p.visionScore >= 35)) {
      badges.push({
        id: "vision_lord_gold",
        name: "Vision Lord",
        category: "vision",
        tier: "gold",
        icon: "👁️",
        description: `Exceptional vision control: achieved ≥${visionThresholdGold} Vision/min (or match-leading ≥35).`,
        valueDisplay: `${p.visionScore} Vision (${p.visionPerMin}/m)`,
        isHighlight: isSupp,
        priority: 51,
      });
    } else if (p.visionPerMin >= visionThresholdSilver) {
      badges.push({
        id: "vision_lord_silver",
        name: "Vision Master",
        category: "vision",
        tier: "silver",
        icon: "👁️",
        description: `Strong vision control and denial: achieved ≥${visionThresholdSilver} Vision/min.`,
        valueDisplay: `${p.visionScore} Vision (${p.visionPerMin}/m)`,
        priority: 31,
      });
    } else if (p.visionPerMin >= visionThresholdBronze && p.controlWardsBought >= 2) {
      badges.push({
        id: "vision_lord_bronze",
        name: "Warden",
        category: "vision",
        tier: "bronze",
        icon: "👁️",
        description: `Solid vision support: achieved ≥${visionThresholdBronze} Vision/min and bought ≥2 Control Wards.`,
        valueDisplay: `${p.controlWardsBought} Control Wards (${p.visionScore} Vision)`,
        priority: 16,
      });
    }
  }

  // D. Team Player / Kill Participation (KP%)
  if (p.killParticipation >= 0.75 && team.totalKills >= 8) {
    badges.push({
      id: "team_player_gold",
      name: "Team Player",
      category: "combat",
      tier: "gold",
      icon: "🤝",
      description: "Immense teamfight presence with ≥75% kill participation.",
      valueDisplay: `${Math.round(p.killParticipation * 100)}% KP`,
      isHighlight: true,
      priority: 54,
    });
  } else if (p.killParticipation >= 0.62 && team.totalKills >= 8) {
    badges.push({
      id: "team_player_silver",
      name: "Team Anchor",
      category: "combat",
      tier: "silver",
      icon: "🤝",
      description: "High teamfight involvement (≥62% KP).",
      valueDisplay: `${Math.round(p.killParticipation * 100)}% KP`,
      priority: 34,
    });
  } else if (p.killParticipation >= 0.50 && team.totalKills >= 8) {
    badges.push({
      id: "team_player_bronze",
      name: "Team Assist",
      category: "combat",
      tier: "bronze",
      icon: "🤝",
      description: "Solid presence in team skirmishes (≥50% KP).",
      valueDisplay: `${Math.round(p.killParticipation * 100)}% KP`,
      priority: 19,
    });
  }

  // E. Iron Wall / Tank & Damage Absorber (scales with game length & team share)
  const tankedTotal = p.damageTaken + p.damageSelfMitigated;
  const tankedPerMin = tankedTotal / durationMinutes;
  const tankedShare = team.totalDamageTaken > 0 ? p.damageTaken / team.totalDamageTaken : 0.2;

  if (tankedPerMin >= 1600 && tankedTotal >= 25000 && p.deaths <= 5) {
    badges.push({
      id: "iron_wall_gold",
      name: "Iron Wall",
      category: "defense",
      tier: "gold",
      icon: "🛡️",
      description: "Absorbed and mitigated enormous damage with high efficiency (≥1,600/min with ≤5 deaths).",
      valueDisplay: `${(tankedTotal / 1000).toFixed(1)}k Defended (${Math.round(tankedPerMin)}/m)`,
      isHighlight: true,
      priority: 52,
    });
  } else if ((tankedPerMin >= 1300 && tankedTotal >= 22000) || (tankedShare >= 0.28 && tankedTotal >= 20000)) {
    badges.push({
      id: "iron_wall_silver",
      name: "Damage Sponge",
      category: "defense",
      tier: "silver",
      icon: "🛡️",
      description: "Reliable frontline absorbing heavy damage (≥1,300/min or ≥28% of team damage taken).",
      valueDisplay: `${(tankedTotal / 1000).toFixed(1)}k Defended (${Math.round(tankedPerMin)}/m)`,
      priority: 32,
    });
  } else if (tankedPerMin >= 950 && tankedTotal >= 15000) {
    badges.push({
      id: "iron_wall_bronze",
      name: "Frontline",
      category: "defense",
      tier: "bronze",
      icon: "⛰️",
      description: "Solid frontline durability (≥950 damage taken & mitigated/min).",
      valueDisplay: `${(tankedTotal / 1000).toFixed(1)}k Defended`,
      priority: 17,
    });
  }

  // F. CC Disruptor (calculated with CC Score instead of total slow duration)
  const ccScorePerMin = p.timeCCingOthers / durationMinutes;
  if (
    (p.timeCCingOthers >= 50 && ccScorePerMin >= 1.5) ||
    (p.timeCCingOthers === matchMax.ccScore && p.timeCCingOthers >= 35)
  ) {
    badges.push({
      id: "cc_disruptor_gold",
      name: "CC Overlord",
      category: "combat",
      tier: "gold",
      icon: "⚡",
      description: "Locked down enemy champions with an exceptional Crowd Control Score (≥1.5 CC/min or match-leading ≥35).",
      valueDisplay: `${Math.round(p.timeCCingOthers)} CC Score`,
      priority: 50,
    });
  } else if (p.timeCCingOthers >= 30 && ccScorePerMin >= 1.0) {
    badges.push({
      id: "cc_disruptor_silver",
      name: "Crowd Control",
      category: "combat",
      tier: "silver",
      icon: "⚡",
      description: "Strong crowd control contribution against enemy champions (≥1.0 CC score/min).",
      valueDisplay: `${Math.round(p.timeCCingOthers)} CC Score`,
      priority: 30,
    });
  }

  // G. Gold Hoarder / Economy
  if (p.goldPerMin >= 550 || p.goldEarned === matchMax.goldPerMin * durationMinutes) {
    badges.push({
      id: "gold_hoarder_gold",
      name: "Gold Hoarder",
      category: "farming",
      tier: "gold",
      icon: "💰",
      description: "Massive gold generation (>550 Gold/min).",
      valueDisplay: `${(p.goldEarned / 1000).toFixed(1)}k Gold`,
      priority: 49,
    });
  } else if (p.goldPerMin >= 460) {
    badges.push({
      id: "gold_hoarder_silver",
      name: "Wealthy Carry",
      category: "farming",
      tier: "silver",
      icon: "💰",
      description: "Above average wealth generation (>460 Gold/min).",
      valueDisplay: `${(p.goldEarned / 1000).toFixed(1)}k Gold`,
      priority: 29,
    });
  }

  // --- 2. SPECIAL ACHIEVEMENTS & MILESTONES ---

  // Pentakill
  if (p.largestMultiKill >= 5) {
    badges.push({
      id: "achievement_pentakill",
      name: "PENTAKILL",
      category: "special",
      tier: "gold",
      icon: "👑",
      description: "Eliminated all 5 enemy champions in rapid succession!",
      valueDisplay: "5 Kills",
      isHighlight: true,
      priority: 100,
    });
  } else if (p.largestMultiKill === 4) {
    badges.push({
      id: "achievement_quadrakill",
      name: "Quadrakill",
      category: "special",
      tier: "gold",
      icon: "⚔️",
      description: "Scored 4 kills in rapid succession.",
      valueDisplay: "4 Kills",
      priority: 90,
    });
  }

  // Unkillable / The Immortal
  if (p.deaths === 0 && durationMinutes >= 15) {
    badges.push({
      id: "achievement_unkillable",
      name: "The Immortal",
      category: "special",
      tier: "gold",
      icon: "🏆",
      description: "Zero deaths throughout the entire match!",
      valueDisplay: "0 Deaths",
      isHighlight: true,
      priority: 95,
    });
  } else if (p.deaths === 1 && durationMinutes >= 25 && p.kda >= 8.0) {
    badges.push({
      id: "achievement_flawless",
      name: "Near Flawless",
      category: "special",
      tier: "silver",
      icon: "⭐",
      description: "Near-flawless match with only a single death.",
      valueDisplay: "1 Death",
      priority: 68,
    });
  }

  // First Blood
  if (p.firstBloodKill) {
    badges.push({
      id: "achievement_first_blood",
      name: "First Blood",
      category: "special",
      tier: "silver",
      icon: "🎯",
      description: "Secured the first blood of the match!",
      valueDisplay: "1st Kill",
      priority: 80,
    });
  }

  // Tower Demolisher / Splitpusher (Summoner's Rift & ARAM)
  if (modeType !== "arena" && (p.turretKills >= 4 || (p.turretDamage >= 12000 && p.turretKills >= 2) || p.turretDamage >= 16000)) {
    badges.push({
      id: "achievement_demolisher",
      name: "Wrecking Ball",
      category: "objective",
      tier: "silver",
      icon: "🏰",
      description: "Demolished enemy structures (destroyed ≥4 turrets or dealt ≥12k structure damage).",
      valueDisplay: `${p.turretKills} Turrets (${(p.turretDamage / 1000).toFixed(1)}k)`,
      priority: 70,
    });
  }

  // Monster Hunter / Objective Slayer (only Summoner's Rift)
  if (modeType === "classic") {
    const objThreshold = Math.max(14000, Math.round(durationMinutes * 450));
    if (p.objectiveDamage >= objThreshold && p.objectiveDamage >= matchMax.objectiveDamage * 0.7) {
      badges.push({
        id: "achievement_monster_hunter",
        name: "Monster Hunter",
        category: "objective",
        tier: "gold",
        icon: "🐉",
        description: `Primary slayer of epic monsters: dealt ≥${(objThreshold / 1000).toFixed(1)}k objective damage (Dragons/Baron/Herald) as top contributor.`,
        valueDisplay: `${(p.objectiveDamage / 1000).toFixed(1)}k Obj Dmg`,
        priority: 75,
      });
    }
  }

  // Rampage / Killing Spree
  if (p.largestKillingSpree >= 7) {
    badges.push({
      id: "achievement_rampage",
      name: "Rampage",
      category: "combat",
      tier: "gold",
      icon: "🩸",
      description: `Rampant killing spree of ${p.largestKillingSpree} kills without dying.`,
      valueDisplay: `${p.largestKillingSpree} Spree`,
      priority: 85,
    });
  }

  // Jungle Invader (only Summoner's Rift)
  if (modeType === "classic" && p.role === "jungle" && p.enemyJungleCS >= 16) {
    badges.push({
      id: "achievement_invader",
      name: "Jungle Invader",
      category: "farming",
      tier: "silver",
      icon: "🥷",
      description: "Dominated enemy territory and stole opposing jungle camps.",
      valueDisplay: `${p.enemyJungleCS} Counter-CS`,
      priority: 65,
    });
  }

  // Ward Hunter (scales with game duration - only Summoner's Rift)
  if (modeType === "classic") {
    const wardKilledThreshold = Math.max(4, Math.round(durationMinutes * 0.25));
    if (p.wardsKilled >= wardKilledThreshold) {
      badges.push({
        id: "achievement_ward_hunter",
        name: "Ward Hunter",
        category: "vision",
        tier: "bronze",
        icon: "🕵️",
        description: `Cleared enemy vision by destroying ≥${wardKilledThreshold} wards (scales with match length).`,
        valueDisplay: `${p.wardsKilled} Wards Cleared`,
        priority: 60,
      });
    }
  }

  // --- 3. FUN & IRONIC BADGES ---
  if (p.totalDamage < 3500 && durationMinutes >= 20 && p.role !== "support") {
    badges.push({
      id: "fun_pacifist",
      name: "Pacifist",
      category: "fun",
      tier: "bronze",
      icon: "🕊️",
      description: "Extremely peaceful – minimal damage dealt to enemy champions.",
      valueDisplay: "<3.5k Dmg",
      priority: 9,
    });
  } else {
    const deathThreshold = Math.max(7, Math.min(10, Math.floor(durationMinutes / 3.5)));
    if (p.dpm >= 750 && p.deaths >= deathThreshold) {
      badges.push({
        id: "fun_glass_cannon",
        name: "Glass Cannon",
        category: "fun",
        tier: "bronze",
        icon: "💣",
        description: `High damage output (≥750 DPM), but high vulnerability (≥${deathThreshold} deaths).`,
        valueDisplay: `${Math.round(p.dpm)} DPM / ${p.deaths} Deaths`,
        priority: 10,
      });
    }
  }

  // --- 4. ARAM SPECIFIC BADGES ---
  if (modeType === "aram") {
    // A. Abyss Legend
    if (isWinningTeam && p.rank === 1) {
      badges.push({
        id: "aram_abyss_legend",
        name: "Abyss Legend",
        category: "special",
        tier: "gold",
        icon: "❄️",
        description: "Match MVP on the Howling Abyss with dominant teamfight execution.",
        valueDisplay: `Score ${p.overallScore.toFixed(1)}`,
        isHighlight: true,
        priority: 95,
      });
    }

    // B. Brawler (high damage output + massive frontline soaking)
    const tanked = p.damageTaken + p.damageSelfMitigated;
    if (p.dpm >= 1100 && tanked >= 25000) {
      badges.push({
        id: "aram_brawler_gold",
        name: "Brawler",
        category: "combat",
        tier: "gold",
        icon: "⚔️",
        description: "Relentless bridge combatant dealing ≥1,100 DPM and absorbing ≥25k damage.",
        valueDisplay: `${Math.round(p.dpm)} DPM • ${(tanked / 1000).toFixed(1)}k Defended`,
        isHighlight: true,
        priority: 68,
      });
    } else if (p.dpm >= 900 && tanked >= 18000) {
      badges.push({
        id: "aram_brawler_silver",
        name: "Brawler",
        category: "combat",
        tier: "silver",
        icon: "⚔️",
        description: "Constant bridge combatant with high damage and frontline presence.",
        valueDisplay: `${Math.round(p.dpm)} DPM • ${(tanked / 1000).toFixed(1)}k Defended`,
        priority: 45,
      });
    }

    // C. Teamfight Anchor (overwhelming Kill Participation in 5v5 skirmishes)
    if (p.killParticipation >= 0.80 && team.totalKills >= 15) {
      badges.push({
        id: "aram_teamfight_anchor_gold",
        name: "Teamfight Anchor",
        category: "combat",
        tier: "gold",
        icon: "⚓",
        description: "Central pillar of teamfights on the Abyss with ≥80% kill participation.",
        valueDisplay: `${Math.round(p.killParticipation * 100)}% KP`,
        isHighlight: true,
        priority: 70,
      });
    } else if (p.killParticipation >= 0.72 && team.totalKills >= 15) {
      badges.push({
        id: "aram_teamfight_anchor_silver",
        name: "Teamfight Pillar",
        category: "combat",
        tier: "silver",
        icon: "⚓",
        description: "Strong teamfight involvement on the Howling Abyss with ≥72% KP.",
        valueDisplay: `${Math.round(p.killParticipation * 100)}% KP`,
        priority: 48,
      });
    }

    // D. Snowball Sniper (Mark / Dash spell ID 32)
    const hasSnowball = (p.spells || []).includes(32);
    if (hasSnowball && (p.kills >= 10 || p.killParticipation >= 0.65)) {
      badges.push({
        id: "aram_snowball_sniper",
        name: "Snowball Sniper",
        category: "special",
        tier: "silver",
        icon: "🎯",
        description: "Deadly Mark/Dash initiations and follow-through on the Howling Abyss.",
        valueDisplay: `${p.kills} Kills (${Math.round(p.killParticipation * 100)}% KP)`,
        priority: 52,
      });
    }

    // E. Abyss Medic (vital health sustain)
    if (p.totalHeal >= 10000 || (p.totalHeal >= 6000 && p.totalHeal >= matchMax.damage * 0.35)) {
      badges.push({
        id: "aram_abyss_medic",
        name: "Abyss Medic",
        category: "defense",
        tier: "silver",
        icon: "💚",
        description: "Critical health sustain and healing in a fountain-locked battlefield.",
        valueDisplay: `${(p.totalHeal / 1000).toFixed(1)}k Healed`,
        priority: 50,
      });
    }

    // F. Siege Ram (turret destruction on the bridge)
    if (p.turretDamage >= 5000 || (p.turretDamage >= 3000 && p.turretDamage === matchMax.objectiveDamage)) {
      badges.push({
        id: "aram_siege_ram",
        name: "Siege Ram",
        category: "objective",
        tier: "gold",
        icon: "🏰",
        description: "Decisive bridge pusher shattering enemy turrets and inhibitors.",
        valueDisplay: `${(p.turretDamage / 1000).toFixed(1)}k Turret Dmg`,
        priority: 62,
      });
    }
  }

  // --- 5. ARENA SPECIFIC BADGES ---
  if (modeType === "arena") {
    // A. Arena Champion / Podium
    if (isWinningTeam && p.rank <= 2) {
      badges.push({
        id: "arena_champion",
        name: "Arena Champion",
        category: "special",
        tier: "gold",
        icon: "👑",
        description: "Finished 1st place in the Rings of Wrath arena!",
        valueDisplay: "1st Place",
        isHighlight: true,
        priority: 98,
      });
    } else if (p.rank <= 4) {
      badges.push({
        id: "arena_podium",
        name: "Podium Finisher",
        category: "special",
        tier: "silver",
        icon: "🥈",
        description: "Secured a top placement in the Rings of Wrath arena.",
        valueDisplay: `Rank #${p.rank}`,
        priority: 65,
      });
    }

    // B. Gladiator
    if (p.totalDamage === matchMax.damage || p.dpm >= 1200) {
      badges.push({
        id: "arena_gladiator",
        name: "Gladiator",
        category: "combat",
        tier: "gold",
        icon: "⚔️",
        description: "Highest damage dealer in the arena rings.",
        valueDisplay: `${p.totalDamage.toLocaleString()} Dmg`,
        isHighlight: true,
        priority: 72,
      });
    }

    // C. Juggernaut
    const tanked = p.damageTaken + p.damageSelfMitigated;
    if (tanked === matchMax.tanked || tanked >= 28000) {
      badges.push({
        id: "arena_juggernaut",
        name: "Juggernaut",
        category: "defense",
        tier: "gold",
        icon: "🛡️",
        description: "Unmatched survivability and damage mitigation in the arena.",
        valueDisplay: `${(tanked / 1000).toFixed(1)}k Mitigated`,
        priority: 66,
      });
    }

    // D. Round Dominator
    if (p.largestKillingSpree >= 4 || p.largestMultiKill >= 2) {
      badges.push({
        id: "arena_round_dominator",
        name: "Round Dominator",
        category: "combat",
        tier: "silver",
        icon: "🥊",
        description: "Dominating arena rounds with multiple eliminations in quick succession.",
        valueDisplay: `${p.largestKillingSpree} Round Spree`,
        priority: 58,
      });
    }
  }

  // Sort Gold first, then Silver, then Bronze, then priority
  return sortBadgesByTier(badges);
}

const TIER_WEIGHT: Record<string, number> = {
  gold: 3,
  silver: 2,
  bronze: 1,
};

/**
 * Sorts badges hierarchically: Gold first, then Silver, then Bronze.
 * Within the same tier, badges are ordered by priority descending.
 */
export function sortBadgesByTier(badges: PostGameBadge[]): PostGameBadge[] {
  return [...badges].sort((a, b) => {
    const tierA = TIER_WEIGHT[a.tier ?? "bronze"] ?? 0;
    const tierB = TIER_WEIGHT[b.tier ?? "bronze"] ?? 0;
    if (tierB !== tierA) {
      return tierB - tierA;
    }
    return (b.priority ?? 0) - (a.priority ?? 0);
  });
}

/**
 * Calculates balanced 0-10 sub-scores and overall performance rating for a player.
 */
function calculatePlayerRating(
  p: PostGameParticipant,
  team: { totalKills: number; totalDamage: number; totalGold: number; totalDamageTaken: number },
  matchMax: {
    damage: number;
    dpm: number;
    csPerMin: number;
    visionPerMin: number;
    goldPerMin: number;
    tanked: number;
    objectiveDamage: number;
    ccTime: number;
  },
  durationMinutes: number,
  modeType: GameModeType = "classic"
): {
  overallScore: number;
  scoreCombat: number;
  scoreDamage: number;
  scoreFarming: number;
  scoreVision: number;
  scoreObjective: number;
} {
  // --- ARAM SCORING ENGINE ---
  if (modeType === "aram") {
    // 1. Combat Score (35% weight: KDA + high KP expectations in 5v5 bridge fights)
    const kdaPts = clamp((p.kda / 3.8) * 6.5, 1.0, 9.5);
    const kpPts = clamp((p.killParticipation / 0.80) * 7.5, 1.0, 10.0);
    let combatBonus = 0;
    if (p.largestMultiKill >= 5) combatBonus += 1.5;
    else if (p.largestMultiKill === 4) combatBonus += 1.0;
    else if (p.largestMultiKill === 3) combatBonus += 0.5;
    if (p.firstBloodKill) combatBonus += 0.5;
    if (p.largestKillingSpree >= 6) combatBonus += 0.5;
    const combatScore = clamp(round1(0.45 * kdaPts + 0.55 * kpPts + combatBonus), 1.0, 10.0);

    // 2. Damage & Combat Impact Score (35% weight: DPM + team share + frontlining)
    const dmgPts = clamp((p.damageShare / 0.26) * 7.5, 1.0, 10.0);
    const dpmPts = clamp((p.dpm / 1000) * 7.5, 1.0, 10.0);
    const tanked = p.damageTaken + p.damageSelfMitigated;
    const defensePts = clamp((tanked / Math.max(1, matchMax.tanked)) * 8.0, 1.0, 10.0);
    const damageScore = clamp(round1(0.40 * dmgPts + 0.35 * dpmPts + 0.25 * defensePts), 1.0, 10.0);

    // 3. Farming & Economy Score (15% weight: 5 players sharing 1 lane wave, baseline 4.5 CS/min)
    const csScore = clamp((p.csPerMin / 4.5) * 7.5, 1.0, 10.0);
    const goldPts = clamp((p.goldShare / 0.22) * 7.0, 1.0, 10.0);
    const farmingScore = clamp(round1(0.5 * csScore + 0.5 * goldPts), 1.0, 10.0);

    // 4. Vision Score (0% weight: no wards on the Howling Abyss)
    const visionScore = 5.0;

    // 5. Structure / Objective Score (15% weight: bridge pushing & turret demolition)
    const turretPts = clamp((p.turretDamage / 4500) * 7.0 + p.turretKills * 1.0, 1.0, 10.0);
    const objectiveScore = clamp(round1(turretPts), 1.0, 10.0);

    let overall = 0.35 * combatScore + 0.35 * damageScore + 0.15 * farmingScore + 0.15 * objectiveScore;
    if (p.win) {
      overall += 0.35;
    }
    const overallScore = clamp(round1(overall), 1.0, 10.0);

    return {
      overallScore,
      scoreCombat: combatScore,
      scoreDamage: damageScore,
      scoreFarming: farmingScore,
      scoreVision: visionScore,
      scoreObjective: objectiveScore,
    };
  }

  // --- ARENA SCORING ENGINE ---
  if (modeType === "arena") {
    // 1. Combat Score (50% weight)
    const kdaPts = clamp((p.kda / 3.0) * 7.0, 1.0, 10.0);
    let combatBonus = 0;
    if (p.largestMultiKill >= 2) combatBonus += 1.0;
    if (p.firstBloodKill) combatBonus += 0.5;
    if (p.largestKillingSpree >= 4) combatBonus += 0.5;
    const combatScore = clamp(round1(kdaPts + combatBonus), 1.0, 10.0);

    // 2. Damage Impact (35% weight)
    const dmgPts = clamp((p.totalDamage / Math.max(1, matchMax.damage)) * 8.5, 1.0, 10.0);
    const dpmPts = clamp((p.dpm / 1200) * 8.0, 1.0, 10.0);
    const damageScore = clamp(round1(0.6 * dmgPts + 0.4 * dpmPts), 1.0, 10.0);

    // 3. Defense & Tanking (15% weight)
    const tanked = p.damageTaken + p.damageSelfMitigated;
    const defenseScore = clamp(round1((tanked / Math.max(1, matchMax.tanked)) * 8.5), 1.0, 10.0);

    let overall = 0.50 * combatScore + 0.35 * damageScore + 0.15 * defenseScore;
    if (p.win) {
      overall += 0.45;
    }
    const overallScore = clamp(round1(overall), 1.0, 10.0);

    return {
      overallScore,
      scoreCombat: combatScore,
      scoreDamage: damageScore,
      scoreFarming: 5.0,
      scoreVision: 5.0,
      scoreObjective: defenseScore,
    };
  }

  // --- SUMMONER'S RIFT CLASSIC SCORING ENGINE ---
  // 1. COMBAT SCORE (25% weight)
  let kdaVal = p.kda;
  let kdaPts = clamp((kdaVal / 4.5) * 6.5, 1.0, 9.5);
  let kpPts = clamp((p.killParticipation / 0.7) * 7.5, 1.0, 10.0);
  let combatBonus = 0;
  if (p.largestMultiKill >= 5) combatBonus += 1.5;
  else if (p.largestMultiKill === 4) combatBonus += 1.0;
  else if (p.largestMultiKill === 3) combatBonus += 0.5;
  if (p.firstBloodKill) combatBonus += 0.5;
  if (p.largestKillingSpree >= 6) combatBonus += 0.5;

  const combatScore = clamp(round1(0.5 * kdaPts + 0.5 * kpPts + combatBonus), 1.0, 10.0);

  // 2. DAMAGE / COMBAT IMPACT SCORE (25% weight)
  const isTankOrSupport = p.role === "support" || p.role === "top";
  let dmgPts = clamp((p.damageShare / 0.28) * 7.5, 1.0, 10.0);
  let dpmPts = clamp((p.dpm / 800) * 7.5, 1.0, 10.0);

  let defensePts = 0;
  if (isTankOrSupport) {
    const tanked = p.damageTaken + p.damageSelfMitigated;
    defensePts = clamp((tanked / Math.max(1, matchMax.tanked)) * 8.5, 1.0, 10.0);
  }

  const damageScore = clamp(
    round1(isTankOrSupport ? 0.4 * dmgPts + 0.3 * dpmPts + 0.3 * defensePts : 0.5 * dmgPts + 0.5 * dpmPts),
    1.0,
    10.0
  );

  // 3. FARMING & ECONOMY SCORE (20% weight)
  let csScore = 5.0;
  if (p.role === "adc" || p.role === "mid") {
    csScore = clamp((p.csPerMin / 8.5) * 8.0, 1.0, 10.0);
  } else if (p.role === "top") {
    csScore = clamp((p.csPerMin / 7.8) * 8.0, 1.0, 10.0);
  } else if (p.role === "jungle") {
    csScore = clamp((p.csPerMin / 6.2) * 8.0, 1.0, 10.0);
  } else {
    // Support: based on assists & item progression rather than CS
    csScore = clamp(6.0 + (p.assists / Math.max(1, team.totalKills)) * 4.0, 4.0, 9.8);
  }
  let goldPts = clamp((p.goldShare / 0.25) * 7.0, 1.0, 10.0);
  const farmingScore = clamp(round1(0.6 * csScore + 0.4 * goldPts), 1.0, 10.0);

  // 4. VISION SCORE (15% weight)
  const visionTarget = p.role === "support" ? 2.5 : p.role === "jungle" ? 1.6 : 1.1;
  let visionPts = clamp((p.visionPerMin / visionTarget) * 7.5, 1.0, 9.5);
  if (p.controlWardsBought >= 3) visionPts += 0.8;
  else if (p.controlWardsBought >= 1) visionPts += 0.4;
  if (p.wardsKilled >= 4) visionPts += 0.5;
  const visionScore = clamp(round1(visionPts), 1.0, 10.0);

  // 5. OBJECTIVE & TURRET SCORE (15% weight)
  let turretPts = clamp((p.turretDamage / 6000) * 7.0 + p.turretKills * 0.8, 1.0, 10.0);
  let monsterPts = clamp((p.objectiveDamage / 12000) * 7.0, 1.0, 10.0);
  const objectiveScore = clamp(round1(0.5 * turretPts + 0.5 * monsterPts), 1.0, 10.0);

  // OVERALL WEIGHTED SCORE (0.0 to 10.0)
  let overall =
    0.25 * combatScore +
    0.25 * damageScore +
    0.20 * farmingScore +
    0.15 * visionScore +
    0.15 * objectiveScore;

  // Small victory bonus
  if (p.win) {
    overall += 0.35;
  }

  const overallScore = clamp(round1(overall), 1.0, 10.0);

  return {
    overallScore,
    scoreCombat: combatScore,
    scoreDamage: damageScore,
    scoreFarming: farmingScore,
    scoreVision: visionScore,
    scoreObjective: objectiveScore,
  };
}

/**
 * Parses raw LCU timeline response (/lol-match-history/v1/game-timelines/{id}).
 */
export function parseLcuTimeline(rawTimeline: any, match: PostGameMatch): PostGameTimeline | null {
  if (!rawTimeline || !Array.isArray(rawTimeline.frames) || rawTimeline.frames.length === 0) {
    return null;
  }

  const bluePartIds = new Set(match.blueTeam.participants.map((p) => p.participantId));
  const redPartIds = new Set(match.redTeam.participants.map((p) => p.participantId));

  const frames: TimelineFramePoint[] = [];
  let maxBlueLead = { minute: 0, amount: 0 };
  let maxRedLead = { minute: 0, amount: 0 };

  for (let i = 0; i < rawTimeline.frames.length; i++) {
    const f = rawTimeline.frames[i];
    const timestamp = Number(f.timestamp || i * 60000);
    const minute = Math.round(timestamp / 60000);

    let blueGold = 0;
    let redGold = 0;

    const partFrames = f.participantFrames;
    if (partFrames) {
      if (Array.isArray(partFrames)) {
        for (const pf of partFrames) {
          const pid = Number(pf.participantId);
          const gold = Number(pf.totalGold || pf.currentGold || 0);
          if (bluePartIds.has(pid)) blueGold += gold;
          else if (redPartIds.has(pid)) redGold += gold;
        }
      } else if (typeof partFrames === "object") {
        for (const [key, pf] of Object.entries(partFrames)) {
          const pObj: any = pf;
          const pid = Number(pObj.participantId || key);
          const gold = Number(pObj.totalGold || pObj.currentGold || 0);
          if (bluePartIds.has(pid)) blueGold += gold;
          else if (redPartIds.has(pid)) redGold += gold;
        }
      }
    }

    // Fallback if gold wasn't recorded in frame
    if (blueGold === 0 && redGold === 0) {
      const progress = i / Math.max(1, rawTimeline.frames.length - 1);
      blueGold = Math.round(2500 + ((match.blueTeam.totalGold || 50000) - 2500) * progress);
      redGold = Math.round(2500 + ((match.redTeam.totalGold || 50000) - 2500) * progress);
    }

    const goldDiff = blueGold - redGold;

    if (goldDiff > maxBlueLead.amount) {
      maxBlueLead = { minute, amount: goldDiff };
    }
    if (goldDiff < 0 && Math.abs(goldDiff) > maxRedLead.amount) {
      maxRedLead = { minute, amount: Math.abs(goldDiff) };
    }

    const events: TimelineEvent[] = [];
    if (Array.isArray(f.events)) {
      for (const ev of f.events) {
        const evType = String(ev.type || "");
        if (evType === "ELITE_MONSTER_KILL") {
          const monster = String(ev.monsterType || "MONSTER");
          const teamId = ev.killerId && bluePartIds.has(Number(ev.killerId)) ? 100 : 200;
          let label = "Dragon Slain";
          if (monster.includes("BARON")) label = "Baron Nashor Slain";
          else if (monster.includes("HERALD")) label = "Rift Herald Slain";
          else if (monster.includes("HORDE")) label = "Voidgrubs Defeated";
          else if (monster.includes("DRAGON")) {
            const sub = ev.monsterSubType ? ` (${ev.monsterSubType.replace("_DRAGON", "")})` : "";
            label = `Dragon Slain${sub}`;
          }
          events.push({
            type: monster.includes("BARON") ? "baron" : monster.includes("DRAGON") ? "dragon" : "herald",
            teamId,
            minute,
            description: `${teamId === 100 ? "Blue" : "Red"} Team: ${label}`,
          });
        } else if (evType === "BUILDING_KILL") {
          const bType = String(ev.buildingType || "TURRET");
          const teamId = ev.teamId === 100 ? 200 : 100;
          const label = bType.includes("INHIBITOR") ? "Inhibitor Destroyed" : "Turret Destroyed";
          events.push({
            type: bType.includes("INHIBITOR") ? "inhibitor" : "tower",
            teamId,
            minute,
            description: `${teamId === 100 ? "Blue" : "Red"} Team: ${label}`,
          });
        }
      }
    }

    frames.push({
      minute,
      timestamp,
      blueGold,
      redGold,
      goldDiff,
      events: events.length > 0 ? events : undefined,
    });
  }

  const maxGoldDiff = Math.max(maxBlueLead.amount, maxRedLead.amount, 100);
  const blueWon = match.blueTeam.win;
  let hasComeback = false;
  let comebackDetails: string | undefined = undefined;

  if (blueWon && maxRedLead.amount >= 2000) {
    hasComeback = true;
    comebackDetails = `Blue Team overcame a ${(maxRedLead.amount / 1000).toFixed(1)}k gold deficit at ${maxRedLead.minute}m!`;
  } else if (!blueWon && maxBlueLead.amount >= 2000) {
    hasComeback = true;
    comebackDetails = `Red Team overcame a ${(maxBlueLead.amount / 1000).toFixed(1)}k gold deficit at ${maxBlueLead.minute}m!`;
  }

  return {
    frames,
    maxGoldDiff,
    maxBlueLead,
    maxRedLead,
    hasComeback,
    comebackDetails,
  };
}

/**
 * Generates an organic, realistic gold timeline curve when raw LCU timeline is unavailable
 * (e.g. for mock data, offline testing, or modes/games without timeline logs).
 */
export function generateInterpolatedTimeline(match: PostGameMatch): PostGameTimeline {
  const durationMins = Math.max(5, Math.ceil(match.gameDuration / 60));
  const frames: TimelineFramePoint[] = [];

  const blueFinalGold = match.blueTeam.totalGold || 65000;
  const redFinalGold = match.redTeam.totalGold || 58000;
  const blueWon = match.blueTeam.win;

  let maxBlueLead = { minute: 0, amount: 0 };
  let maxRedLead = { minute: 0, amount: 0 };

  for (let m = 0; m <= durationMins; m++) {
    const progress = m / durationMins;
    const baseCurve = Math.pow(progress, 1.25);

    let blueGold = Math.round(2500 + (blueFinalGold - 2500) * baseCurve);
    let redGold = Math.round(2500 + (redFinalGold - 2500) * baseCurve);

    // Realistic mid-game dynamics: early game parity with small swings
    if (m > 0 && m < durationMins) {
      if (blueWon) {
        if (m < Math.round(durationMins * 0.4)) {
          redGold += Math.round(350 * Math.sin((m / durationMins) * Math.PI));
        } else {
          blueGold += Math.round(500 * Math.sin(((m - durationMins * 0.4) / (durationMins * 0.6)) * Math.PI));
        }
      } else {
        if (m < Math.round(durationMins * 0.4)) {
          blueGold += Math.round(350 * Math.sin((m / durationMins) * Math.PI));
        } else {
          redGold += Math.round(500 * Math.sin(((m - durationMins * 0.4) / (durationMins * 0.6)) * Math.PI));
        }
      }
    }

    const goldDiff = blueGold - redGold;

    if (goldDiff > maxBlueLead.amount) {
      maxBlueLead = { minute: m, amount: goldDiff };
    }
    if (goldDiff < 0 && Math.abs(goldDiff) > maxRedLead.amount) {
      maxRedLead = { minute: m, amount: Math.abs(goldDiff) };
    }

    const events: TimelineEvent[] = [];
    if (match.modeType === "classic") {
      if (m === Math.round(durationMins * 0.25)) {
        events.push({
          type: "dragon",
          teamId: blueWon ? 100 : 200,
          minute: m,
          description: `${blueWon ? "Blue" : "Red"} Team: First Dragon secured`,
        });
      } else if (m === Math.round(durationMins * 0.45)) {
        events.push({
          type: "tower",
          teamId: blueWon ? 100 : 200,
          minute: m,
          description: `${blueWon ? "Blue" : "Red"} Team: First Tower destroyed`,
        });
      } else if (m === Math.round(durationMins * 0.68) && durationMins >= 22) {
        events.push({
          type: "baron",
          teamId: blueWon ? 100 : 200,
          minute: m,
          description: `${blueWon ? "Blue" : "Red"} Team: Baron Nashor slain`,
        });
      } else if (m === Math.round(durationMins * 0.85)) {
        events.push({
          type: "inhibitor",
          teamId: blueWon ? 100 : 200,
          minute: m,
          description: `${blueWon ? "Blue" : "Red"} Team: Inhibitor taken`,
        });
      }
    } else if (match.modeType === "aram") {
      if (m === Math.round(durationMins * 0.35)) {
        events.push({
          type: "tower",
          teamId: blueWon ? 100 : 200,
          minute: m,
          description: `${blueWon ? "Blue" : "Red"} Team: Outer Turret destroyed`,
        });
      } else if (m === Math.round(durationMins * 0.65)) {
        events.push({
          type: "inhibitor",
          teamId: blueWon ? 100 : 200,
          minute: m,
          description: `${blueWon ? "Blue" : "Red"} Team: Inhibitor destroyed`,
        });
      }
    }

    frames.push({
      minute: m,
      timestamp: m * 60000,
      blueGold,
      redGold,
      goldDiff,
      events: events.length > 0 ? events : undefined,
    });
  }

  const maxGoldDiff = Math.max(maxBlueLead.amount, maxRedLead.amount, 100);
  let hasComeback = false;
  let comebackDetails: string | undefined = undefined;

  if (blueWon && maxRedLead.amount >= 2000) {
    hasComeback = true;
    comebackDetails = `Blue Team overcame a ${(maxRedLead.amount / 1000).toFixed(1)}k gold deficit at ${maxRedLead.minute}m!`;
  } else if (!blueWon && maxBlueLead.amount >= 2000) {
    hasComeback = true;
    comebackDetails = `Red Team overcame a ${(maxBlueLead.amount / 1000).toFixed(1)}k gold deficit at ${maxBlueLead.minute}m!`;
  }

  return {
    frames,
    maxGoldDiff,
    maxBlueLead,
    maxRedLead,
    hasComeback,
    comebackDetails,
  };
}

/**
 * Enriches all participants of a match with scoring, ranks 1-10, and badges.
 */
export function computeMatchScoresAndBadges(match: PostGameMatch): PostGameMatch {
  const durationMinutes = Math.max(1, match.gameDuration / 60);
  const modeType = match.modeType || detectGameMode(match.queueId, match.gameMode);
  match.modeType = modeType;

  const team100Parts = match.blueTeam.participants;
  const team200Parts = match.redTeam.participants;

  const sumStat = (list: PostGameParticipant[], key: keyof PostGameParticipant) =>
    list.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);

  match.blueTeam.totalKills = sumStat(team100Parts, "kills");
  match.blueTeam.totalDeaths = sumStat(team100Parts, "deaths");
  match.blueTeam.totalDamage = sumStat(team100Parts, "totalDamage");
  match.blueTeam.totalGold = sumStat(team100Parts, "goldEarned");

  match.redTeam.totalKills = sumStat(team200Parts, "kills");
  match.redTeam.totalDeaths = sumStat(team200Parts, "deaths");
  match.redTeam.totalDamage = sumStat(team200Parts, "totalDamage");
  match.redTeam.totalGold = sumStat(team200Parts, "goldEarned");

  const all = [...team100Parts, ...team200Parts];

  // Compute basic per-minute rates first for matchMax
  for (const p of all) {
    p.dpm = round1(p.totalDamage / durationMinutes);
    p.csPerMin = round1(p.cs / durationMinutes);
    p.goldPerMin = round1(p.goldEarned / durationMinutes);
    p.visionPerMin = round1(p.visionScore / durationMinutes);
  }

  // Match Maximums for relative normalization
  const matchMax = {
    damage: Math.max(1, ...all.map((p) => p.totalDamage)),
    dpm: Math.max(1, ...all.map((p) => p.dpm)),
    csPerMin: Math.max(1, ...all.map((p) => p.csPerMin)),
    visionPerMin: Math.max(0.1, ...all.map((p) => p.visionPerMin)),
    visionScore: Math.max(1, ...all.map((p) => p.visionScore)),
    goldPerMin: Math.max(1, ...all.map((p) => p.goldPerMin)),
    tanked: Math.max(1, ...all.map((p) => p.damageTaken + p.damageSelfMitigated)),
    objectiveDamage: Math.max(1, ...all.map((p) => p.objectiveDamage)),
    ccTime: Math.max(1, ...all.map((p) => p.ccTime)),
    ccScore: Math.max(1, ...all.map((p) => p.timeCCingOthers)),
  };

  // Pass 1: Compute shares & individual scores
  for (const p of all) {
    const team = p.teamId === 100 ? match.blueTeam : match.redTeam;
    const teamDamageTaken = sumStat(team.participants, "damageTaken");

    p.damageShare = team.totalDamage > 0 ? p.totalDamage / team.totalDamage : 0.2;
    p.goldShare = team.totalGold > 0 ? p.goldEarned / team.totalGold : 0.2;
    p.killParticipation = team.totalKills > 0 ? (p.kills + p.assists) / team.totalKills : 0;

    const ratings = calculatePlayerRating(
      p,
      {
        totalKills: team.totalKills,
        totalDamage: team.totalDamage,
        totalGold: team.totalGold,
        totalDamageTaken: teamDamageTaken,
      },
      matchMax,
      durationMinutes,
      modeType
    );

    p.overallScore = ratings.overallScore;
    p.scoreCombat = ratings.scoreCombat;
    p.scoreDamage = ratings.scoreDamage;
    p.scoreFarming = ratings.scoreFarming;
    p.scoreVision = ratings.scoreVision;
    p.scoreObjective = ratings.scoreObjective;

    p.badges = assignBadges(
      p,
      {
        totalKills: team.totalKills,
        totalDamage: team.totalDamage,
        totalGold: team.totalGold,
        totalDamageTaken: teamDamageTaken,
      },
      matchMax,
      durationMinutes,
      p.win,
      modeType
    );
  }

  // Pass 2: Sort descending by overallScore and assign ranks 1 to 10
  const sorted = [...all].sort((a, b) => b.overallScore - a.overallScore);

  sorted.forEach((p, idx) => {
    p.rank = idx + 1;
    p.isMvp = false;
    p.isSvp = false;
    p.isAce = false;
  });

  // Best player on winning team is MVP
  const winningTeamParts = sorted.filter((p) => p.win);
  const losingTeamParts = sorted.filter((p) => !p.win);

  const mvpPlayer = winningTeamParts[0] || sorted[0];
  if (mvpPlayer) {
    mvpPlayer.isMvp = true;
  }

  // Best player on losing team is SVP
  const svpPlayer = losingTeamParts[0] || null;
  if (svpPlayer) {
    svpPlayer.isSvp = true;
    svpPlayer.isAce = true; // backward compatibility
  }

  match.allParticipants = sorted;
  match.mvp = mvpPlayer;
  match.svp = svpPlayer;
  match.ace = svpPlayer;
  match.localParticipant = all.find((p) => p.isLocal) || null;
  match.localPlayerWon = match.localParticipant?.win ?? match.blueTeam.win;

  // Guarantee timeline is present
  if (!match.timeline) {
    match.timeline = generateInterpolatedTimeline(match);
  }

  return match;
}

/**
 * Normalizes raw game JSON from LCU (/lol-match-history/v1/games/{id}) into PostGameMatch.
 */
export function normalizePostGameMatch(raw: any, localNameOrPuuid?: string): PostGameMatch | null {
  if (!raw) return null;
  const game = raw.game || raw;

  const gameId = String(game.gameId || game.id || "0");
  const gameDuration = Number(game.gameDuration || game.game_duration || 1800);
  const gameMode = String(game.gameMode || "CLASSIC");
  const queueId = Number(game.queueId || 420);
  const queueLabel = queueNameFromId(queueId);

  const identities = game.participantIdentities || [];
  const participants = game.participants || [];

  if (!participants.length) return null;

  // Disambiguate local player participant ID
  let localPartId = 1;
  if (localNameOrPuuid) {
    const cleanTarget = localNameOrPuuid.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = identities.find((i: any) => {
      const pl = i.player || {};
      const full = `${pl.gameName || ""}${pl.tagLine || ""}${pl.summonerName || ""}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return full.includes(cleanTarget) || pl.puuid === localNameOrPuuid;
    });
    if (found) {
      localPartId = found.participantId;
    }
  }

  const ROLE_LIST: Role[] = ["top", "jungle", "mid", "adc", "support"];

  const parsedParticipants: PostGameParticipant[] = participants.map((p: any, idx: number) => {
    const partId = p.participantId || idx + 1;
    const ident = identities.find((i: any) => i.participantId === partId)?.player || {};
    const s = p.stats || {};
    const durMins = Math.max(1, gameDuration / 60);

    const kills = Number(s.kills || 0);
    const deaths = Number(s.deaths || 0);
    const assists = Number(s.assists || 0);
    const kda = deaths > 0 ? round1((kills + assists) / deaths) : kills + assists;

    const totalMinions = Number(s.totalMinionsKilled || 0);
    const neutralMinions = Number(s.neutralMinionsKilled || 0);
    const cs = totalMinions + neutralMinions;

    const items = [
      s.item0 || 0,
      s.item1 || 0,
      s.item2 || 0,
      s.item3 || 0,
      s.item4 || 0,
      s.item5 || 0,
      s.item6 || 0,
    ];
    if (s.item7 !== undefined && s.item7 !== null && Number(s.item7) > 0) {
      items.push(Number(s.item7));
    }

    const spells = [p.spell1Id, p.spell2Id].filter(Boolean);

    // Resolve role from timeline/position and items/spells
    let role: Role = ROLE_LIST[idx % 5];
    const pos = (p.teamPosition || p.selectedPosition || p.individualPosition || p.timeline?.lane || "").toUpperCase();
    const pRole = (p.timeline?.role || "").toUpperCase();
    const hasSmite = spells.includes(11);
    const hasSupportItem = items.some((id) =>
      [3850, 3851, 3853, 3854, 3855, 3857, 3858, 3859, 3860, 3862, 3863, 3864, 3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877].includes(id)
    );

    if (pos === "TOP") {
      role = "top";
    } else if (pos === "JUNGLE" || hasSmite) {
      role = "jungle";
    } else if (pos === "MIDDLE" || pos === "MID") {
      role = "mid";
    } else if (pos === "UTILITY" || pos === "SUPPORT" || hasSupportItem || (pos === "BOTTOM" && pRole === "DUO_SUPPORT")) {
      role = "support";
    } else if (pos === "BOTTOM" || pos === "BOT" || pos === "ADC" || (pos === "BOTTOM" && pRole === "DUO_CARRY")) {
      role = "adc";
    }

    const totalDamage = Number(s.totalDamageDealtToChampions || 0);
    const physicalDamage = Number(s.physicalDamageDealtToChampions || Math.round(totalDamage * 0.7));
    const magicDamage = Number(s.magicDamageDealtToChampions || Math.round(totalDamage * 0.25));
    const trueDamage = Number(s.trueDamageDealtToChampions || Math.max(0, totalDamage - physicalDamage - magicDamage));

    return {
      participantId: partId,
      summonerName: ident.gameName || ident.summonerName || `Player ${partId}`,
      gameName: ident.gameName,
      tagLine: ident.tagLine,
      championId: Number(p.championId || 0),
      championName: "",
      teamId: Number(p.teamId || (idx < 5 ? 100 : 200)),
      isLocal: partId === localPartId,
      role,
      position: pos,
      kills,
      deaths,
      assists,
      kda,
      killParticipation: 0,
      championLevel: Number(s.champLevel || 1),
      spells,
      items,
      primaryRuneId: s.perk0,
      secondaryStyleId: s.perkSubStyle,

      totalDamage,
      physicalDamage,
      magicDamage,
      trueDamage,
      damageShare: 0,
      dpm: round1(totalDamage / durMins),

      damageTaken: Number(s.totalDamageTaken || 0),
      damageSelfMitigated: Number(s.damageSelfMitigated || 0),
      totalHeal: Number(s.totalHeal || 0),

      cs,
      csPerMin: round1(cs / durMins),
      goldEarned: Number(s.goldEarned || 0),
      goldPerMin: round1((s.goldEarned || 0) / durMins),
      goldShare: 0,

      visionScore: Number(s.visionScore || 0),
      visionPerMin: round1((s.visionScore || 0) / durMins),
      wardsPlaced: Number(s.wardsPlaced || 0),
      wardsKilled: Number(s.wardsKilled || 0),
      controlWardsBought: Number(s.visionWardsBoughtInGame || 0),

      objectiveDamage: Number(s.damageDealtToObjectives || 0),
      turretDamage: Number(s.damageDealtToTurrets || 0),
      turretKills: Number(s.turretKills || 0),
      inhibitorKills: Number(s.inhibitorKills || 0),

      ccTime: Number(s.totalTimeCrowdControlDealt || 0),
      timeCCingOthers: Number(s.timeCCingOthers || 0),

      firstBloodKill: Boolean(s.firstBloodKill),
      largestMultiKill: Number(s.largestMultiKill || 1),
      largestKillingSpree: Number(s.largestKillingSpree || 0),
      enemyJungleCS: Number(s.neutralMinionsKilledEnemyJungle || 0),

      win: Boolean(s.win),

      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    };
  });

  const blueParts = parsedParticipants.filter((p) => p.teamId === 100);
  const redParts = parsedParticipants.filter((p) => p.teamId === 200);

  const blueTeamRaw = (game.teams || []).find((t: any) => t.teamId === 100) || {};
  const redTeamRaw = (game.teams || []).find((t: any) => t.teamId === 200) || {};

  const blueBans: number[] = (blueTeamRaw.bans || []).map((b: any) => b.championId).filter(Boolean);
  const redBans: number[] = (redTeamRaw.bans || []).map((b: any) => b.championId).filter(Boolean);

  const blueWin = blueTeamRaw.win === "Win" || blueParts.some((p) => p.win);
  const modeType = detectGameMode(queueId, gameMode);

  const baseMatch: PostGameMatch = {
    gameId,
    gameDuration,
    gameCreation: game.gameCreation,
    gameMode,
    modeType,
    queueId,
    queueLabel,
    localPlayerWon: false,
    mvp: parsedParticipants[0],
    blueTeam: {
      teamId: 100,
      win: blueWin,
      bans: blueBans,
      totalKills: 0,
      totalDeaths: 0,
      totalDamage: 0,
      totalGold: 0,
      dragonKills: blueTeamRaw.dragonKills,
      baronKills: blueTeamRaw.baronKills,
      towerKills: blueTeamRaw.towerKills,
      participants: blueParts,
    },
    redTeam: {
      teamId: 200,
      win: !blueWin,
      bans: redBans,
      totalKills: 0,
      totalDeaths: 0,
      totalDamage: 0,
      totalGold: 0,
      dragonKills: redTeamRaw.dragonKills,
      baronKills: redTeamRaw.baronKills,
      towerKills: redTeamRaw.towerKills,
      participants: redParts,
    },
    allParticipants: parsedParticipants,
  };

  const rawTimeline = raw.timeline || game.timeline;
  if (rawTimeline) {
    baseMatch.timeline = parseLcuTimeline(rawTimeline, baseMatch);
  }

  return computeMatchScoresAndBadges(baseMatch);
}

/**
 * Creates an ultra-realistic mock post-game match for instant testing & demonstration.
 */
export function createMockPostGameMatch(localIsWinner = true, mode: GameModeType = "classic"): PostGameMatch {
  if (mode === "aram") {
    return createMockAramPostGameMatch(localIsWinner);
  }
  const durationSeconds = 1948; // 32m 28s
  const durMins = durationSeconds / 60;

  const mockBlue: PostGameParticipant[] = [
    {
      participantId: 1,
      summonerName: "AatroxGod#EUW",
      gameName: "AatroxGod",
      tagLine: "EUW",
      championId: 266, // Aatrox
      championName: "Aatrox",
      teamId: 100,
      isLocal: false,
      role: "top",
      kills: 6,
      deaths: 4,
      assists: 8,
      kda: 3.5,
      killParticipation: 0,
      championLevel: 16,
      spells: [12, 4], // Teleport, Flash
      items: [3078, 3053, 3111, 3071, 3065, 0, 3340],
      primaryRuneId: 8010, // Conqueror
      secondaryStyleId: 8400, // Resolve
      totalDamage: 27400,
      physicalDamage: 24200,
      magicDamage: 1800,
      trueDamage: 1400,
      damageShare: 0,
      dpm: 0,
      damageTaken: 28400,
      damageSelfMitigated: 21800,
      totalHeal: 14200,
      cs: 236,
      csPerMin: 0,
      goldEarned: 13900,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 24,
      visionPerMin: 0,
      wardsPlaced: 11,
      wardsKilled: 4,
      controlWardsBought: 2,
      objectiveDamage: 7200,
      turretDamage: 5400,
      turretKills: 2,
      inhibitorKills: 0,
      ccTime: 32,
      timeCCingOthers: 21,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 4,
      enemyJungleCS: 8,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 2,
      summonerName: "JungleDiff#EUW",
      gameName: "JungleDiff",
      tagLine: "EUW",
      championId: 64, // Lee Sin
      championName: "Lee Sin",
      teamId: 100,
      isLocal: false,
      role: "jungle",
      kills: 5,
      deaths: 3,
      assists: 14,
      kda: 6.3,
      killParticipation: 0,
      championLevel: 15,
      spells: [11, 4], // Smite, Flash
      items: [3074, 3071, 3111, 3156, 1036, 0, 3364, 1102],
      primaryRuneId: 8010,
      secondaryStyleId: 8300,
      totalDamage: 19800,
      physicalDamage: 18100,
      magicDamage: 1100,
      trueDamage: 600,
      damageShare: 0,
      dpm: 0,
      damageTaken: 25400,
      damageSelfMitigated: 16900,
      totalHeal: 8100,
      cs: 192,
      csPerMin: 0,
      goldEarned: 13200,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 48,
      visionPerMin: 0,
      wardsPlaced: 19,
      wardsKilled: 9,
      controlWardsBought: 4,
      objectiveDamage: 24800,
      turretDamage: 2100,
      turretKills: 1,
      inhibitorKills: 0,
      ccTime: 28,
      timeCCingOthers: 18,
      firstBloodKill: true,
      largestMultiKill: 2,
      largestKillingSpree: 5,
      enemyJungleCS: 24,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 3,
      summonerName: "FoxFire#EUW",
      gameName: "FoxFire",
      tagLine: "EUW",
      championId: 103, // Ahri
      championName: "Ahri",
      teamId: 100,
      isLocal: false,
      role: "mid",
      kills: 7,
      deaths: 2,
      assists: 11,
      kda: 9.0,
      killParticipation: 0,
      championLevel: 16,
      spells: [14, 4], // Ignite, Flash
      items: [6655, 3157, 3089, 3020, 4645, 0, 3340],
      primaryRuneId: 8112, // Electrocute
      secondaryStyleId: 8200, // Sorcery
      totalDamage: 28900,
      physicalDamage: 1200,
      magicDamage: 23100,
      trueDamage: 4600,
      damageShare: 0,
      dpm: 0,
      damageTaken: 16400,
      damageSelfMitigated: 9800,
      totalHeal: 5400,
      cs: 254,
      csPerMin: 0,
      goldEarned: 14800,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 29,
      visionPerMin: 0,
      wardsPlaced: 12,
      wardsKilled: 5,
      controlWardsBought: 2,
      objectiveDamage: 9100,
      turretDamage: 4200,
      turretKills: 2,
      inhibitorKills: 1,
      ccTime: 46,
      timeCCingOthers: 32,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 6,
      enemyJungleCS: 6,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 4,
      summonerName: "You (Local Player)#EUW",
      gameName: "You",
      tagLine: "EUW",
      championId: 222, // Jinx
      championName: "Jinx",
      teamId: 100,
      isLocal: true,
      role: "adc",
      kills: 14,
      deaths: 2,
      assists: 9,
      kda: 11.5,
      killParticipation: 0,
      championLevel: 17,
      spells: [7, 4], // Heal, Flash
      items: [3031, 3094, 3072, 3026, 3036, 3085, 3363, 3006],
      primaryRuneId: 8008, // Lethal Tempo
      secondaryStyleId: 8200,
      totalDamage: 38200,
      physicalDamage: 35100,
      magicDamage: 1800,
      trueDamage: 1300,
      damageShare: 0,
      dpm: 0,
      damageTaken: 14200,
      damageSelfMitigated: 9200,
      totalHeal: 4100,
      cs: 308,
      csPerMin: 0,
      goldEarned: 18400,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 32,
      visionPerMin: 0,
      wardsPlaced: 14,
      wardsKilled: 6,
      controlWardsBought: 3,
      objectiveDamage: 18900,
      turretDamage: 9200,
      turretKills: 4,
      inhibitorKills: 2,
      ccTime: 38,
      timeCCingOthers: 24,
      firstBloodKill: false,
      largestMultiKill: 5, // PENTAKILL!
      largestKillingSpree: 9,
      enemyJungleCS: 12,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 5,
      summonerName: "AnchorHook#EUW",
      gameName: "AnchorHook",
      tagLine: "EUW",
      championId: 111, // Nautilus
      championName: "Nautilus",
      teamId: 100,
      isLocal: false,
      role: "support",
      kills: 2,
      deaths: 4,
      assists: 21,
      kda: 5.75,
      killParticipation: 0,
      championLevel: 14,
      spells: [14, 4], // Ignite, Flash
      items: [3865, 3190, 3111, 3050, 3109, 0, 3364],
      primaryRuneId: 8439, // Aftershock
      secondaryStyleId: 8300,
      totalDamage: 9400,
      physicalDamage: 2100,
      magicDamage: 6800,
      trueDamage: 500,
      damageShare: 0,
      dpm: 0,
      damageTaken: 26800,
      damageSelfMitigated: 29400,
      totalHeal: 3800,
      cs: 34,
      csPerMin: 0,
      goldEarned: 9800,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 78,
      visionPerMin: 0,
      wardsPlaced: 42,
      wardsKilled: 14,
      controlWardsBought: 6,
      objectiveDamage: 3800,
      turretDamage: 1400,
      turretKills: 1,
      inhibitorKills: 0,
      ccTime: 82,
      timeCCingOthers: 54,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 2,
      enemyJungleCS: 0,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
  ];

  const mockRed: PostGameParticipant[] = [
    {
      participantId: 6,
      summonerName: "BladeMaster#EUW",
      gameName: "BladeMaster",
      tagLine: "EUW",
      championId: 114, // Fiora
      championName: "Fiora",
      teamId: 200,
      isLocal: false,
      role: "top",
      kills: 5,
      deaths: 6,
      assists: 2,
      kda: 1.17,
      killParticipation: 0,
      championLevel: 15,
      spells: [12, 4],
      items: [3078, 3074, 3111, 3053, 0, 0, 3340],
      primaryRuneId: 8010,
      secondaryStyleId: 8400,
      totalDamage: 22100,
      physicalDamage: 15200,
      magicDamage: 1100,
      trueDamage: 5800,
      damageShare: 0,
      dpm: 0,
      damageTaken: 26400,
      damageSelfMitigated: 14200,
      totalHeal: 9800,
      cs: 262,
      csPerMin: 0,
      goldEarned: 13100,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 21,
      visionPerMin: 0,
      wardsPlaced: 10,
      wardsKilled: 3,
      controlWardsBought: 1,
      objectiveDamage: 4100,
      turretDamage: 4600,
      turretKills: 1,
      inhibitorKills: 0,
      ccTime: 14,
      timeCCingOthers: 8,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 3,
      enemyJungleCS: 14,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 7,
      summonerName: "ScytheShadow#EUW",
      gameName: "ScytheShadow",
      tagLine: "EUW",
      championId: 141, // Kayn
      championName: "Kayn",
      teamId: 200,
      isLocal: false,
      role: "jungle",
      kills: 4,
      deaths: 7,
      assists: 4,
      kda: 1.14,
      killParticipation: 0,
      championLevel: 14,
      spells: [11, 4],
      items: [6692, 3158, 3071, 3142, 0, 0, 3364],
      primaryRuneId: 8010,
      secondaryStyleId: 8100,
      totalDamage: 18200,
      physicalDamage: 16100,
      magicDamage: 1200,
      trueDamage: 900,
      damageShare: 0,
      dpm: 0,
      damageTaken: 27800,
      damageSelfMitigated: 14800,
      totalHeal: 7200,
      cs: 174,
      csPerMin: 0,
      goldEarned: 11400,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 36,
      visionPerMin: 0,
      wardsPlaced: 14,
      wardsKilled: 6,
      controlWardsBought: 3,
      objectiveDamage: 14200,
      turretDamage: 1200,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 22,
      timeCCingOthers: 14,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 3,
      enemyJungleCS: 6,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 8,
      summonerName: "WindWalker#EUW",
      gameName: "WindWalker",
      tagLine: "EUW",
      championId: 157, // Yasuo
      championName: "Yasuo",
      teamId: 200,
      isLocal: false,
      role: "mid",
      kills: 2,
      deaths: 10,
      assists: 4,
      kda: 0.6,
      killParticipation: 0,
      championLevel: 14,
      spells: [14, 4],
      items: [3006, 3046, 3031, 1055, 0, 0, 3340],
      primaryRuneId: 8008,
      secondaryStyleId: 8400,
      totalDamage: 14600,
      physicalDamage: 12800,
      magicDamage: 900,
      trueDamage: 900,
      damageShare: 0,
      dpm: 0,
      damageTaken: 24200,
      damageSelfMitigated: 11200,
      totalHeal: 3400,
      cs: 218,
      csPerMin: 0,
      goldEarned: 10200,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 16,
      visionPerMin: 0,
      wardsPlaced: 8,
      wardsKilled: 2,
      controlWardsBought: 0,
      objectiveDamage: 2400,
      turretDamage: 800,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 18,
      timeCCingOthers: 12,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 1,
      enemyJungleCS: 2,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 9,
      summonerName: "NightHunter#EUW",
      gameName: "NightHunter",
      tagLine: "EUW",
      championId: 67, // Vayne
      championName: "Vayne",
      teamId: 200,
      isLocal: false,
      role: "adc",
      kills: 3,
      deaths: 5,
      assists: 5,
      kda: 1.6,
      killParticipation: 0,
      championLevel: 15,
      spells: [7, 4],
      items: [3153, 3124, 3006, 3091, 0, 0, 3363],
      primaryRuneId: 8008,
      secondaryStyleId: 8300,
      totalDamage: 21400,
      physicalDamage: 12400,
      magicDamage: 1800,
      trueDamage: 7200,
      damageShare: 0,
      dpm: 0,
      damageTaken: 17800,
      damageSelfMitigated: 8400,
      totalHeal: 2800,
      cs: 268,
      csPerMin: 0,
      goldEarned: 12600,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 22,
      visionPerMin: 0,
      wardsPlaced: 11,
      wardsKilled: 4,
      controlWardsBought: 1,
      objectiveDamage: 6200,
      turretDamage: 1800,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 16,
      timeCCingOthers: 10,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 2,
      enemyJungleCS: 4,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 10,
      summonerName: "ShieldProtector#EUW",
      gameName: "ShieldProtector",
      tagLine: "EUW",
      championId: 201, // Braum
      championName: "Braum",
      teamId: 200,
      isLocal: false,
      role: "support",
      kills: 1,
      deaths: 6,
      assists: 7,
      kda: 1.33,
      killParticipation: 0,
      championLevel: 13,
      spells: [3, 4], // Exhaust, Flash
      items: [3865, 3190, 3111, 3050, 0, 0, 3364],
      primaryRuneId: 8439,
      secondaryStyleId: 8300,
      totalDamage: 6400,
      physicalDamage: 1800,
      magicDamage: 4200,
      trueDamage: 400,
      damageShare: 0,
      dpm: 0,
      damageTaken: 29400,
      damageSelfMitigated: 26800,
      totalHeal: 3100,
      cs: 28,
      csPerMin: 0,
      goldEarned: 8400,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 64,
      visionPerMin: 0,
      wardsPlaced: 36,
      wardsKilled: 11,
      controlWardsBought: 5,
      objectiveDamage: 2100,
      turretDamage: 600,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 54,
      timeCCingOthers: 38,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 1,
      enemyJungleCS: 0,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
  ];

  const baseMatch: PostGameMatch = {
    gameId: "6892415812",
    gameDuration: durationSeconds,
    gameCreation: Date.now() - 1948 * 1000,
    gameMode: "CLASSIC",
    modeType: "classic",
    queueId: 420,
    queueLabel: "Ranked Solo/Duo",
    localPlayerWon: localIsWinner,
    mvp: mockBlue[3],
    blueTeam: {
      teamId: 100,
      win: localIsWinner,
      bans: [53, 11, 84, 122, 238],
      totalKills: 0,
      totalDeaths: 0,
      totalDamage: 0,
      totalGold: 0,
      dragonKills: 3,
      baronKills: 1,
      towerKills: 9,
      participants: mockBlue,
    },
    redTeam: {
      teamId: 200,
      win: !localIsWinner,
      bans: [875, 412, 104, 236, 120],
      totalKills: 0,
      totalDeaths: 0,
      totalDamage: 0,
      totalGold: 0,
      dragonKills: 1,
      baronKills: 0,
      towerKills: 2,
      participants: mockRed,
    },
    allParticipants: [...mockBlue, ...mockRed],
  };

  return computeMatchScoresAndBadges(baseMatch);
}

/**
 * Creates an ultra-realistic mock ARAM post-game match for instant testing & demonstration.
 */
export function createMockAramPostGameMatch(localIsWinner = true): PostGameMatch {
  const durationSeconds = 1124; // 18m 44s

  const mockBlue: PostGameParticipant[] = [
    {
      participantId: 1,
      summonerName: "HextechCarry#EUW",
      gameName: "HextechCarry",
      tagLine: "EUW",
      championId: 222, // Jinx
      championName: "Jinx",
      teamId: 100,
      isLocal: true,
      role: "mid",
      kills: 18,
      deaths: 6,
      assists: 19,
      kda: 6.17,
      killParticipation: 0,
      championLevel: 16,
      spells: [4, 32], // Flash, Mark/Dash
      items: [3031, 3046, 3006, 3072, 3094, 3153, 0],
      primaryRuneId: 8008,
      secondaryStyleId: 8200,
      totalDamage: 38500,
      physicalDamage: 34000,
      magicDamage: 1500,
      trueDamage: 3000,
      damageShare: 0,
      dpm: 0,
      damageTaken: 19200,
      damageSelfMitigated: 8400,
      totalHeal: 3200,
      cs: 68,
      csPerMin: 0,
      goldEarned: 16400,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 7200,
      turretDamage: 6400,
      turretKills: 2,
      inhibitorKills: 1,
      ccTime: 18,
      timeCCingOthers: 14,
      firstBloodKill: true,
      largestMultiKill: 4,
      largestKillingSpree: 8,
      enemyJungleCS: 0,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 2,
      summonerName: "LightBinder#EUW",
      gameName: "LightBinder",
      tagLine: "EUW",
      championId: 99, // Lux
      championName: "Lux",
      teamId: 100,
      isLocal: false,
      role: "mid",
      kills: 11,
      deaths: 4,
      assists: 26,
      kda: 9.25,
      killParticipation: 0,
      championLevel: 15,
      spells: [4, 32],
      items: [6653, 3089, 3020, 3157, 4645, 0, 0],
      primaryRuneId: 8229,
      secondaryStyleId: 8300,
      totalDamage: 32000,
      physicalDamage: 1200,
      magicDamage: 28800,
      trueDamage: 2000,
      damageShare: 0,
      dpm: 0,
      damageTaken: 14800,
      damageSelfMitigated: 11200,
      totalHeal: 1400,
      cs: 45,
      csPerMin: 0,
      goldEarned: 14200,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 3400,
      turretDamage: 2800,
      turretKills: 1,
      inhibitorKills: 0,
      ccTime: 36,
      timeCCingOthers: 29,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 5,
      enemyJungleCS: 0,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 3,
      summonerName: "AnchorTitan#EUW",
      gameName: "AnchorTitan",
      tagLine: "EUW",
      championId: 111, // Nautilus
      championName: "Nautilus",
      teamId: 100,
      isLocal: false,
      role: "support",
      kills: 4,
      deaths: 7,
      assists: 31,
      kda: 5.0,
      killParticipation: 0,
      championLevel: 15,
      spells: [4, 32],
      items: [3068, 3111, 3190, 3075, 0, 0, 0],
      primaryRuneId: 8439,
      secondaryStyleId: 8300,
      totalDamage: 12400,
      physicalDamage: 2100,
      magicDamage: 9500,
      trueDamage: 800,
      damageShare: 0,
      dpm: 0,
      damageTaken: 34000,
      damageSelfMitigated: 28000,
      totalHeal: 4200,
      cs: 22,
      csPerMin: 0,
      goldEarned: 11200,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 1200,
      turretDamage: 1200,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 58,
      timeCCingOthers: 44,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 2,
      enemyJungleCS: 0,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 4,
      summonerName: "ShockCannon#EUW",
      gameName: "ShockCannon",
      tagLine: "EUW",
      championId: 126, // Jayce
      championName: "Jayce",
      teamId: 100,
      isLocal: false,
      role: "top",
      kills: 8,
      deaths: 5,
      assists: 15,
      kda: 4.6,
      killParticipation: 0,
      championLevel: 15,
      spells: [4, 32],
      items: [3142, 6692, 3158, 3071, 0, 0, 0],
      primaryRuneId: 8010,
      secondaryStyleId: 8100,
      totalDamage: 27500,
      physicalDamage: 25000,
      magicDamage: 1500,
      trueDamage: 1000,
      damageShare: 0,
      dpm: 0,
      damageTaken: 18500,
      damageSelfMitigated: 9800,
      totalHeal: 2100,
      cs: 52,
      csPerMin: 0,
      goldEarned: 13400,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 3800,
      turretDamage: 3400,
      turretKills: 1,
      inhibitorKills: 0,
      ccTime: 12,
      timeCCingOthers: 8,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 4,
      enemyJungleCS: 0,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 5,
      summonerName: "RockSolid#EUW",
      gameName: "RockSolid",
      tagLine: "EUW",
      championId: 54, // Malphite
      championName: "Malphite",
      teamId: 100,
      isLocal: false,
      role: "top",
      kills: 6,
      deaths: 8,
      assists: 22,
      kda: 3.5,
      killParticipation: 0,
      championLevel: 14,
      spells: [4, 32],
      items: [3068, 3110, 3111, 3001, 0, 0, 0],
      primaryRuneId: 8229,
      secondaryStyleId: 8400,
      totalDamage: 19800,
      physicalDamage: 3100,
      magicDamage: 15800,
      trueDamage: 900,
      damageShare: 0,
      dpm: 0,
      damageTaken: 29000,
      damageSelfMitigated: 22000,
      totalHeal: 1800,
      cs: 34,
      csPerMin: 0,
      goldEarned: 11800,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 1600,
      turretDamage: 1400,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 42,
      timeCCingOthers: 32,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 3,
      enemyJungleCS: 0,
      win: localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
  ];

  const mockRed: PostGameParticipant[] = [
    {
      participantId: 6,
      summonerName: "VoidSeeker#EUW",
      gameName: "VoidSeeker",
      tagLine: "EUW",
      championId: 145, // Kai'Sa
      championName: "Kai'Sa",
      teamId: 200,
      isLocal: false,
      role: "adc",
      kills: 14,
      deaths: 9,
      assists: 11,
      kda: 2.78,
      killParticipation: 0,
      championLevel: 15,
      spells: [4, 32],
      items: [3115, 3089, 3020, 3157, 0, 0, 0],
      primaryRuneId: 8008,
      secondaryStyleId: 8200,
      totalDamage: 31200,
      physicalDamage: 13000,
      magicDamage: 15200,
      trueDamage: 3000,
      damageShare: 0,
      dpm: 0,
      damageTaken: 22400,
      damageSelfMitigated: 9200,
      totalHeal: 2800,
      cs: 62,
      csPerMin: 0,
      goldEarned: 14600,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 2400,
      turretDamage: 1800,
      turretKills: 1,
      inhibitorKills: 0,
      ccTime: 8,
      timeCCingOthers: 5,
      firstBloodKill: false,
      largestMultiKill: 3,
      largestKillingSpree: 5,
      enemyJungleCS: 0,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 7,
      summonerName: "EventHorizon#EUW",
      gameName: "EventHorizon",
      tagLine: "EUW",
      championId: 45, // Veigar
      championName: "Veigar",
      teamId: 200,
      isLocal: false,
      role: "mid",
      kills: 7,
      deaths: 8,
      assists: 14,
      kda: 2.63,
      killParticipation: 0,
      championLevel: 14,
      spells: [4, 32],
      items: [6655, 3089, 3020, 3135, 0, 0, 0],
      primaryRuneId: 8229,
      secondaryStyleId: 8300,
      totalDamage: 24500,
      physicalDamage: 800,
      magicDamage: 22500,
      trueDamage: 1200,
      damageShare: 0,
      dpm: 0,
      damageTaken: 17800,
      damageSelfMitigated: 7400,
      totalHeal: 1100,
      cs: 41,
      csPerMin: 0,
      goldEarned: 12800,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 1200,
      turretDamage: 900,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 44,
      timeCCingOthers: 33,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 3,
      enemyJungleCS: 0,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 8,
      summonerName: "SunLight#EUW",
      gameName: "SunLight",
      tagLine: "EUW",
      championId: 89, // Leona
      championName: "Leona",
      teamId: 200,
      isLocal: false,
      role: "support",
      kills: 2,
      deaths: 11,
      assists: 19,
      kda: 1.91,
      killParticipation: 0,
      championLevel: 14,
      spells: [4, 32],
      items: [3190, 3111, 3075, 3068, 0, 0, 0],
      primaryRuneId: 8439,
      secondaryStyleId: 8300,
      totalDamage: 9800,
      physicalDamage: 1800,
      magicDamage: 7200,
      trueDamage: 800,
      damageShare: 0,
      dpm: 0,
      damageTaken: 36000,
      damageSelfMitigated: 29000,
      totalHeal: 3800,
      cs: 18,
      csPerMin: 0,
      goldEarned: 9800,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 400,
      turretDamage: 400,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 52,
      timeCCingOthers: 41,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 1,
      enemyJungleCS: 0,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 9,
      summonerName: "MysticShot#EUW",
      gameName: "MysticShot",
      tagLine: "EUW",
      championId: 81, // Ezreal
      championName: "Ezreal",
      teamId: 200,
      isLocal: false,
      role: "adc",
      kills: 5,
      deaths: 8,
      assists: 12,
      kda: 2.13,
      killParticipation: 0,
      championLevel: 14,
      spells: [4, 32],
      items: [3078, 3042, 3158, 3072, 0, 0, 0],
      primaryRuneId: 8008,
      secondaryStyleId: 8300,
      totalDamage: 22400,
      physicalDamage: 16000,
      magicDamage: 5200,
      trueDamage: 1200,
      damageShare: 0,
      dpm: 0,
      damageTaken: 16400,
      damageSelfMitigated: 6800,
      totalHeal: 1900,
      cs: 50,
      csPerMin: 0,
      goldEarned: 12100,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 1100,
      turretDamage: 800,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 4,
      timeCCingOthers: 2,
      firstBloodKill: false,
      largestMultiKill: 1,
      largestKillingSpree: 2,
      enemyJungleCS: 0,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
    {
      participantId: 10,
      summonerName: "TheBoss#EUW",
      gameName: "TheBoss",
      tagLine: "EUW",
      championId: 875, // Sett
      championName: "Sett",
      teamId: 200,
      isLocal: false,
      role: "top",
      kills: 6,
      deaths: 11,
      assists: 13,
      kda: 1.73,
      killParticipation: 0,
      championLevel: 14,
      spells: [4, 32],
      items: [3078, 3053, 3111, 3748, 0, 0, 0],
      primaryRuneId: 8010,
      secondaryStyleId: 8400,
      totalDamage: 18900,
      physicalDamage: 12500,
      magicDamage: 1100,
      trueDamage: 5300,
      damageShare: 0,
      dpm: 0,
      damageTaken: 38000,
      damageSelfMitigated: 24000,
      totalHeal: 4100,
      cs: 38,
      csPerMin: 0,
      goldEarned: 11500,
      goldPerMin: 0,
      goldShare: 0,
      visionScore: 0,
      visionPerMin: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      controlWardsBought: 0,
      objectiveDamage: 900,
      turretDamage: 700,
      turretKills: 0,
      inhibitorKills: 0,
      ccTime: 38,
      timeCCingOthers: 27,
      firstBloodKill: false,
      largestMultiKill: 2,
      largestKillingSpree: 3,
      enemyJungleCS: 0,
      win: !localIsWinner,
      rank: 0,
      isMvp: false,
      isAce: false,
      isSvp: false,
      overallScore: 0,
      scoreCombat: 0,
      scoreDamage: 0,
      scoreFarming: 0,
      scoreVision: 0,
      scoreObjective: 0,
      badges: [],
    },
  ];

  const baseMatch: PostGameMatch = {
    gameId: "6910384721",
    gameDuration: durationSeconds,
    gameCreation: Date.now() - 1124 * 1000,
    gameMode: "ARAM",
    modeType: "aram",
    queueId: 450,
    queueLabel: "ARAM",
    localPlayerWon: localIsWinner,
    mvp: mockBlue[0],
    blueTeam: {
      teamId: 100,
      win: localIsWinner,
      bans: [],
      totalKills: 0,
      totalDeaths: 0,
      totalDamage: 0,
      totalGold: 0,
      dragonKills: 0,
      baronKills: 0,
      towerKills: 4,
      participants: mockBlue,
    },
    redTeam: {
      teamId: 200,
      win: !localIsWinner,
      bans: [],
      totalKills: 0,
      totalDeaths: 0,
      totalDamage: 0,
      totalGold: 0,
      dragonKills: 0,
      baronKills: 0,
      towerKills: 1,
      participants: mockRed,
    },
    allParticipants: [...mockBlue, ...mockRed],
  };

  return computeMatchScoresAndBadges(baseMatch);
}
