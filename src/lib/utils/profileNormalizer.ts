import type {
  FullPlayerProfile,
  RankedQueueInfo,
  ChampionPerformance,
  PlayerMatch,
  DetailedParticipant,
} from "../types";
import { queueNameFromId, tierMedalUrl } from "./ddragon";

function parseDivision(div: any): string {
  if (!div) return "";
  const s = String(div).trim().toUpperCase();
  if (s === "1") return "I";
  if (s === "2") return "II";
  if (s === "3") return "III";
  if (s === "4") return "IV";
  return s;
}

export function normalizeProfile(
  raw: any,
  defaultRegion = "EUW",
  matches?: PlayerMatch[]
): FullPlayerProfile {
  if (!raw) {
    return {
      game_name: "Summoner",
      tag_line: defaultRegion,
      display_name: `Summoner#${defaultRegion}`,
      level: 1,
      region: defaultRegion,
      solo_rank: null,
      flex_rank: null,
      top_champions: [],
      source: "cache",
      updated_at: Date.now(),
    };
  }

  // 1. LCU Source
  if (raw.source === "lcu") {
    const sum = raw.summoner || {};
    const ranked = raw.ranked || {};
    const gn = sum.game_name || sum.display_name?.split("#")[0] || "Summoner";
    const tl = sum.tag_line || sum.display_name?.split("#")[1] || defaultRegion;
    const disp = sum.display_name || `${gn}#${tl}`;

    let soloRank: RankedQueueInfo | null = null;
    if (ranked.solo && ranked.solo.tier && ranked.solo.tier !== "NONE") {
      const wins = ranked.solo.wins || 0;
      const losses = ranked.solo.losses || 0;
      const total = wins + losses;
      soloRank = {
        queue_type: "RANKED_SOLO_5x5",
        queue_label: "Ranked Solo/Duo",
        tier: ranked.solo.tier.toUpperCase(),
        division: parseDivision(ranked.solo.division),
        league_points: ranked.solo.league_points || 0,
        wins,
        losses,
        win_rate: total > 0 ? wins / total : 0,
        tier_image_url: tierMedalUrl(ranked.solo.tier),
      };
    }

    let flexRank: RankedQueueInfo | null = null;
    if (ranked.flex && ranked.flex.tier && ranked.flex.tier !== "NONE") {
      const wins = ranked.flex.wins || 0;
      const losses = ranked.flex.losses || 0;
      const total = wins + losses;
      flexRank = {
        queue_type: "RANKED_FLEX_SR",
        queue_label: "Ranked Flex",
        tier: ranked.flex.tier.toUpperCase(),
        division: parseDivision(ranked.flex.division),
        league_points: ranked.flex.league_points || 0,
        wins,
        losses,
        win_rate: total > 0 ? wins / total : 0,
        tier_image_url: tierMedalUrl(ranked.flex.tier),
      };
    }

    // Top champions: check OP.GG enriched season stats first!
    const opggData =
      raw.opgg?.summoner ||
      raw.opgg?.data?.summoner ||
      raw.opgg?.data ||
      raw.opgg ||
      {};
    const opggMostList =
      opggData.most_champions?.champion_stats ||
      opggData.ranked_most_champions?.my_champion_stats ||
      opggData.recent_champion_stats;

    let topChamps: ChampionPerformance[] = [];

    if (Array.isArray(opggMostList) && opggMostList.length > 0) {
      for (const c of opggMostList.slice(0, 7)) {
        const id = c.id || c.champion_id || 0;
        const name = c.champion_name || c.name || `Champion ${id}`;
        const play = c.play || (c.win || 0) + (c.lose || 0) || 1;
        const win = c.win || 0;
        const lose = c.lose || Math.max(0, play - win);
        const kills = c.kill || c.basic?.kill || 0;
        const deaths = c.death || c.basic?.death || 0;
        const assists = c.assist || c.basic?.assist || 0;
        const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;

        topChamps.push({
          id,
          name,
          games: play,
          wins: win,
          losses: lose,
          win_rate: play > 0 ? win / play : 0,
          kills: play > 0 ? Math.round((kills / play) * 10) / 10 : kills,
          deaths: play > 0 ? Math.round((deaths / play) * 10) / 10 : deaths,
          assists: play > 0 ? Math.round((assists / play) * 10) / 10 : assists,
          kda: Math.round(kda * 100) / 100,
          cs: c.minion_kill ? Math.round(c.minion_kill / play) : undefined,
          cs_per_min:
            c.minion_kill && c.game_length_second
              ? Math.round((c.minion_kill / (c.game_length_second / 60)) * 10) / 10
              : undefined,
        });
      }
    } else {
      // Fallback: aggregate performance from match history, and attach mastery info
      const champStatsMap = new Map<number, {
        games: number;
        wins: number;
        losses: number;
        kills: number;
        deaths: number;
        assists: number;
        cs: number;
        duration: number;
      }>();

      if (Array.isArray(matches) && matches.length > 0) {
        for (const m of matches) {
          if (!m.champion_id) continue;
          let entry = champStatsMap.get(m.champion_id);
          if (!entry) {
            entry = { games: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, cs: 0, duration: 0 };
            champStatsMap.set(m.champion_id, entry);
          }
          entry.games++;
          if (m.win) entry.wins++;
          else entry.losses++;
          entry.kills += m.kills;
          entry.deaths += m.deaths;
          entry.assists += m.assists;
          entry.cs += m.cs;
          entry.duration += m.game_duration;
        }
      }

      // Build mastery map
      const masteryMap = new Map<number, { level: number; points: number }>();
      if (Array.isArray(raw.mastery)) {
        for (const m of raw.mastery) {
          masteryMap.set(m.championId, {
            level: m.championLevel || 1,
            points: m.championPoints || 0,
          });
        }
      }

      const sortedFromMatches = Array.from(champStatsMap.entries())
        .sort((a, b) => b[1].games - a[1].games);

      const addedIds = new Set<number>();

      for (const [champId, stat] of sortedFromMatches) {
        addedIds.add(champId);
        const mastery = masteryMap.get(champId);
        const kda = stat.deaths > 0 ? (stat.kills + stat.assists) / stat.deaths : (stat.kills + stat.assists);
        topChamps.push({
          id: champId,
          name: `Champion ${champId}`,
          games: stat.games,
          wins: stat.wins,
          losses: stat.losses,
          win_rate: stat.games > 0 ? stat.wins / stat.games : 0,
          kills: Math.round((stat.kills / stat.games) * 10) / 10,
          deaths: Math.round((stat.deaths / stat.games) * 10) / 10,
          assists: Math.round((stat.assists / stat.games) * 10) / 10,
          kda: Math.round(kda * 100) / 100,
          cs: Math.round(stat.cs / stat.games),
          cs_per_min: stat.duration > 0 ? Math.round((stat.cs / (stat.duration / 60)) * 10) / 10 : 0,
          mastery_level: mastery?.level,
          mastery_points: mastery?.points,
        });
      }

      if (Array.isArray(raw.mastery)) {
        for (const m of raw.mastery) {
          if (topChamps.length >= 6) break;
          if (addedIds.has(m.championId)) continue;
          addedIds.add(m.championId);
          topChamps.push({
            id: m.championId,
            name: m.championName || `Champion ${m.championId}`,
            games: 0,
            wins: 0,
            losses: 0,
            win_rate: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            kda: 0,
            mastery_level: m.championLevel || 1,
            mastery_points: m.championPoints || 0,
          });
        }
      }
    }

    // Fallback rank info from OP.GG if LCU ranks are absent
    if (!soloRank || !flexRank) {
      const leagueStats = Array.isArray(opggData.league_stats) ? opggData.league_stats : [];
      for (const ls of leagueStats) {
        const tInfo = ls.tier_info || {};
        const tier = (tInfo.tier || "").toUpperCase();
        if (!tier || tier === "NONE" || tier === "UNRANKED") continue;

        const wins = ls.win || 0;
        const losses = ls.lose || 0;
        const total = wins + losses;
        const qInfo: RankedQueueInfo = {
          queue_type: ls.game_type || "SOLORANKED",
          queue_label: ls.game_type === "FLEXRANKED" ? "Ranked Flex" : "Ranked Solo/Duo",
          tier,
          division: parseDivision(tInfo.division),
          league_points: tInfo.lp || 0,
          wins,
          losses,
          win_rate: total > 0 ? wins / total : 0,
          tier_image_url: tInfo.tier_image_url || tierMedalUrl(tier),
        };

        if (ls.game_type === "FLEXRANKED" && !flexRank) {
          flexRank = qInfo;
        } else if (ls.game_type === "SOLORANKED" && !soloRank) {
          soloRank = qInfo;
        }
      }
    }

    return {
      game_name: gn,
      tag_line: tl,
      display_name: disp,
      level: sum.level || 1,
      profile_icon_id: sum.profile_icon_id,
      region: defaultRegion,
      solo_rank: soloRank,
      flex_rank: flexRank,
      top_champions: topChamps,
      source: "lcu",
      updated_at: Date.now(),
    };
  }

  // 2. OP.GG MCP Source
  const sumData =
    raw.data?.data?.summoner ||
    raw.data?.summoner ||
    raw.summoner ||
    raw.data?.data ||
    raw.data ||
    raw;
  const gn = sumData.game_name || sumData.name || "Summoner";
  const tl = sumData.tagline || sumData.tag_line || defaultRegion;
  const disp = `${gn}#${tl}`;
  const reg = raw.region || defaultRegion;

  let soloRank: RankedQueueInfo | null = null;
  let flexRank: RankedQueueInfo | null = null;

  const leagueStats = Array.isArray(sumData.league_stats) ? sumData.league_stats : [];
  for (const ls of leagueStats) {
    const tInfo = ls.tier_info || {};
    const tier = (tInfo.tier || "").toUpperCase();
    if (!tier || tier === "NONE" || tier === "UNRANKED") continue;

    const wins = ls.win || 0;
    const losses = ls.lose || 0;
    const total = wins + losses;
    const qInfo: RankedQueueInfo = {
      queue_type: ls.game_type || "SOLORANKED",
      queue_label: ls.game_type === "FLEXRANKED" ? "Ranked Flex" : "Ranked Solo/Duo",
      tier,
      division: parseDivision(tInfo.division),
      league_points: tInfo.lp || 0,
      wins,
      losses,
      win_rate: total > 0 ? wins / total : 0,
      tier_image_url: tInfo.tier_image_url || tierMedalUrl(tier),
    };

    if (ls.game_type === "FLEXRANKED") {
      flexRank = qInfo;
    } else if (ls.game_type === "SOLORANKED") {
      soloRank = qInfo;
    }
  }

  // Top champions from most_champions or recent_champion_stats
  const topChamps: ChampionPerformance[] = [];
  const mostList =
    sumData.most_champions?.champion_stats ||
    sumData.ranked_most_champions?.my_champion_stats ||
    sumData.recent_champion_stats ||
    [];

  for (const c of mostList.slice(0, 7)) {
    const id = c.id || c.champion_id || 0;
    const name = c.champion_name || c.name || `Champion ${id}`;
    const play = c.play || (c.win || 0) + (c.lose || 0) || 1;
    const win = c.win || 0;
    const lose = c.lose || Math.max(0, play - win);
    const kills = c.kill || c.basic?.kill || 0;
    const deaths = c.death || c.basic?.death || 0;
    const assists = c.assist || c.basic?.assist || 0;
    const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;

    topChamps.push({
      id,
      name,
      games: play,
      wins: win,
      losses: lose,
      win_rate: play > 0 ? win / play : 0,
      kills: play > 0 ? Math.round((kills / play) * 10) / 10 : kills,
      deaths: play > 0 ? Math.round((deaths / play) * 10) / 10 : deaths,
      assists: play > 0 ? Math.round((assists / play) * 10) / 10 : assists,
      kda: Math.round(kda * 100) / 100,
      cs: c.minion_kill ? Math.round(c.minion_kill / play) : undefined,
      cs_per_min:
        c.minion_kill && c.game_length_second
          ? Math.round((c.minion_kill / (c.game_length_second / 60)) * 10) / 10
          : undefined,
    });
  }

  return {
    game_name: gn,
    tag_line: tl,
    display_name: disp,
    level: sumData.level || 1,
    profile_icon_url: sumData.profile_image_url,
    region: reg,
    solo_rank: soloRank,
    flex_rank: flexRank,
    top_champions: topChamps,
    source: "opgg",
    updated_at: Date.now(),
  };
}

