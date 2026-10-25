/**
 * Utility for resolving official TFT Set 18 icons:
 * Champions, Traits, Items, and Augments from TFT Academy CDN and Data Dragon.
 */

const DDRAGON_VER = "14.20.1";

const SET18_CHAMP_APINAME_MAP: Record<string, string> = {
  azir: "DA_18_Azir",
  rammus: "DA_18_Rammus",
  khazix: "DA_18_KhaZix",
  "kha'zix": "DA_18_KhaZix",
  sentry: "DA_18_Sentry",
  draven: "DA_Draven18",
  ahri: "DA_18_Ahri",
  aphelios: "DA_18_Aphelios",
  cassiopeia: "DA_18_Cassiopeia",
  veigar: "DA_18_Veigar",
  alune: "DA_18_Alune",
  malphite: "DA_18_Malphite",
  zyra: "DA_18_Zyra",
  ezreal: "DA_18_Ezreal",
  kayle: "DA_18_Kayle",
  masteryi: "DA_18_MasterYi_AD",
  "master yi": "DA_18_MasterYi_AD",
  akali: "DA_18_Akali_AD",
  sivir: "DA_18_Sivir",
  elderdragon: "DA_18_ElderDragon",
  "elder dragon": "DA_18_ElderDragon",
  caitlyn: "DA_18_Caitlyn",
  ashe: "DA_18_Ashe",
  teemo: "DA_18_Teemo",
  warwick: "DA_18_Warwick",
  rengar: "DA_18_Rengar",
  elise: "DA_18_Elise",
  tristana: "DA_18_Tristana",
  soraka: "DA_18_Soraka",
  fiddlesticks: "DA_Fiddlesticks18",
  lux: "DA_Lux18_Base",
  ornn: "DA_18_Ornn",
  diana: "DA_18_Diana",
  sett: "DA_18_Sett",
  nidalee: "DA_Nidalee18_AP",
  lifeblossom: "DA_Elderwood18_Lifeblossom",
  stonebark: "DA_Elderwood18_StonebarkTree",
  sprout: "DA_Elderwood18_Sprout",
  cinderling: "DA_Cinderling18",
  murkwolf: "DA_Murkwolf18",
  krug: "DA_Krug18",
  crimsonraptor: "DA_CrimsonRaptor18",
  gromp: "DA_Gromp18",
  scuttle: "DA_Scuttle18",
  alistar: "DA_18_Alistar",
  kennen: "DA_18_Kennen",
  yorick: "DA_18_Yorick",
  karma: "DA_Karma18",
  yunara: "DA_18_Yunara",
  maokai: "DA_Maokai18",
  ivern: "DA_Ivern18",
  gnar: "DA_18_Gnar",
  gnarsmall: "DA_18_Gnar",
  "gnar small": "DA_18_Gnar",
  "lux (inferno)": "DA_Lux18_Base",
  luxinferno: "DA_Lux18_Base",
  lux_inferno: "DA_Lux18_Base",
  da_18_lux_inferno: "DA_Lux18_Base",
  da18luxinferno: "DA_Lux18_Base",
  da_18_ashe: "DA_18_Ashe",
  da_18_ezreal: "DA_18_Ezreal",
  scuttlecrab: "DA_Scuttle18",
  brambleback: "DA_Brambleback18",
  sentinel: "DA_18_Sentry",
  kogmaw: "DA_18_KogMaw",
  "kog'maw": "DA_18_KogMaw",
  reksai: "DA_18_RekSai",
  "rek'sai": "DA_18_RekSai",
  leblanc: "DA_18_LeBlanc",
  hecarim: "DA_18_Hecarim",
  leona: "DA_18_Leona",
  lillia: "DA_18_Lillia",
  morgana: "DA_18_Morgana",
  rakan: "DA_18_Rakan",
  sejuani: "DA_18_Sejuani",
  shen: "DA_18_Shen",
  varus: "DA_18_Varus",
  vi: "DA_18_Vi",
  xayah: "DA_18_Xayah",
  kobuko: "DA_18_Kobuko",
  camille: "DA_18_Camille",
  taric: "DA_18_Taric",
  amumu: "DA_18_Amumu",
};

