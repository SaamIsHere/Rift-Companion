import type {
  PostGameMatch,
  PostGameTeam,
  PostGameParticipant,
  PostGameBadge,
  BadgeTier,
  Role,
} from "../types";
import { queueNameFromId } from "./ddragon";

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
  },
  durationMinutes: number,
  isWinningTeam: boolean
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

  // B. CS Machine (carries/laners & jungle, not support)
  if (p.role !== "support") {
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

  // C. Vision Lord / Map Control
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
      description: "Exceptional vision control and map coverage.",
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
      description: "Above-average ward placement and vision denial.",
      valueDisplay: `${p.visionScore} Vision`,
      priority: 31,
    });
  } else if (p.visionPerMin >= visionThresholdBronze && p.controlWardsBought >= 2) {
    badges.push({
      id: "vision_lord_bronze",
      name: "Warden",
      category: "vision",
      tier: "bronze",
      icon: "👁️",
      description: "Consistent control ward purchases and placement.",
      valueDisplay: `${p.controlWardsBought} Control Wards`,
      priority: 16,
    });
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

  // E. Iron Wall / Tank & Damage Absorber
  const tankedTotal = p.damageTaken + p.damageSelfMitigated;
  if (tankedTotal >= 42000 && p.deaths <= 5) {
    badges.push({
      id: "iron_wall_gold",
      name: "Iron Wall",
      category: "defense",
      tier: "gold",
      icon: "🛡️",
      description: "Massive damage absorbed & mitigated (>42k) with few deaths.",
      valueDisplay: `${(tankedTotal / 1000).toFixed(1)}k Defended`,
      isHighlight: true,
      priority: 52,
    });
  } else if (tankedTotal >= 28000) {
    badges.push({
      id: "iron_wall_silver",
      name: "Damage Sponge",
      category: "defense",
      tier: "silver",
      icon: "🛡️",
      description: "Reliable frontline (>28k damage taken & mitigated).",
      valueDisplay: `${(tankedTotal / 1000).toFixed(1)}k Defended`,
      priority: 32,
    });
  } else if (tankedTotal >= 18000) {
    badges.push({
      id: "iron_wall_bronze",
      name: "Frontline",
      category: "defense",
      tier: "bronze",
      icon: "⛰️",
      description: "Solid frontline tanking for the team.",
      valueDisplay: `${(tankedTotal / 1000).toFixed(1)}k Defended`,
      priority: 17,
    });
  }

  // F. CC Disruptor
  if (p.ccTime >= 65 || p.timeCCingOthers >= 45) {
    badges.push({
      id: "cc_disruptor_gold",
      name: "CC Overlord",
      category: "combat",
      tier: "gold",
      icon: "⚡",
      description: "Kept enemy champions constantly locked down with CC.",
      valueDisplay: `${Math.round(p.ccTime)}s CC`,
      priority: 50,
    });
  } else if (p.ccTime >= 40 || p.timeCCingOthers >= 25) {
    badges.push({
      id: "cc_disruptor_silver",
      name: "Crowd Control",
      category: "combat",
      tier: "silver",
      icon: "⚡",
      description: "Strong crowd control contribution in teamfights.",
      valueDisplay: `${Math.round(p.ccTime)}s CC`,
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

  // Tower Demolisher / Splitpusher
  if (p.turretKills >= 3 || p.turretDamage >= 7500) {
    badges.push({
      id: "achievement_demolisher",
      name: "Wrecking Ball",
      category: "objective",
      tier: "silver",
      icon: "🏰",
      description: "Demolished multiple turrets and shattered enemy structures.",
      valueDisplay: `${p.turretKills} Turrets (${(p.turretDamage / 1000).toFixed(1)}k)`,
      priority: 70,
    });
  }

  // Monster Hunter / Objective Slayer
  if (p.objectiveDamage >= 14000 && p.objectiveDamage >= matchMax.objectiveDamage * 0.75) {
    badges.push({
      id: "achievement_monster_hunter",
      name: "Monster Hunter",
      category: "objective",
      tier: "gold",
      icon: "🐉",
      description: "Primary objective slayer on Dragons, Heralds, and Baron Nashor.",
      valueDisplay: `${(p.objectiveDamage / 1000).toFixed(1)}k Obj Dmg`,
      priority: 75,
    });
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

  // Jungle Invader
  if (p.role === "jungle" && p.enemyJungleCS >= 16) {
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

  // Ward Hunter
  if (p.wardsKilled >= 6) {
    badges.push({
      id: "achievement_ward_hunter",
      name: "Ward Hunter",
      category: "vision",
      tier: "bronze",
      icon: "🕵️",
      description: "Tracked down and destroyed at least 6 enemy wards.",
      valueDisplay: `${p.wardsKilled} Wards Cleared`,
      priority: 60,
    });
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
  } else if (p.dpm >= 800 && p.deaths >= 9) {
    badges.push({
      id: "fun_glass_cannon",
      name: "Glass Cannon",
      category: "fun",
      tier: "bronze",
      icon: "💣",
      description: "Massive damage output, but died very frequently.",
      valueDisplay: `${p.deaths} Deaths`,
      priority: 10,
    });
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
  durationMinutes: number
): {
  overallScore: number;
  scoreCombat: number;
  scoreDamage: number;
  scoreFarming: number;
  scoreVision: number;
  scoreObjective: number;
} {
  // 1. COMBAT SCORE (25% weight)
  // KDA component
  let kdaVal = p.kda;
  let kdaPts = clamp((kdaVal / 4.5) * 6.5, 1.0, 9.5);
  // KP% component
  let kpPts = clamp((p.killParticipation / 0.7) * 7.5, 1.0, 10.0);
  // Multi-kill and First Blood bonuses
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
 * Enriches all participants of a match with scoring, ranks 1-10, and badges.
 */
export function computeMatchScoresAndBadges(match: PostGameMatch): PostGameMatch {
  const durationMinutes = Math.max(1, match.gameDuration / 60);

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
      durationMinutes
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
      p.win
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

  const baseMatch: PostGameMatch = {
    gameId,
    gameDuration,
    gameCreation: game.gameCreation,
    gameMode,
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

  return computeMatchScoresAndBadges(baseMatch);
}

/**
 * Creates an ultra-realistic mock post-game match for instant testing & demonstration.
 */
export function createMockPostGameMatch(localIsWinner = true): PostGameMatch {
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
      items: [3074, 3071, 3111, 3156, 1036, 0, 3364],
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
      items: [3031, 3006, 3094, 3072, 3026, 3036, 3363],
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
