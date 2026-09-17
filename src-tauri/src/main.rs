// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `rift-companion ingest <normalized.json> [db_path]` rebuilds the stats DB
    // from a normalized Champion[] JSON, then exits. No args → launch the app.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("ingest") {
        if let Err(e) = rift_companion_lib::run_ingest(
            args.get(2).map(String::as_str),
            args.get(3).map(String::as_str),
        ) {
            eprintln!("ingest failed: {e:#}");
            std::process::exit(1);
        }
        return;
    }

    if args.get(1).map(String::as_str) == Some("test") {
        run_internal_tests();
        return;
    }

    rift_companion_lib::run();
}

fn run_internal_tests() {
    println!("Running internal test suite...");
    use rift_companion_lib::data::models::Role;
    use rift_companion_lib::data::repository::Repository;
    use rift_companion_lib::draft;
    use rift_companion_lib::engine::{recommend, weights::Weights, BadgeKind};
    use rift_companion_lib::lcu::models::{Action, Bans, ChampSelectSession, PlayerSlot};

    let repo = Repository::load_embedded().expect("embedded dataset loads");

    // Test 1: Zero-Pick baseline state
    {
        let empty_session = ChampSelectSession {
            local_player_cell_id: 0,
            my_team: vec![
                PlayerSlot {
                    cell_id: 0,
                    champion_id: 0,
                    assigned_position: "middle".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                PlayerSlot {
                    cell_id: 1,
                    champion_id: 0,
                    assigned_position: "top".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                PlayerSlot {
                    cell_id: 2,
                    champion_id: 0,
                    assigned_position: "jungle".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                PlayerSlot {
                    cell_id: 3,
                    champion_id: 0,
                    assigned_position: "bottom".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                PlayerSlot {
                    cell_id: 4,
                    champion_id: 0,
                    assigned_position: "utility".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
            ],
            their_team: vec![],
            actions: vec![],
            bans: Bans::default(),
        };

        let state = draft::from_session(&repo, &empty_session);
        assert_eq!(state.local_role, Some(Role::Mid), "local role detected immediately");
        assert_eq!(state.is_locked, false, "not locked");
        assert_eq!(state.local_champion_id, None, "no locked champ");
        assert_eq!(state.hovered_champion_id, None, "no hover");
        assert!(state.allies.is_empty(), "no picks yet in allies");
        assert!(state.enemies.is_empty(), "no enemy picks");

        let recs = recommend(&repo, &state, &Weights::default());
        let mid_count = repo.playable_in(Role::Mid).count();
        assert_eq!(recs.len(), mid_count, "all playable mid champions recommended");
        assert!(!recs.is_empty());
        assert_eq!(recs[0].badges[0].kind, BadgeKind::Neutral);
        assert_eq!(recs[0].badges[0].text, "Solid blind pick for your role");

        for w in recs.windows(2) {
            assert!(w[0].score >= w[1].score, "scores must be sorted descending");
        }
        println!("✓ Test 1 Passed: Zero-Pick baseline state renders role recommendations correctly");
    }

    // Test 2: Teammate hover detection from actions and championPickIntent
    {
        let session = ChampSelectSession {
            local_player_cell_id: 0,
            my_team: vec![
                PlayerSlot {
                    cell_id: 0,
                    champion_id: 0,
                    assigned_position: "middle".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                // Teammate Top locked Malphite (54)
                PlayerSlot {
                    cell_id: 1,
                    champion_id: 54,
                    assigned_position: "top".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 4,
                    spell2_id: 12,
                    ..Default::default()
                },
                // Teammate Jungle hovering Lee Sin (64) via active action
                PlayerSlot {
                    cell_id: 2,
                    champion_id: 0,
                    assigned_position: "jungle".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                // Teammate Bot hovering Jinx (222) via championPickIntent
                PlayerSlot {
                    cell_id: 3,
                    champion_id: 0,
                    assigned_position: "bottom".to_string(),
                    champion_pick_intent: 222,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                // Teammate Sup not picked or hovered yet
                PlayerSlot {
                    cell_id: 4,
                    champion_id: 0,
                    assigned_position: "utility".to_string(),
                    champion_pick_intent: 0,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
            ],
            their_team: vec![],
            actions: vec![vec![
                Action {
                    id: 1,
                    actor_cell_id: 2,
                    champion_id: 64,
                    completed: false,
                    is_in_progress: true,
                    action_type: "pick".to_string(),
                },
            ]],
            bans: Bans::default(),
        };

        let state = draft::from_session(&repo, &session);
        assert_eq!(state.allies.len(), 3, "should detect 3 allies with picks/hovers");

        let malphite_pick = state.allies.iter().find(|p| p.champion_id == 54).expect("Malphite in allies");
        assert_eq!(malphite_pick.is_hover, false, "Malphite is locked");
        assert_eq!(malphite_pick.is_local, false);
        assert_eq!(malphite_pick.role, Some(Role::Top));

        let lee_pick = state.allies.iter().find(|p| p.champion_id == 64).expect("Lee Sin in allies");
        assert_eq!(lee_pick.is_hover, true, "Lee Sin is hovering via action");
        assert_eq!(lee_pick.is_local, false);
        assert_eq!(lee_pick.role, Some(Role::Jungle));

        let jinx_pick = state.allies.iter().find(|p| p.champion_id == 222).expect("Jinx in allies");
        assert_eq!(jinx_pick.is_hover, true, "Jinx is hovering via pick intent");
        assert_eq!(jinx_pick.is_local, false);
        assert_eq!(jinx_pick.role, Some(Role::Adc));

        let recs = recommend(&repo, &state, &Weights::default());
        assert!(recs.iter().all(|r| r.champion_id != 54), "locked teammate champ excluded from recs");
        assert!(recs.iter().all(|r| r.champion_id != 64), "hovered teammate champ excluded from recs");
        assert!(recs.iter().all(|r| r.champion_id != 222), "hovered teammate champ excluded from recs");

        println!("✓ Test 2 Passed: Teammate hovers and locks are properly parsed and excluded from recommendations");
    }

    // Test 3: Local player hover is kept in recommendations and synergy calculates
    {
        let mut session = ChampSelectSession {
            local_player_cell_id: 0,
            my_team: vec![
                // Local player hovering Ahri (103)
                PlayerSlot {
                    cell_id: 0,
                    champion_id: 0,
                    assigned_position: "middle".to_string(),
                    champion_pick_intent: 103,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
                // Teammate Jungle hovering Lee Sin (64)
                PlayerSlot {
                    cell_id: 1,
                    champion_id: 0,
                    assigned_position: "jungle".to_string(),
                    champion_pick_intent: 64,
                    spell1_id: 0,
                    spell2_id: 0,
                    ..Default::default()
                },
            ],
            their_team: vec![],
            actions: vec![],
            bans: Bans::default(),
        };

        let state = draft::from_session(&repo, &session);
        assert_eq!(state.hovered_champion_id, Some(103), "local hover detected");
        assert_eq!(state.is_locked, false, "local is not locked");

        let local_pick = state.allies.iter().find(|p| p.is_local).expect("local pick present");
        assert_eq!(local_pick.champion_id, 103);
        assert_eq!(local_pick.is_hover, true);

        let recs = recommend(&repo, &state, &Weights::default());
        assert!(recs.iter().any(|r| r.champion_id == 103), "local player's hovered champion MUST be in recommendations");

        // Now local player locks in
        session.my_team[0].champion_id = 103;
        let locked_state = draft::from_session(&repo, &session);
        assert_eq!(locked_state.is_locked, true, "local player is now locked");
        assert_eq!(locked_state.local_champion_id, Some(103));
        assert_eq!(locked_state.hovered_champion_id, None);

        let locked_recs = recommend(&repo, &locked_state, &Weights::default());
        assert!(locked_recs.iter().all(|r| r.champion_id != 103), "once locked, local champ is excluded from new picks");

        println!("✓ Test 3 Passed: Local player hover is kept in recommendations until locked in");
    }

    // Test 4: Dynamic comp needs and synergy calculation with hovered allies
    {
        use rift_companion_lib::draft::{DraftPick, DraftState};
        use rift_companion_lib::engine::comp;

        // Zero allies present
        let zero_draft = DraftState {
            local_role: Some(Role::Mid),
            local_champion_id: None,
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![],
            enemies: vec![],
        };
        let zero_needs = comp::needs(&repo, &zero_draft);
        assert!(!zero_needs.needs_ap && !zero_needs.needs_ad && !zero_needs.needs_frontline, "zero picks should not flag gaps");

        // Ally Jungle hovers Lee Sin (64: Physical damage, non-frontline)
        let ad_hover_draft = DraftState {
            local_role: Some(Role::Mid),
            local_champion_id: None,
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![DraftPick {
                champion_id: 64,
                role: Some(Role::Jungle),
                is_local: false,
                is_hover: true,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
            }],
            enemies: vec![],
        };
        let ad_needs = comp::needs(&repo, &ad_hover_draft);
        assert!(ad_needs.needs_ap, "ally hovered AD, so team needs AP");
        assert!(!ad_needs.needs_ad, "ally hovered AD, so team does not need AD");
        assert!(ad_needs.needs_frontline, "ally hovered non-frontline, so team needs frontline");

        // Ally switches hover to an AP frontline tank (Malphite = 54)
        let ap_tank_draft = DraftState {
            local_role: Some(Role::Mid),
            local_champion_id: None,
            hovered_champion_id: None,
            is_locked: false,
            bans: vec![],
            allies: vec![DraftPick {
                champion_id: 54,
                role: Some(Role::Top),
                is_local: false,
                is_hover: true,
                spell1_id: None,
                spell2_id: None,
                player_name: None,
            }],
            enemies: vec![],
        };
        let ap_tank_needs = comp::needs(&repo, &ap_tank_draft);
        assert!(!ap_tank_needs.needs_ap, "ally hovered AP, so team does not need AP");
        assert!(ap_tank_needs.needs_ad, "ally hovered AP, so team needs AD");
        assert!(!ap_tank_needs.needs_frontline, "ally hovered frontline, so team does not need frontline");

        println!("✓ Test 4 Passed: Team comp balance dynamically responds to ally champion hovers");
    }

    // Test 5: Gameflow lifecycle detection & live match transition parsing
    {
        use rift_companion_lib::lcu::models::{GameflowGameData, GameflowPlayer, GameflowSession};
        use rift_companion_lib::lcu::is_in_match;

        assert!(is_in_match("ChampSelect"));
        assert!(is_in_match("GameStart"));
        assert!(is_in_match("InProgress"));
        assert!(is_in_match("Reconnect"));
        assert!(!is_in_match("None"));
        assert!(!is_in_match("Lobby"));
        assert!(!is_in_match("EndOfGame"));

        let gf_session = GameflowSession {
            phase: "InProgress".to_string(),
            game_data: Some(GameflowGameData {
                game_id: 123456789,
                team_one: vec![
                    GameflowPlayer {
                        cell_id: 0,
                        champion_id: 266, // Aatrox
                        selected_position: "TOP".to_string(),
                        game_name: "LocalSummoner".to_string(),
                        tag_line: "EUW".to_string(),
                        puuid: "puuid-local-123".to_string(),
                        spell1_id: 4,
                        spell2_id: 12,
                        ..Default::default()
                    },
                    GameflowPlayer {
                        cell_id: 1,
                        champion_id: 64, // Lee Sin
                        selected_position: "JUNGLE".to_string(),
                        game_name: "AllyJungler".to_string(),
                        tag_line: "EUW".to_string(),
                        puuid: "puuid-ally-jng".to_string(),
                        spell1_id: 4,
                        spell2_id: 11,
                        ..Default::default()
                    },
                ],
                team_two: vec![
                    GameflowPlayer {
                        cell_id: 5,
                        champion_id: 122, // Darius
                        selected_position: "TOP".to_string(),
                        game_name: "EnemyDarius".to_string(),
                        tag_line: "EUW".to_string(),
                        puuid: "puuid-enemy-top".to_string(),
                        spell1_id: 4,
                        spell2_id: 6,
                        ..Default::default()
                    },
                ],
                player_champion_selections: vec![],
            }),
        };

        let state = rift_companion_lib::draft::from_gameflow(
            &repo,
            &gf_session,
            Some("puuid-local-123"),
            Some("LocalSummoner"),
            None,
        ).expect("gameflow session parses into DraftState");

        assert_eq!(state.local_champion_id, Some(266));
        assert_eq!(state.local_role, Some(Role::Top));
        assert!(state.is_locked);
        assert_eq!(state.allies.len(), 2);
        assert_eq!(state.enemies.len(), 1);
        assert_eq!(state.allies[0].player_name.as_deref(), Some("LocalSummoner#EUW"));
        assert!(state.allies[0].is_local);
        assert_eq!(state.allies[1].player_name.as_deref(), Some("AllyJungler#EUW"));
        assert_eq!(state.enemies[0].player_name.as_deref(), Some("EnemyDarius#EUW"));

        println!("✓ Test 5 Passed: Gameflow lifecycle detection & live match state parsing");
    }

    // Test 6: In-game Live Client Data parsing and player_champion_selections recovery (Issue #10 bugfix)
    {
        use rift_companion_lib::lcu::models::{LiveClientActivePlayer, LiveClientPlayer, LiveClientSpell, LiveClientSpells};
        use rift_companion_lib::lcu::models::{GameflowChampionSelection, GameflowGameData, GameflowPlayer, GameflowSession};

        // 1. Verify from_gameflow recovers missing solo enemy players (Zed 238, Milio 902) from player_champion_selections
        let session_with_selections = GameflowSession {
            phase: "InProgress".to_string(),
            game_data: Some(GameflowGameData {
                game_id: 7986797534,
                team_one: vec![
                    GameflowPlayer {
                        cell_id: 0,
                        champion_id: 161, // Vel'Koz
                        selected_position: "MIDDLE".to_string(),
                        game_name: "LocalVelkoz".to_string(),
                        tag_line: "EUW".to_string(),
                        puuid: "puuid-local".to_string(),
                        spell1_id: 4,
                        spell2_id: 12,
                        ..Default::default()
                    },
                    GameflowPlayer {
                        cell_id: 1,
                        champion_id: 267, // Nami
                        selected_position: "UTILITY".to_string(),
                        game_name: "AllyNami".to_string(),
                        tag_line: "EUW".to_string(),
                        puuid: "puuid-nami".to_string(),
                        spell1_id: 4,
                        spell2_id: 3,
                        ..Default::default()
                    },
                ],
                team_two: vec![
                    GameflowPlayer {
                        cell_id: 5,
                        champion_id: 75, // Nasus
                        selected_position: "TOP".to_string(),
                        game_name: "EnemyNasus".to_string(),
                        tag_line: "EUW".to_string(),
                        puuid: "puuid-nasus".to_string(),
                        spell1_id: 4,
                        spell2_id: 6,
                        ..Default::default()
                    },
                ],
                // Zed (238) and Milio (902) are present in player_champion_selections
                player_champion_selections: vec![
                    GameflowChampionSelection { champion_id: 161, puuid: "puuid-local".to_string(), spell1_id: 4, spell2_id: 12 },
                    GameflowChampionSelection { champion_id: 267, puuid: "puuid-nami".to_string(), spell1_id: 4, spell2_id: 3 },
                    GameflowChampionSelection { champion_id: 75, puuid: "puuid-nasus".to_string(), spell1_id: 4, spell2_id: 6 },
                    GameflowChampionSelection { champion_id: 238, puuid: "puuid-zed".to_string(), spell1_id: 4, spell2_id: 14 },
                    GameflowChampionSelection { champion_id: 902, puuid: "puuid-milio".to_string(), spell1_id: 4, spell2_id: 7 },
                ],
            }),
        };

        let gf_state = rift_companion_lib::draft::from_gameflow(
            &repo,
            &session_with_selections,
            Some("puuid-local"),
            Some("LocalVelkoz"),
            None,
        ).expect("parsed from gameflow");

        assert_eq!(gf_state.enemies.len(), 3, "enemy team filled from player_champion_selections");
        assert!(gf_state.enemies.iter().any(|e| e.champion_id == 238), "Zed must be recovered");
        assert!(gf_state.enemies.iter().any(|e| e.champion_id == 902), "Milio must be recovered");

        // 2. Verify from_live_client accurately maps positions and teams
        let live_players = vec![
            LiveClientPlayer {
                champion_name: "Vel'Koz".to_string(),
                position: "MIDDLE".to_string(),
                team: "ORDER".to_string(),
                summoner_name: "LocalVelkoz#EUW".to_string(),
                riot_id: "LocalVelkoz#EUW".to_string(),
                ..Default::default()
            },
            LiveClientPlayer {
                champion_name: "Nami".to_string(),
                position: "UTILITY".to_string(),
                team: "ORDER".to_string(),
                summoner_name: "AllyNami#EUW".to_string(),
                riot_id: "AllyNami#EUW".to_string(),
                ..Default::default()
            },
            LiveClientPlayer {
                champion_name: "Zed".to_string(),
                position: "MIDDLE".to_string(),
                team: "CHAOS".to_string(),
                summoner_name: "Zed".to_string(),
                riot_id: "#".to_string(),
                summoner_spells: Some(LiveClientSpells {
                    summoner_spell_one: Some(LiveClientSpell { display_name: "Flash".to_string(), ..Default::default() }),
                    summoner_spell_two: Some(LiveClientSpell { display_name: "Ignite".to_string(), ..Default::default() }),
                }),
                ..Default::default()
            },
            LiveClientPlayer {
                champion_name: "Milio".to_string(),
                position: "UTILITY".to_string(),
                team: "CHAOS".to_string(),
                summoner_name: "Milio".to_string(),
                riot_id: "#".to_string(),
                ..Default::default()
            },
        ];

        let active_player = LiveClientActivePlayer {
            summoner_name: "LocalVelkoz#EUW".to_string(),
            riot_id: "LocalVelkoz#EUW".to_string(),
            ..Default::default()
        };

        let live_state = rift_companion_lib::draft::from_live_client(
            &repo,
            &live_players,
            Some(&active_player),
            None,
        ).expect("parsed from live client");

        assert_eq!(live_state.local_champion_id, Some(161));
        assert_eq!(live_state.local_role, Some(Role::Mid));
        assert_eq!(live_state.allies.len(), 2);
        assert_eq!(live_state.enemies.len(), 2);

        let zed_pick = live_state.enemies.iter().find(|e| e.champion_id == 238).expect("Zed in enemies");
        assert_eq!(zed_pick.role, Some(Role::Mid));
        assert_eq!(zed_pick.spell1_id, Some(4));
        assert_eq!(zed_pick.spell2_id, Some(14));

        let milio_pick = live_state.enemies.iter().find(|e| e.champion_id == 902).expect("Milio in enemies");
        assert_eq!(milio_pick.role, Some(Role::Support));

        println!("✓ Test 6 Passed: In-game Live Client Data parsing and player_champion_selections recovery");
    }

    println!("\nALL 6 INTERNAL TESTS PASSED SUCCESSFULLY!");
}