const SET18_ITEM_APINAME_MAP: Record<string, string> = {
  guinsoos_rageblade: "DA_GuinsoosRageblade",
  "guinsoo's rageblade": "DA_GuinsoosRageblade",
  rabadons_deathcap: "DA_RabadonsDeathcap",
  "rabadon's deathcap": "DA_RabadonsDeathcap",
  hextech_gunblade: "DA_HextechGunblade",
  "hextech gunblade": "DA_HextechGunblade",
  crownguard: "DA_Crownguard",
  gargoyle_stoneplate: "DA_GargoyleStoneplate",
  "gargoyle stoneplate": "DA_GargoyleStoneplate",
  void_staff: "DA_VoidStaff",
  "void staff": "DA_VoidStaff",
  morellonomicon: "DA_Morellonomicon",
  infinity_edge: "DA_InfinityEdge",
  "infinity edge": "DA_InfinityEdge",
  bloodthirster: "DA_Bloodthirster",
  spear_of_shojin: "DA_SpearOfShojin",
  "spear of shojin": "DA_SpearOfShojin",
  jeweled_gauntlet: "DA_JeweledGauntlet",
  "jeweled gauntlet": "DA_JeweledGauntlet",
  blue_buff: "DA_BlueBuff",
  "blue buff": "DA_BlueBuff",
  warmogs_armor: "DA_WarmogsArmor",
  "warmog's armor": "DA_WarmogsArmor",
  bramble_vest: "DA_BrambleVest",
  "bramble vest": "DA_BrambleVest",
  dragons_claw: "DA_DragonsClaw",
  "dragon's claw": "DA_DragonsClaw",
  titans_resolve: "DA_TitansResolve",
  "titan's resolve": "DA_TitansResolve",
  last_whisper: "DA_LastWhisper",
  "last whisper": "DA_LastWhisper",
  sunfire_cape: "DA_SunfireCape",
  "sunfire cape": "DA_SunfireCape",
  ionic_spark: "DA_IonicSpark",
  "ionic spark": "DA_IonicSpark",
  nashors_tooth: "DA_NashorsTooth",
  "nashor's tooth": "DA_NashorsTooth",
  statikk_shiv: "DA_StatikkShiv",
  "statikk shiv": "DA_StatikkShiv",
  edge_of_night: "DA_EdgeOfNight",
  "edge of night": "DA_EdgeOfNight",
  redemption: "DA_Redemption",
  steraks_gage: "DA_SteraksGage",
  "sterak's gage": "DA_SteraksGage",
  red_buff: "DA_RedBuff",
  "red buff": "DA_RedBuff",
  evenshroud: "DA_Evenshroud",
  adaptive_helm: "DA_AdaptiveHelm",
  "adaptive helm": "DA_AdaptiveHelm",
  steadfast_heart: "DA_SteadfastHeart",
  "steadfast heart": "DA_SteadfastHeart",
  thiefs_gloves: "DA_ThiefsGloves",
  "thief's gloves": "DA_ThiefsGloves",
  hand_of_justice: "DA_HandOfJustice",
  "hand of justice": "DA_HandOfJustice",
  quicksilver: "DA_Quicksilver",
  guardbreaker: "DA_Guardbreaker",
  deathblade: "DA_Deathblade",
  giant_slayer: "DA_GiantSlayer",
  "giant slayer": "DA_GiantSlayer",
  protectors_vow: "DA_ProtectorsVow",
  "protector's vow": "DA_ProtectorsVow",
  archangels_staff: "DA_ArchangelsStaff",
  "archangel's staff": "DA_ArchangelsStaff",
  krakens_fury: "DA_KrakensFury",
  "kraken's fury": "DA_KrakensFury",
  strikers_flail: "DA_StrikersFlail",
  "striker's flail": "DA_StrikersFlail",
  spirit_visage: "DA_SpiritVisage",
  "spirit visage": "DA_SpiritVisage",
  tacticians_crown: "DA_TacticiansCrown",
  "tactician's crown": "DA_TacticiansCrown",
  tacticians_cape: "DA_TacticiansCape",
  "tactician's cape": "DA_TacticiansCape",
  tacticians_shield: "DA_TacticiansShield",
  "tactician's shield": "DA_TacticiansShield",
  // Components
  bf_sword: "DA_Component_BFSword",
  "b.f. sword": "DA_Component_BFSword",
  recurve_bow: "DA_Component_RecurveBow",
  "recurve bow": "DA_Component_RecurveBow",
  needlessly_large_rod: "DA_Component_NeedlesslyLargeRod",
  "needlessly large rod": "DA_Component_NeedlesslyLargeRod",
  tear_of_the_goddess: "DA_Component_TearOfTheGoddess",
  "tear of the goddess": "DA_Component_TearOfTheGoddess",
  chain_vest: "DA_Component_ChainVest",
  "chain vest": "DA_Component_ChainVest",
  negatron_cloak: "DA_Component_NegatronCloak",
  "negatron cloak": "DA_Component_NegatronCloak",
  giants_belt: "DA_Component_GiantsBelt",
  "giant's belt": "DA_Component_GiantsBelt",
  sparring_gloves: "DA_Component_SparringGloves",
  "sparring gloves": "DA_Component_SparringGloves",
  spatula: "DA_Component_Spatula",
  frying_pan: "DA_Component_FryingPan",
  "frying pan": "DA_Component_FryingPan",
};

function normalizeChampionName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/Small$/i, "")
    .replace(/\s*\(.*\)/g, "")
    .replace(/[^a-zA-Z]/g, "");
}

export function getTftChampionIcon(nameOrApi: string): string {
  if (!nameOrApi) return "";
  if (nameOrApi.startsWith("http")) return nameOrApi;
  const clean = nameOrApi.toLowerCase().trim();
  const normalized = clean.replace(/[^a-z0-9]/g, "");
  const api =
    SET18_CHAMP_APINAME_MAP[clean] ||
    SET18_CHAMP_APINAME_MAP[normalized];
  if (api) {
    return `https://assets.tftacademy.com/champions/champion_icons/${api}.webp`;
  }
  if (nameOrApi.startsWith("DA_")) {
    return `https://assets.tftacademy.com/champions/champion_icons/${nameOrApi}.webp`;
  }
  // Fallback to DDragon square icon
  const ddragonName = normalizeChampionName(nameOrApi);
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/champion/${ddragonName}.png`;
}

export function getTftChampionFallback(name: string): string {
  const ddragonName = normalizeChampionName(name);
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/champion/${ddragonName}.png`;
}