export function normalizeMatches(raw: any, targetNameOrPuuid?: string): PlayerMatch[] {
  if (!raw) return [];

  // 1. LCU Format
  if (raw.source === "lcu" || raw.games?.games || raw.data?.games?.games) {
    const list = raw.data?.games?.games || raw.games?.games || raw.games || [];
    const matches: PlayerMatch[] = [];

    for (const g of list) {
      const dur = g.gameDuration || 0;
      const isRemake = dur > 0 && dur < 300;
      const queueLabel = queueNameFromId(g.queueId);

      // Find target player participant
      let targetPartId = 1;
      const identities = g.participantIdentities || [];
      if (targetNameOrPuuid) {
        const normTarget = targetNameOrPuuid.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matchedIdent = identities.find((ident: any) => {
          const p = ident.player || {};
          const full = `${p.gameName || ""}${p.tagLine || ""}${p.summonerName || ""}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          return full.includes(normTarget) || p.puuid === targetNameOrPuuid;
        });
        if (matchedIdent) {
          targetPartId = matchedIdent.participantId;
        }
      }

      const participants = g.participants || [];
      const targetP = participants.find((p: any) => p.participantId === targetPartId) || participants[0];
      if (!targetP) continue;

      const stats = targetP.stats || {};
      const kills = stats.kills || 0;
      const deaths = stats.deaths || 0;
      const assists = stats.assists || 0;
      const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;
      const cs = (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0);
      const csPerMin = dur > 0 ? Math.round((cs / (dur / 60)) * 10) / 10 : 0;

      // Collect items (0..6)
      const items: number[] = [
        stats.item0 || 0,
        stats.item1 || 0,
        stats.item2 || 0,
        stats.item3 || 0,
        stats.item4 || 0,
        stats.item5 || 0,
        stats.item6 || 0, // trinket
      ];

      // Calculate total team kills for KP
      const teamId = targetP.teamId;
      let teamKills = 0;
      for (const p of participants) {
        if (p.teamId === teamId) {
          teamKills += p.stats?.kills || 0;
        }
      }
      const kp = teamKills > 0 ? (kills + assists) / teamKills : 0;

      // Normalized detailed participants
      const detailedParticipants: DetailedParticipant[] = participants.map((p: any) => {
        const ident = identities.find((i: any) => i.participantId === p.participantId)?.player || {};
        const pStats = p.stats || {};
        return {
          summoner_name: ident.gameName || ident.summonerName || `Player ${p.participantId}`,
          game_name: ident.gameName,
          tag_line: ident.tagLine,
          champion_id: p.championId,
          champion_name: "",
          team_id: p.teamId,
          is_local: p.participantId === targetPartId,
          kills: pStats.kills || 0,
          deaths: pStats.deaths || 0,
          assists: pStats.assists || 0,
          champion_level: pStats.champLevel || 1,
          total_damage: pStats.totalDamageDealtToChampions || 0,
          gold_earned: pStats.goldEarned || 0,
          cs: (pStats.totalMinionsKilled || 0) + (pStats.neutralMinionsKilled || 0),
          vision_score: pStats.visionScore || 0,
          spells: [p.spell1Id, p.spell2Id].filter(Boolean),
          items: [
            pStats.item0 || 0,
            pStats.item1 || 0,
            pStats.item2 || 0,
            pStats.item3 || 0,
            pStats.item4 || 0,
            pStats.item5 || 0,
            pStats.item6 || 0,
          ],
          primary_rune_id: pStats.perk0,
          secondary_style_id: pStats.perkSubStyle,
          win: !!pStats.win,
        };
      });

      matches.push({
        id: String(g.gameId),
        game_creation: g.gameCreation,
        game_duration: dur,
        game_type: String(g.queueId),
        queue_label: queueLabel,
        win: !!stats.win,
        is_remake: isRemake,
        champion_id: targetP.championId,
        champion_name: "",
        champion_level: stats.champLevel || 1,
        kills,
        deaths,
        assists,
        kda: Math.round(kda * 100) / 100,
        kill_participation: Math.round(kp * 100) / 100,
        total_damage: stats.totalDamageDealtToChampions || 0,
        gold_earned: stats.goldEarned || 0,
        cs,
        cs_per_min: csPerMin,
        vision_score: stats.visionScore || 0,
        spells: [targetP.spell1Id, targetP.spell2Id].filter(Boolean),
        items,
        primary_rune_id: stats.perk0,
        secondary_style_id: stats.perkSubStyle,
        participants: detailedParticipants,
      });
    }

    return matches;
  }

  // 2. OP.GG MCP Format
  const gameHistory =
    raw.data?.data?.game_history ||
    raw.data?.game_history ||
    raw.game_history ||
    [];
  const matches: PlayerMatch[] = [];

  for (const g of gameHistory) {
    const dur = g.game_length_second || 0;
    const isRemake = dur > 0 && dur < 300;
    const queueLabel = queueNameFromId(g.game_type);

    // In OP.GG list_matches, participants usually contains the target summoner
    const part = g.participants?.[0] || {};
    const stats = part.stats || {};
    const kills = stats.kill || 0;
    const deaths = stats.death || 0;
    const assists = stats.assist || 0;
    const kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;
    const cs = (stats.minion_kill || 0) + (stats.neutral_minion_kill || 0);
    const csPerMin = dur > 0 ? Math.round((cs / (dur / 60)) * 10) / 10 : 0;

    const win = stats.result === "WIN" || stats.result === "win" || stats.win === true;

    // Team kills for KP
    const targetTeamKey = part.team_key;
    const team = g.teams?.find((t: any) => t.key === targetTeamKey || t.team_key === targetTeamKey) || g.teams?.[0];
    const teamKills = team?.game_stat?.champion_kill || team?.champion_kill || 0;
    const kp = teamKills > 0 ? (kills + assists) / teamKills : 0;

    // Items array
    const rawItems: number[] = Array.isArray(part.items) ? part.items : [];
    const items: number[] = [...rawItems];
    while (items.length < 7) {
      items.push(0);
    }

    const primaryRune = part.rune?.primary_rune_id || part.rune?.primary_page_id;
    const secondaryStyle = part.rune?.secondary_page_id;

    matches.push({
      id: String(g.id),
      game_creation: typeof g.created_at === "string" ? new Date(g.created_at).getTime() : (g.created_at || Date.now()),
      raw_created_at: typeof g.created_at === "string" ? g.created_at : undefined,
      game_duration: dur,
      game_type: g.game_type || "SOLORANKED",
      queue_label: queueLabel,
      win,
      is_remake: isRemake,
      champion_id: part.champion_id || 0,
      champion_name: part.champion_name || "",
      champion_level: stats.champion_level || 1,
      kills,
      deaths,
      assists,
      kda: Math.round(kda * 100) / 100,
      kill_participation: Math.round(kp * 100) / 100,
      total_damage: stats.total_damage_dealt_to_champions || 0,
      gold_earned: stats.gold_earned || 0,
      cs,
      cs_per_min: csPerMin,
      vision_score: (stats.ward_place || 0) + (stats.vision_wards_bought_in_game || 0),
      spells: Array.isArray(part.spells) ? part.spells : [],
      items,
      primary_rune_id: primaryRune,
      secondary_style_id: secondaryStyle,
      op_score: stats.op_score,
      op_score_rank: stats.op_score_rank,
    });
  }

  return matches;
}

export function normalizeGameDetail(raw: any, focusNameOrPuuid?: string): DetailedParticipant[] {
  if (!raw) return [];

  // 1. LCU Format
  const lcuData = raw.data?.data || raw.data || raw;
  if (Array.isArray(lcuData.participants) && lcuData.participantIdentities) {
    const identities = lcuData.participantIdentities || [];
    return lcuData.participants.map((p: any) => {
      const ident = identities.find((i: any) => i.participantId === p.participantId)?.player || {};
      const pStats = p.stats || {};
      const isLocal = focusNameOrPuuid
        ? (ident.gameName?.toLowerCase() === focusNameOrPuuid.toLowerCase() ||
           ident.puuid === focusNameOrPuuid ||
           `${ident.gameName || ""}#${ident.tagLine || ""}`.toLowerCase() === focusNameOrPuuid.toLowerCase())
        : false;

      return {
        summoner_name: ident.gameName || ident.summonerName || `Player ${p.participantId}`,
        game_name: ident.gameName,
        tag_line: ident.tagLine,
        champion_id: p.championId,
        champion_name: "",
        team_id: p.teamId,
        is_local: isLocal,
        kills: pStats.kills || 0,
        deaths: pStats.deaths || 0,
        assists: pStats.assists || 0,
        champion_level: pStats.champLevel || 1,
        total_damage: pStats.totalDamageDealtToChampions || 0,
        gold_earned: pStats.goldEarned || 0,
        cs: (pStats.totalMinionsKilled || 0) + (pStats.neutralMinionsKilled || 0),
        vision_score: pStats.visionScore || 0,
        spells: [p.spell1Id, p.spell2Id].filter(Boolean),
        items: [
          pStats.item0 || 0,
          pStats.item1 || 0,
          pStats.item2 || 0,
          pStats.item3 || 0,
          pStats.item4 || 0,
          pStats.item5 || 0,
          pStats.item6 || 0,
        ],
        primary_rune_id: pStats.perk0,
        secondary_style_id: pStats.perkSubStyle,
        win: !!pStats.win,
      };
    });
  }

  // 2. OP.GG Format
  const gameDetail =
    raw.data?.data?.game_detail ||
    raw.data?.game_detail ||
    raw.game_detail ||
    raw.data?.data ||
    raw.data ||
    raw;
  const teams = gameDetail.teams || [];
  const participants: DetailedParticipant[] = [];

  teams.forEach((t: any, tIdx: number) => {
    const teamId = tIdx === 0 ? 100 : 200;
    const parts = t.participants || [];
    for (const p of parts) {
      const stats = p.stats || {};
      const sum = p.summoner || {};
      const rawItems: number[] = Array.isArray(p.items) ? p.items : [];
      const items = [...rawItems];
      while (items.length < 7) items.push(0);

      const isWin = stats.result === "WIN" || stats.result === "win" || stats.win === true;
      const isLocal = p.is_target === true ||
        (focusNameOrPuuid &&
          (sum.game_name?.toLowerCase() === focusNameOrPuuid.toLowerCase() ||
           `${sum.game_name || ""}#${sum.tagline || ""}`.toLowerCase() === focusNameOrPuuid.toLowerCase()));

      participants.push({
        summoner_name: sum.game_name || `Player ${p.champion_id}`,
        game_name: sum.game_name,
        tag_line: sum.tagline,
        champion_id: p.champion_id,
        champion_name: p.champion_name || "",
        team_id: teamId,
        is_local: !!isLocal,
        kills: stats.kill || 0,
        deaths: stats.death || 0,
        assists: stats.assist || 0,
        champion_level: stats.champion_level || 1,
        total_damage: stats.total_damage_dealt_to_champions || 0,
        gold_earned: stats.gold_earned || 0,
        cs: (stats.minion_kill || 0) + (stats.neutral_minion_kill || 0),
        vision_score: (stats.ward_place || 0) + (stats.vision_wards_bought_in_game || 0),
        spells: Array.isArray(p.spells) ? p.spells : [],
        items,
        primary_rune_id: p.rune?.primary_rune_id || p.rune?.primary_page_id,
        secondary_style_id: p.rune?.secondary_page_id,
        op_score: stats.op_score,
        win: isWin,
      });
    }
  });

  return participants;
}
