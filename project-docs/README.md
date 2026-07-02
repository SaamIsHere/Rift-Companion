# Rift Companion Developer Documentation

Welcome to the Rift Companion developer documentation directory. This folder is structured specifically to provide future coding AI assistants and developers with a comprehensive, token-efficient understanding of the codebase structure, states, and algorithms.

## Index of Documentation

To understand or extend the application, refer to the following documents:

1. **[System Architecture](architecture.md)**
   Provides a high-level view of how the Tauri Rust backend, Svelte frontend, and the League Client (LCU) interact. Details state synchronization flow and process boundaries.
2. **[Backend Development (Rust)](backend-rust.md)**
   Explains the crate layout, the OP.GG MCP client, the custom DSL parser, connection state orchestration, and Tauri command bindings.
3. **[Frontend Development (Svelte)](frontend-svelte.md)**
   Details Svelte components, reactivity stores, frameless window control handles, and the Tailwind CSS glassmorphism theme design system.
4. **[Scoring Engine & Algorithm](scoring-engine.md)**
   Explores the mathematics and code behind champion pick scoring: Bayesian smoothing, the role-specific ally/enemy weight matrices, and team-composition balancing.
5. **[Data Management & Ingestion](data-management.md)**
   Explains how Champion datasets are loaded, stored, crawled in the background, ingested through the CLI tool, and mapped to League of Legends Data Dragon resources.
6. **[Project Issues & Feature Backlog](issues-backlog.md)**
   Provides a structured roadmap of open issues and planned features, developer implementation notes, and key clarification questions.

---

## Project Overview

**Rift Companion** is a desktop champion-select advisor for League of Legends. It connects to the local League Client (LCU) via WebSockets, tracks the current draft stage in real-time, processes champion win-rates/synergies on a Rust-based scoring engine, and outputs a top-5 pick recommendation list on a glassmorphic user interface.

### Technology Stack

* **Shell & Core Backend**: [Tauri v2](../src-tauri/Cargo.toml) (Rust)
* **Frontend UI**: [Svelte 5](../package.json) (TypeScript)
* **Style Engine**: [Tailwind CSS v3](../tailwind.config.js) (Glassmorphism layout)
* **API Integration**: LCU WebSocket / HTTPS endpoints + OP.GG MCP API (Server-Sent Events)
* **Database**: Local JSON files (with SQLite planned as the next milestone)
