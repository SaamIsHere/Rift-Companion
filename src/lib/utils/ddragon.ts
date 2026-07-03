// Static asset helpers (Data Dragon). Champion icons are keyed by the
// champion's string id (the "key" field), not the numeric id.

/** Champion square portrait URL from its Data Dragon key + version. */
export function squareIconUrl(key: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}

/** Summoner profile icon URL from its numeric icon id + version. */
export function profileIconUrl(iconId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}