const SET18_ITEM_DIRECT_MAP: Record<string, string> = {
  "bf_sword": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_BFSword.png",
  "b.f. sword": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_BFSword.png",
  "b.f._sword": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_BFSword.png",
  "recurve_bow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_RecurveBow.png",
  "recurve bow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_RecurveBow.png",
  "needlessly_large_rod": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_NeedlesslyLargeRod.png",
  "needlessly large rod": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_NeedlesslyLargeRod.png",
  "tear_of_the_goddess": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_TearOfTheGoddess.png",
  "tear of the goddess": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_TearOfTheGoddess.png",
  "chain_vest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_ChainVest.png",
  "chain vest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_ChainVest.png",
  "negatron_cloak": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_NegatronCloak.png",
  "negatron cloak": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_NegatronCloak.png",
  "giants_belt": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_GiantsBelt.png",
  "giant's belt": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_GiantsBelt.png",
  "sparring_gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_SparringGloves.png",
  "sparring gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_SparringGloves.png",
  "spatula": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_Spatula.png",
  "frying_pan": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_FryingPan.png",
  "frying pan": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_FryingPan.png",
  "deathblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Deathblade.png",
  "giant_slayer": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GiantSlayer.png",
  "giant slayer": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GiantSlayer.png",
  "hextech_gunblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HextechGunblade.png",
  "hextech gunblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HextechGunblade.png",
  "spear_of_shojin": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpearOfShojin.png",
  "spear of shojin": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpearOfShojin.png",
  "edge_of_night": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_EdgeOfNight.png",
  "edge of night": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_EdgeOfNight.png",
  "bloodthirster": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Bloodthirster.png",
  "steraks_gage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteraksGage.png",
  "sterak's gage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteraksGage.png",
  "infinity_edge": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_InfinityEdge.png",
  "infinity edge": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_InfinityEdge.png",
  "red_buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RedBuff.png",
  "red buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RedBuff.png",
  "guinsoos_rageblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GuinsoosRageblade.png",
  "guinsoo's rageblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GuinsoosRageblade.png",
  "void_staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_VoidStaff.png",
  "void staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_VoidStaff.png",
  "titans_resolve": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TitansResolve.png",
  "titan's resolve": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TitansResolve.png",
  "krakens_fury": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_KrakensFury.png",
  "kraken's fury": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_KrakensFury.png",
  "nashors_tooth": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_NashorsTooth.png",
  "nashor's tooth": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_NashorsTooth.png",
  "last_whisper": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_LastWhisper.png",
  "last whisper": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_LastWhisper.png",
  "rabadons_deathcap": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RabadonsDeathcap.png",
  "rabadon's deathcap": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RabadonsDeathcap.png",
  "archangels_staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ArchangelsStaff.png",
  "archangel's staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ArchangelsStaff.png",
  "crownguard": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Crownguard.png",
  "ionic_spark": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_IonicSpark.png",
  "ionic spark": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_IonicSpark.png",
  "morellonomicon": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Morellonomicon.png",
  "jeweled_gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_JeweledGauntlet.png",
  "jeweled gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_JeweledGauntlet.png",
  "blue_buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BlueBuff.png",
  "blue buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BlueBuff.png",
  "protectors_vow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ProtectorsVow.png",
  "protector's vow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ProtectorsVow.png",
  "adaptive_helm": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_AdaptiveHelm.png",
  "adaptive helm": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_AdaptiveHelm.png",
  "spirit_visage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpiritVisage.png",
  "spirit visage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpiritVisage.png",
  "hand_of_justice": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HandOfJustice.png",
  "hand of justice": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HandOfJustice.png",
  "bramble_vest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BrambleVest.png",
  "bramble vest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BrambleVest.png",
  "gargoyle_stoneplate": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GargoyleStoneplate.png",
  "gargoyle stoneplate": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GargoyleStoneplate.png",
  "sunfire_cape": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SunfireCape.png",
  "sunfire cape": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SunfireCape.png",
  "steadfast_heart": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteadfastHeart.png",
  "steadfast heart": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteadfastHeart.png",
  "dragons_claw": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DragonsClaw.png",
  "dragon's claw": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DragonsClaw.png",
  "evenshroud": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Evenshroud.png",
  "quicksilver": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Quicksilver.png",
  "warmogs_armor": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_WarmogsArmor.png",
  "warmog's armor": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_WarmogsArmor.png",
  "strikers_flail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_StrikersFlail.png",
  "striker's flail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_StrikersFlail.png",
  "thiefs_gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ThiefsGloves.png",
  "thief's gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ThiefsGloves.png",
  "tacticians_crown": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TacticiansCrown.png",
  "tactician's crown": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TacticiansCrown.png",
  "tacticians_cape": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TacticiansCape.png",
  "tactician's cape": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TacticiansCape.png",
  "tacticians_shield": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TacticiansShield.png",
  "tactician's shield": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TacticiansShield.png",
  "fae_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemFae.png",
  "fae emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemFae.png",
  "elderwood_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemElderwood.png",
  "elderwood emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemElderwood.png",
  "blackthorn_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBlackthorn.png",
  "blackthorn emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBlackthorn.png",
  "blossom_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBlossom.png",
  "blossom emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBlossom.png",
  "sprykin_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSprykin.png",
  "sprykin emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSprykin.png",
  "inferno_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemInferno.png",
  "inferno emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemInferno.png",
  "lunar_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemLunar.png",
  "lunar emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemLunar.png",
  "primal_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemPrimal.png",
  "primal emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemPrimal.png",
  "hunter_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemHunter.png",
  "hunter emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemHunter.png",
  "vanguard_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemVanguard.png",
  "vanguard emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemVanguard.png",
  "brawler_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBrawler.png",
  "brawler emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemBrawler.png",
  "spellweaver_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSpellweaver.png",
  "spellweaver emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSpellweaver.png",
  "ravager_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSlayer.png",
  "ravager emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemSlayer.png",
  "rapidfire_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemRapidfire.png",
  "rapidfire emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemRapidfire.png",
  "invoker_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemInvoker.png",
  "invoker emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemInvoker.png",
  "executioner_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemExecutioner.png",
  "executioner emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemExecutioner.png",
  "defender_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemDefender.png",
  "defender emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemDefender.png",
  "juggernaut_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemJuggernaut.png",
  "juggernaut emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemJuggernaut.png",
  "coven_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemCoven.png",
  "coven emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemCoven.png",
  "flora_fatalis_emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemFloraFatalis.png",
  "flora fatalis emblem": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_18_EmblemFloraFatalis.png",
  "radiant_dragon_s_claw": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DragonsClawRadiant.png",
  "radiant dragon's claw": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DragonsClawRadiant.png",
  "radiant_dragons_claw": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DragonsClawRadiant.png",
  "radiant_void_staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_VoidStaffRadiant.png",
  "radiant void staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_VoidStaffRadiant.png",
  "radiant_crownguard": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_CrownguardRadiant.png",
  "radiant crownguard": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_CrownguardRadiant.png",
  "radiant_spirit_visage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpiritVisage_Radiant.png",
  "radiant spirit visage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpiritVisage_Radiant.png",
  "radiant_kraken_s_fury": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_KrakensFury_Radiant.png",
  "radiant kraken's fury": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_KrakensFury_Radiant.png",
  "radiant_krakens_fury": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_KrakensFury_Radiant.png",
  "radiant_jeweled_gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_JeweledGauntletRadiant.png",
  "radiant jeweled gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_JeweledGauntletRadiant.png",
  "radiant_last_whisper": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_LastWhisperRadiant.png",
  "radiant last whisper": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_LastWhisperRadiant.png",
  "radiant_infinity_edge": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_InfinityEdgeRadiant.png",
  "radiant infinity edge": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_InfinityEdgeRadiant.png",
  "radiant_protector_s_vow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ProtectorsVowRadiant.png",
  "radiant protector's vow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ProtectorsVowRadiant.png",
  "radiant_protectors_vow": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ProtectorsVowRadiant.png",
  "radiant_morellonomicon": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_MorellonomiconRadiant.png",
  "radiant morellonomicon": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_MorellonomiconRadiant.png",
  "radiant_sterak_s_gage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteraksGageRadiant.png",
  "radiant sterak's gage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteraksGageRadiant.png",
  "radiant_steraks_gage": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteraksGageRadiant.png",
  "radiant_edge_of_night": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_EdgeOfNightRadiant.png",
  "radiant edge of night": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_EdgeOfNightRadiant.png",
  "radiant_rabadon_s_deathcap": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RabadonsDeathcap_Radiant.png",
  "radiant rabadon's deathcap": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RabadonsDeathcap_Radiant.png",
  "radiant_rabadons_deathcap": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RabadonsDeathcap_Radiant.png",
  "radiant_evenshroud": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_EvenshroudRadiant.png",
  "radiant evenshroud": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_EvenshroudRadiant.png",
  "radiant_bloodthirster": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BloodthirsterRadiant.png",
  "radiant bloodthirster": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BloodthirsterRadiant.png",
  "radiant_archangel_s_staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ArchangelsStaffRadiant.png",
  "radiant archangel's staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ArchangelsStaffRadiant.png",
  "radiant_archangels_staff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ArchangelsStaffRadiant.png",
  "radiant_deathblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DeathbladeRadiant.png",
  "radiant deathblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_DeathbladeRadiant.png",
  "radiant_spear_of_shojin": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpearOfShojinRadiant.png",
  "radiant spear of shojin": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SpearOfShojinRadiant.png",
  "radiant_giant_slayer": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GiantSlayer_Radiant.png",
  "radiant giant slayer": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GiantSlayer_Radiant.png",
  "radiant_titan_s_resolve": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TitansResolve_Radiant.png",
  "radiant titan's resolve": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TitansResolve_Radiant.png",
  "radiant_titans_resolve": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_TitansResolve_Radiant.png",
  "radiant_hand_of_justice": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HandOfJusticeRadiant.png",
  "radiant hand of justice": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HandOfJusticeRadiant.png",
  "radiant_guinsoo_s_rageblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GuinsoosRagebladeRadiant.png",
  "radiant guinsoo's rageblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GuinsoosRagebladeRadiant.png",
  "radiant_guinsoos_rageblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GuinsoosRagebladeRadiant.png",
  "radiant_hextech_gunblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HextechGunbladeRadiant.png",
  "radiant hextech gunblade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_HextechGunbladeRadiant.png",
  "radiant_ionic_spark": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_IonicSparkRadiant.png",
  "radiant ionic spark": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_IonicSparkRadiant.png",
  "radiant_striker_s_flail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_StrikersFlailRadiant.png",
  "radiant striker's flail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_StrikersFlailRadiant.png",
  "radiant_strikers_flail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_StrikersFlailRadiant.png",
  "radiant_blue_buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BlueBuffRadiant.png",
  "radiant blue buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BlueBuffRadiant.png",
  "radiant_thief_s_gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ThiefsGlovesRadiant.png",
  "radiant thief's gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ThiefsGlovesRadiant.png",
  "radiant_thiefs_gloves": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_ThiefsGlovesRadiant.png",
  "radiant_quicksilver": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_QuicksilverRadiant.png",
  "radiant quicksilver": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_QuicksilverRadiant.png",
  "radiant_sunfire_cape": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SunfireCape_Radiant.png",
  "radiant sunfire cape": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SunfireCape_Radiant.png",
  "radiant_red_buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RedBuffRadiant.png",
  "radiant red buff": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_RedBuffRadiant.png",
  "radiant_adaptive_helm": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_AdaptiveHelm_Radiant.png",
  "radiant adaptive helm": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_AdaptiveHelm_Radiant.png",
  "radiant_warmog_s_armor": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_WarmogsArmorRadiant.png",
  "radiant warmog's armor": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_WarmogsArmorRadiant.png",
  "radiant_warmogs_armor": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_WarmogsArmorRadiant.png",
  "radiant_steadfast_heart": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteadfastHeartRadiant.png",
  "radiant steadfast heart": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_SteadfastHeartRadiant.png",
  "radiant_bramble_vest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BrambleVestRadiant.png",
  "radiant bramble vest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_BrambleVestRadiant.png",
  "radiant_gargoyle_stoneplate": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GargoyleStoneplate_Radiant.png",
  "radiant gargoyle stoneplate": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_GargoyleStoneplate_Radiant.png",
  "radiant_nashor_s_tooth": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_NashorsToothRadiant.png",
  "radiant nashor's tooth": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_NashorsToothRadiant.png",
  "radiant_nashors_tooth": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_NashorsToothRadiant.png",
  "artifact_wit_s_end": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_WitsEnd.png",
  "wit's end": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_WitsEnd.png",
  "wits_end": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_WitsEnd.png",
  "artifact_mittens": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Mittens.png",
  "mittens": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Mittens.png",
  "artifact_titanic_hydra": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_TitanicHydra.png",
  "titanic hydra": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_TitanicHydra.png",
  "titanic_hydra": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_TitanicHydra.png",
  "artifact_zhonya_s_paradox": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_ZhonyasParadox.png",
  "zhonya's paradox": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_ZhonyasParadox.png",
  "zhonyas_paradox": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_ZhonyasParadox.png",
  "artifact_void_gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_VoidGauntlet.png",
  "void gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_VoidGauntlet.png",
  "void_gauntlet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_VoidGauntlet.png",
  "artifact_lightshield_crest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LightshieldCrest.png",
  "lightshield crest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LightshieldCrest.png",
  "lightshield_crest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LightshieldCrest.png",
  "artifact_luden_s_tempest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LudensTempest.png",
  "luden's tempest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LudensTempest.png",
  "ludens_tempest": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LudensTempest.png",
  "artifact_rapid_firecannon": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_RapidFireCannon.png",
  "rapid firecannon": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_RapidFireCannon.png",
  "rapid_firecannon": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_RapidFireCannon.png",
  "artifact_hellfire_hatchet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_HellfireHatchet.png",
  "hellfire hatchet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_HellfireHatchet.png",
  "hellfire_hatchet": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_HellfireHatchet.png",
  "artifact_lich_bane": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LichBane.png",
  "lich bane": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LichBane.png",
  "lich_bane": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_LichBane.png",
  "artifact_forbidden_idol": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_ForbiddenIdol.png",
  "forbidden idol": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_ForbiddenIdol.png",
  "forbidden_idol": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_ForbiddenIdol.png",
  "artifact_fishbones": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Fishbones.png",
  "fishbones": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Fishbones.png",
  "artifact_aegis_of_dusk": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_AegisOfDusk.png",
  "aegis of dusk": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_AegisOfDusk.png",
  "aegis_of_dusk": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_AegisOfDusk.png",
  "artifact_gold_collector": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_GoldCollector.png",
  "gold collector": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_GoldCollector.png",
  "gold_collector": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_GoldCollector.png",
  "artifact_statikk_shiv": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_StatikkShiv.png",
  "statikk shiv": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_StatikkShiv.png",
  "statikk_shiv": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_StatikkShiv.png",
  "artifact_horizon_focus": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_HorizonFocus.png",
  "horizon focus": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_HorizonFocus.png",
  "horizon_focus": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_HorizonFocus.png",
  "artifact_dawncore": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Dawncore.png",
  "dawncore": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Dawncore.png",
  "artifact_the_indomitable": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_TheIndomitable.png",
  "the indomitable": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_TheIndomitable.png",
  "the_indomitable": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_TheIndomitable.png",
  "artifact_aegis_of_dawn": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_AegisOfDawn.png",
  "aegis of dawn": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_AegisOfDawn.png",
  "aegis_of_dawn": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_AegisOfDawn.png",
  "artifact_seeker_s_armguard": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_SeekersArmguard.png",
  "seeker's armguard": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_SeekersArmguard.png",
  "seekers_armguard": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_SeekersArmguard.png",
  "artifact_eternal_pact": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_EternalPact.png",
  "eternal pact": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_EternalPact.png",
  "eternal_pact": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_EternalPact.png",
  "artifact_silvermere_dawn": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_SilvermereDawn.png",
  "silvermere dawn": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_SilvermereDawn.png",
  "silvermere_dawn": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_SilvermereDawn.png",
  "artifact_hullcrusher": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Hullcrusher.png",
  "hullcrusher": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Hullcrusher.png",
  "artifact_manazane": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Manazane.png",
  "manazane": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_Manazane.png",
  "artifact_gambler_s_blade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_GamblersBlade.png",
  "gambler's blade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_GamblersBlade.png",
  "gamblers_blade": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_GamblersBlade.png",
  "artifact_infinity_force": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_InfinityForce.png",
  "infinity force": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_InfinityForce.png",
  "infinity_force": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_InfinityForce.png",
  "artifact_flickerblades": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_NavoriFlickerblade.png",
  "flickerblades": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_NavoriFlickerblade.png",
  "artifact_mogul_s_mail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_MogulsMail.png",
  "mogul's mail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_MogulsMail.png",
  "moguls_mail": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_MogulsMail.png",
  "artifact_blighting_jewel": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_BlightingJewel.png",
  "blighting jewel": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_BlightingJewel.png",
  "blighting_jewel": "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Artifact_BlightingJewel.png",
};

export function getTftItemIcon(idOrName: string): string {
  if (!idOrName) return "";
  if (idOrName.startsWith("http")) return idOrName;
  if (idOrName.startsWith("DA_")) {
    return `https://c-tft-api.op.gg/img/set/18/tft-item/${idOrName}.png`;
  }
  const clean = idOrName.toLowerCase().trim();
  const normalizedKey = clean.replace(/[\s-]/g, "_").replace(/[']/g, "");
  if (SET18_ITEM_DIRECT_MAP[clean] || SET18_ITEM_DIRECT_MAP[normalizedKey]) {
    return SET18_ITEM_DIRECT_MAP[clean] || SET18_ITEM_DIRECT_MAP[normalizedKey];
  }
  const api =
    SET18_ITEM_APINAME_MAP[clean] ||
    SET18_ITEM_APINAME_MAP[normalizedKey];
  if (api) {
    return `https://c-tft-api.op.gg/img/set/18/tft-item/${api}.png`;
  }
  return `https://c-tft-api.op.gg/img/set/18/tft-item/DA_${clean}.png`;
}

const TRAIT_ICON_MAP: Record<string, string> = {
  // Set 18 Official Trait Icons (Community Dragon)
  fae: "trait_icon_18_fae.png",
  elderwood: "trait_icon_18_elderwood.png",
  blackthorn: "trait_icon_18_oldgod.png",
  oldgod: "trait_icon_18_oldgod.png",
  blossom: "trait_icon_18_blossom.png",
  sprykin: "trait_icon_18_sprykin.png",
  inferno: "trait_icon_18_inferno.png",
  lunar: "trait_icon_18_lunar.png",
  primal: "trait_icon_18_primal.png",
  hunter: "trait_icon_18_hunter.png",
  vanguard: "trait_icon_18_vanguard.png",
  brawler: "trait_icon_18_brawler.png",
  spellweaver: "trait_icon_18_spellweaver.png",
  ravager: "trait_icon_18_ravager.png",
  rapidfire: "trait_icon_18_rapidfire.png",
  invoker: "trait_icon_18_invoker.png",
  executioner: "trait_icon_18_executioner.png",
  defender: "trait_icon_18_defender.png",
  juggernaut: "trait_icon_18_juggernaut.png",
  coven: "trait_icon_18_coven.png",
  "flora fatalis": "trait_icon_18_florafatalis.png",
  florafatalis: "trait_icon_18_florafatalis.png",
  riftbeast: "trait_icon_18_riftbeast.png",
  apexpredator: "trait_icon_18_apexpredator.png",
  "apex predator": "trait_icon_18_apexpredator.png",
  oldgrowth: "trait_icon_18_oldgrowth.png",
  "old growth": "trait_icon_18_oldgrowth.png",
  lunarwood: "trait_icon_18_lunar.png",
  solar: "trait_icon_13_diplomat.png",
  enforcer: "trait_icon_13_squad.png",
  "black rose": "trait_icon_13_cabal.png",
  conqueror: "trait_icon_13_conqueror.png",
  automata: "trait_icon_13_automata.png",
  dominator: "trait_icon_13_dominator.png",
  watcher: "trait_icon_13_watcher.png",
  bruiser: "trait_icon_6_bruiser.png",
  sniper: "trait_icon_6_sniper.png",
  sorcerer: "trait_icon_3_sorcerer.png",
  sentinel: "trait_icon_10_warden.png",
};

export function getTftTraitIcon(traitName: string): string {
  const clean = traitName.toLowerCase().trim();
  const file = TRAIT_ICON_MAP[clean] || "trait_icon_13_diplomat.png";
  return `https://raw.communitydragon.org/latest/game/assets/ux/traiticons/${file}`;
}

const AUGMENT_ICON_MAP: Record<string, string> = {
  wand_overflow: "DA_WandOverflow.webp",
  solo_plate: "DA_SoloPlate.webp",
  pandoras_items_iii: "DA_PandorasItemsIII.webp",
  silver_spoon: "silver-spoon-i.png",
  cybernetic_implants: "cybernetic1.png",
  item_grab_bag_i: "itemgrabbag1.png",
  cluttered_mind: "dizzy-ii.png",
  rich_get_richer: "richgetricher2.png",
  level_up: "levelup3.png",
  radiant_relics: "radiantrelic-iii.png",
  prismatic_ticket: "goldenticket3.png",
  golden_ticket: "goldenticket2.png",
};

export function getTftAugmentIcon(idOrName: string, fallbackUrl?: string): string {
  if (fallbackUrl && fallbackUrl.startsWith("http")) {
    return fallbackUrl;
  }
  if (idOrName.startsWith("http")) return idOrName;
  if (idOrName.startsWith("DA_")) {
    return `https://assets.tftacademy.com/augments/${idOrName}.webp`;
  }
  const clean = idOrName.toLowerCase().replace(/[\s-]/g, "_").replace(/['!]/g, "");
  const file = AUGMENT_ICON_MAP[clean];
  if (file) {
    if (file.endsWith(".webp")) {
      return `https://assets.tftacademy.com/augments/${file}`;
    }
    return `https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/augments/hexcore/${file}`;
  }
  return `https://raw.communitydragon.org/latest/game/assets/maps/tft/icons/augments/hexcore/silver-spoon-i.png`;
}

// -------------------------------------------------------------
// Official Set 18 Champion Costs (100% verified against OP.GG)
// -------------------------------------------------------------
export const SET18_CHAMPION_COSTS: Record<string, number> = {
  akali: 1,
  ornn: 1,
  pebbles: 1,
  reksai: 1,
  "rek'sai": 1,
  varus: 1,
  veigar: 1,
  xayah: 1,
  leona: 1,
  cinderling: 1,
  yorick: 1,
  karma: 1,
  kobuko: 1,
  camille: 1,
  rakan: 1,
  sentry: 1,
  alistar: 2,
  caitlyn: 2,
  elise: 2,
  kayle: 2,
  leblanc: 2,
  murkwolf: 2,
  scuttlecrab: 2,
  scuttle: 2,
  sejuani: 2,
  teemo: 2,
  warwick: 2,
  yunara: 2,
  shen: 2,
  gromp: 2,
  azir: 3,
  cassiopeia: 3,
  diana: 3,
  fiddlesticks: 3,
  hecarim: 3,
  khazix: 3,
  "kha'zix": 3,
  krug: 3,
  masteryi: 3,
  "master yi": 3,
  rammus: 3,
  rengar: 3,
  tristana: 3,
  vi: 3,
  kogmaw: 3,
  "kog'maw": 3,
  "mama beak": 3,
  crimsonraptor: 3,
  raptor: 3,
  ahri: 4,
  amumu: 4,
  aphelios: 4,
  brambleback: 4,
  ezreal: 4,
  lillia: 4,
  malphite: 4,
  morgana: 4,
  nidalee: 4,
  sentinel: 4,
  sett: 4,
  sivir: 4,
  soraka: 4,
  zyra: 4,
  alune: 5,
  ashe: 5,
  draven: 5,
  elderdragon: 5,
  "elder dragon": 5,
  lux: 5,
  "lux (inferno)": 5,
  luxinferno: 5,
  maokai: 5,
  kennen: 5,
  gnar: 5,
  gnarsmall: 5,
  "gnar small": 5,
  taric: 5,
  ivern: 5,
};

export function getTftChampionCost(nameOrId: string, fallbackCost: number = 3): number {
  if (!nameOrId) return fallbackCost;
  const clean = nameOrId
    .toLowerCase()
    .replace(/^da_18_|^da_|_ad$|_ap$|18$/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (SET18_CHAMPION_COSTS[clean] !== undefined) {
    return SET18_CHAMPION_COSTS[clean];
  }
  const cleanWithSpaces = nameOrId.toLowerCase().trim();
  if (SET18_CHAMPION_COSTS[cleanWithSpaces] !== undefined) {
    return SET18_CHAMPION_COSTS[cleanWithSpaces];
  }
  return fallbackCost;
}

// -------------------------------------------------------------
// TFT Item Recipes and Required Components
// -------------------------------------------------------------
export interface TftComponentItem {
  id: string;
  name: string;
  icon: string;
}

export const TFT_COMPONENTS: Record<string, TftComponentItem> = {
  bf_sword: { id: "bf_sword", name: "B.F. Sword", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_BFSword.png" },
  recurve_bow: { id: "recurve_bow", name: "Recurve Bow", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_RecurveBow.png" },
  needlessly_large_rod: { id: "needlessly_large_rod", name: "Needlessly Large Rod", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_NeedlesslyLargeRod.png" },
  tear_of_the_goddess: { id: "tear_of_the_goddess", name: "Tear of the Goddess", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_TearOfTheGoddess.png" },
  chain_vest: { id: "chain_vest", name: "Chain Vest", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_ChainVest.png" },
  negatron_cloak: { id: "negatron_cloak", name: "Negatron Cloak", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_NegatronCloak.png" },
  giants_belt: { id: "giants_belt", name: "Giant's Belt", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_GiantsBelt.png" },
  sparring_gloves: { id: "sparring_gloves", name: "Sparring Gloves", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_SparringGloves.png" },
  spatula: { id: "spatula", name: "Spatula", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_Spatula.png" },
  frying_pan: { id: "frying_pan", name: "Frying Pan", icon: "https://c-tft-api.op.gg/img/set/18/tft-item/DA_Component_FryingPan.png" },
};

export const TFT_ITEM_RECIPES: Record<string, [string, string]> = {
  // BF combinations
  deathblade: ["bf_sword", "bf_sword"],
  giant_slayer: ["bf_sword", "recurve_bow"],
  hextech_gunblade: ["bf_sword", "needlessly_large_rod"],
  spear_of_shojin: ["bf_sword", "tear_of_the_goddess"],
  edge_of_night: ["bf_sword", "chain_vest"],
  bloodthirster: ["bf_sword", "negatron_cloak"],
  steraks_gage: ["bf_sword", "giants_belt"],
  infinity_edge: ["bf_sword", "sparring_gloves"],
  // Bow combinations
  red_buff: ["recurve_bow", "recurve_bow"],
  guinsoos_rageblade: ["needlessly_large_rod", "recurve_bow"],
  void_staff: ["recurve_bow", "tear_of_the_goddess"],
  titans_resolve: ["chain_vest", "recurve_bow"],
  krakens_fury: ["recurve_bow", "negatron_cloak"],
  nashors_tooth: ["recurve_bow", "giants_belt"],
  last_whisper: ["recurve_bow", "sparring_gloves"],
  // Rod combinations
  rabadons_deathcap: ["needlessly_large_rod", "needlessly_large_rod"],
  archangels_staff: ["needlessly_large_rod", "tear_of_the_goddess"],
  crownguard: ["needlessly_large_rod", "chain_vest"],
  ionic_spark: ["needlessly_large_rod", "negatron_cloak"],
  morellonomicon: ["needlessly_large_rod", "giants_belt"],
  jeweled_gauntlet: ["needlessly_large_rod", "sparring_gloves"],
  // Tear combinations
  blue_buff: ["tear_of_the_goddess", "tear_of_the_goddess"],
  protectors_vow: ["chain_vest", "tear_of_the_goddess"],
  adaptive_helm: ["tear_of_the_goddess", "negatron_cloak"],
  spirit_visage: ["tear_of_the_goddess", "giants_belt"],
  hand_of_justice: ["tear_of_the_goddess", "sparring_gloves"],
  // Vest combinations
  bramble_vest: ["chain_vest", "chain_vest"],
  gargoyle_stoneplate: ["chain_vest", "negatron_cloak"],
  sunfire_cape: ["chain_vest", "giants_belt"],
  steadfast_heart: ["chain_vest", "sparring_gloves"],
  // Cloak combinations
  dragons_claw: ["negatron_cloak", "negatron_cloak"],
  evenshroud: ["negatron_cloak", "giants_belt"],
  quicksilver: ["negatron_cloak", "sparring_gloves"],
  // Belt combinations
  warmogs_armor: ["giants_belt", "giants_belt"],
  strikers_flail: ["giants_belt", "sparring_gloves"],
  // Gloves combination
  thiefs_gloves: ["sparring_gloves", "sparring_gloves"],
  // Tactician combinations
  tacticians_crown: ["spatula", "spatula"],
  tacticians_cape: ["spatula", "frying_pan"],
  tacticians_shield: ["frying_pan", "frying_pan"],
  // Set 18 Spatula Origin Emblems
  fae_emblem: ["spatula", "bf_sword"],
  elderwood_emblem: ["spatula", "chain_vest"],
  blackthorn_emblem: ["spatula", "giants_belt"],
  blossom_emblem: ["spatula", "needlessly_large_rod"],
  sprykin_emblem: ["spatula", "negatron_cloak"],
  inferno_emblem: ["spatula", "recurve_bow"],
  lunar_emblem: ["spatula", "tear_of_the_goddess"],
  solar_emblem: ["spatula", "tear_of_the_goddess"],
  primal_emblem: ["spatula", "sparring_gloves"],
  // Set 18 Frying Pan Class Emblems
  hunter_emblem: ["frying_pan", "bf_sword"],
  vanguard_emblem: ["frying_pan", "chain_vest"],
  brawler_emblem: ["frying_pan", "giants_belt"],
  spellweaver_emblem: ["frying_pan", "needlessly_large_rod"],
  ravager_emblem: ["frying_pan", "negatron_cloak"],
  rapidfire_emblem: ["frying_pan", "recurve_bow"],
  invoker_emblem: ["frying_pan", "tear_of_the_goddess"],
  executioner_emblem: ["frying_pan", "sparring_gloves"],
};

export const TFT_TANK_ITEMS = new Set([
  "gargoyle_stoneplate",
  "warmogs_armor",
  "spirit_visage",
  "sunfire_cape",
  "bramble_vest",
  "dragons_claw",
  "protectors_vow",
  "steadfast_heart",
  "evenshroud",
  "crownguard",
  "ionic_spark",
  "adaptive_helm",
]);

export function isTftTankItem(nameOrId: string): boolean {
  if (!nameOrId) return false;
  const normalized = nameOrId
    .toLowerCase()
    .replace(/^da_/, "")
    .replace(/[^a-z0-9]/g, "");

  for (const item of TFT_TANK_ITEMS) {
    if (item.replace(/[^a-z0-9]/g, "") === normalized) return true;
  }

  // Fallback substring heuristics for tank items
  if (
    normalized.includes("stoneplate") ||
    normalized.includes("warmog") ||
    normalized.includes("visage") ||
    normalized.includes("bramble") ||
    normalized.includes("dragonsclaw") ||
    normalized.includes("protectorsvow") ||
    normalized.includes("steadfast") ||
    normalized.includes("evenshroud") ||
    normalized.includes("sunfire")
  ) {
    return true;
  }

  return false;
}

export function getTftItemRecipe(itemKeyOrName: string): [TftComponentItem, TftComponentItem] | null {
  if (!itemKeyOrName) return null;
  const clean = itemKeyOrName
    .toLowerCase()
    .replace(/^da_/, "")
    .replace(/[^a-z0-9]/g, "");

  const entry = Object.entries(TFT_ITEM_RECIPES).find(([k]) => k.replace(/[^a-z0-9]/g, "") === clean);
  if (!entry) return null;
  const [c1Key, c2Key] = entry[1];
  const c1 = TFT_COMPONENTS[c1Key];
  const c2 = TFT_COMPONENTS[c2Key];
  if (!c1 || !c2) return null;
  return [c1, c2];
}

