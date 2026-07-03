# Scoring Engine & Algorithm

The Rift Companion scoring engine evaluates every eligible champion for the local player's role and returns the full pool ranked by score (no top-N cutoff — see [Issue 14](issues-backlog.md#issue-14-expand-playable-champions-pool-per-role-split-from-issue-5)). It ranks picks by refining the champion's base role win rate with role-specific ally/enemy weight matrices, plus a small composition-balance bonus.

The core scoring implementation resides in [src-tauri/src/engine/scoring.rs](../src-tauri/src/engine/scoring.rs).

---

## The Scoring Formula

For each candidate champion $c$ eligible for the local player's role:

$$\text{WR}_{\text{refined}}(c) = \text{clamp}\Big(\text{WR}_{\text{base}}(c) + \frac{\sum_{\text{Allies}} w_{\text{ally}} \cdot \Delta\text{WR}_{\text{with\_ally}} + \sum_{\text{Enemies}} w_{\text{enemy}} \cdot \Delta\text{WR}_{\text{vs\_enemy}}}{\text{RowTotal}(\text{role})}, \; 0.02, \; 0.98\Big)$$

$$\text{Refinement} = \big(\text{WR}_{\text{refined}}(c) - \text{WR}_{\text{base}}(c)\big) + w_{\text{comp}} \cdot B_{\text{comp}}(c)$$

$$\text{Score} = \text{clamp}\big(\text{WR}_{\text{base}}(c) \cdot 100.0 + \text{Refinement} \cdot \text{DISPLAY\_SCALE}, \; 0.0, \; 100.0\big)$$

The key design choice is that ally/enemy deltas are combined into a **weighted average**, not a weighted sum. Critically, the denominator, $\text{RowTotal}(\text{role})$, is the **fixed sum of the entire matrix row** for that role (all 4 ally weights + all 4 enemy weights) — not just the weight of picks revealed so far.

This distinction matters more than it looks. An earlier version divided by only the *present* weight, which meant a single revealed relationship passed through at close to its full raw magnitude — the weight cancels out of the division when it's the only term present (`weight · delta / weight = delta`), regardless of how large or small that weight was. That let one strong early-draft matchup swing the score as hard as a full 8-relationship read would. Dividing by the fixed row total instead means an unrevealed pick still occupies its slice of the denominator (contributing weight but a delta of `0.0`), so confidence — and score movement — grows as the draft actually fills in, the same way the old fixed coefficients (`w_matchup = 0.40`, etc.) used to cap how far any single relationship could pull the score.

**`WR_base` maps to the score 1:1; `DISPLAY_SCALE` only amplifies the refinement on top of it.** An earlier version applied `50 + (WR_refined - 0.50) × 300` to the *whole* refined win rate, base included — so a champion with an ordinary 53% win rate and zero other information read as a 59+ score, because the base win rate's small offset from 50% got the same 300x amplification meant for small matchup/synergy deltas. With nothing else revealed (a true first pick), the score should read as exactly the champion's real win rate. Splitting the formula so `WR_base` passes straight through as a percentage, and only the ally/enemy/comp refinement gets amplified, fixes that — a first-pick Nasus in Jungle (53% base win rate, no data revealed) now scores `53.0`, not 64.

### Coefficients
Defined in [src-tauri/src/engine/weights.rs](../src-tauri/src/engine/weights.rs):
* $w_{\text{comp}} = 0.15$ (Team balance bonus filling composition gaps — the only remaining scalar weight; matchup/synergy/counter are now driven entirely by the matrices below)
* $\text{DISPLAY\_SCALE} = 300.0$ (Converts advantage deviations of ~$\pm 0.10$ to a $0\text{--}100$ scale)

---

## 1. Bayesian Smoothing

To prevent small sample sizes (e.g. a niche champion winning $2/2$ matches) from skewing the results, win rates are smoothed toward a global prior using additive Bayesian smoothing:

$$WR_{\text{smoothed}} = \frac{WR_{\text{observed}} \cdot N_{\text{games}} + prior \cdot C}{N_{\text{games}} + C}$$

* **Prior baseline ($prior$)**: $0.50$ (calculated by construction of overall win-rate datasets).
* **Smoothing strength ($C$)**: $100.0$ pseudo-games (defined as `SMOOTH_C` in [weights.rs](../src-tauri/src/engine/weights.rs#L27)).
* **Behavior**: As $N_{\text{games}} \to 0$, $WR_{\text{smoothed}} \to prior$ ($0.50$). As $N_{\text{games}} \to \infty$, $WR_{\text{smoothed}} \to WR_{\text{observed}}$.

This applies to every win-rate input: the champion's base role win rate, every ally synergy cell, and every enemy matchup cell.

---

## 2. Base Win Rate ($WR_{\text{base}}$)

The champion's overall (Bayesian-smoothed) win rate for the target role — aggregated across *every* game it has been played there, not just its single best matchup. This anchors the score before any ally/enemy refinement is applied, so a champion with a strong overall role win rate still ranks well even against an unrevealed or sparse draft.

---

## 3. Ally/Enemy Weight Matrices

Every locked ally and revealed enemy contributes one term to the combined weighted average above. The weight for each relationship comes from a 5x5 matrix indexed by **(local player's role, other pick's role)** — so an ADC leans heavily on its Support's synergy, while a Top laner leans heavily on the enemy Top's matchup. If a pick's role is unknown (empty slot, or an unrevealed enemy), its delta is `0.0` (it's excluded from both the numerator and denominator).

### Threshold Gate + Bayesian Smoothing (two-layer protection)
Sample-size safety uses two layers, matching the philosophy of §1:
1. **Hard gate**: If a matchup/synergy cell has $N_{\text{games}} < 100$ (`MIN_MATCHES`), the cell is **excluded entirely** from the weighted average — not down-weighted, not smoothed, just dropped. A 2-game 100%/0% record contributes nothing.
2. **Soft smoothing**: Cells that clear the threshold still get Bayesian-smoothed (§1), so a 110-game cell sitting right above the gate doesn't swing the score as hard as a 5,000-game cell would.

### Ally Weight Matrix ($w_{\text{ally}}$)
Defined as `ALLY_WEIGHTS` in [weights.rs](../src-tauri/src/engine/weights.rs). Row = local player's role, column = ally's role:

| If Player is... | Ally Top | Ally Jg | Ally Mid | Ally ADC | Ally Sup |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Top** | — | 0.4 | 0.3 | 0.1 | 0.1 |
| **Jungle** | 0.5 | — | 0.5 | 0.3 | 0.3 |
| **Mid** | 0.2 | 0.5 | — | 0.1 | 0.2 |
| **ADC** | 0.1 | 0.2 | 0.1 | — | **1.8** |
| **Support** | 0.2 | 0.3 | 0.2 | **1.3** | — |

### Enemy Weight Matrix ($w_{\text{enemy}}$)
Defined as `ENEMY_WEIGHTS` in [weights.rs](../src-tauri/src/engine/weights.rs). Row = local player's role, column = enemy's (inferred) role. The diagonal is the direct lane opponent:

| If Player is... | Enemy Top | Enemy Jg | Enemy Mid | Enemy ADC | Enemy Sup |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Top** | **1.5** | 0.3 | 0.2 | 0.1 | 0.1 |
| **Jungle** | 0.4 | **1.0** | 0.4 | 0.2 | 0.2 |
| **Mid** | 0.2 | 0.4 | **1.4** | 0.1 | 0.1 |
| **ADC** | 0.1 | 0.3 | 0.1 | **1.0** | **1.0** |
| **Support** | 0.1 | 0.3 | 0.1 | **0.9** | **0.9** |

### Design Rationale
* **Top/Mid**: their ally-row weight total (0.9 / 1.0) is much smaller than their enemy-row total (2.2 / 2.2), so the direct lane matchup dominates the average — a solo laner lives and dies by its matchup.
* **Jungle**: ally/enemy totals (1.6 / 2.2) are closer, reflecting that matchups matter a bit more than synergy, but not as lopsidedly as Top/Mid.
* **ADC/Support**: ally/enemy totals (2.2 / 2.5 and 2.0 / 2.3) are close to balanced — bot lane's own synergy is nearly as decisive as the 2v2 lane matchup itself.
* **ADC → Support (1.8) vs. Support → ADC (1.3)**: intentionally asymmetric. An ADC is more dependent on its Support than vice versa, since a Support can still contribute heavily by roaming if bot-lane synergy is bad, giving it more independence from its ADC partner than the reverse.
* Because the ally and enemy sums are normalized together into one weighted average (not summed as raw scalars), each role's row totals only need to be *internally* consistent with that role's own matchup-vs-synergy philosophy — they don't need to match in absolute magnitude across roles.

### Badge triggers (Issue 7 — colored, balanced badges)
Every badge carries a `BadgeKind` (`Positive` green / `Negative` red / `Comp` blue / `Neutral` grey) so the UI can show a balanced picture instead of only the flattering half of a pick's story:
* **Matchup badge** (direct lane opponent only): $WR_{\text{smoothed}} > 0.52$ → "Strong lane counter to [Champion]" (green); $WR_{\text{smoothed}} < 0.48$ → "Rough matchup vs [Champion]" (red). Between those thresholds, no matchup badge is shown.
* **Synergy badge** (allies): the strongest ally relationship in *either* direction — by $|w_{\text{ally}} \cdot \Delta|$, not just the first one found — produces "High synergy with [Ally]" (green, $WR_{\text{smoothed}} > 0.52$) or "Weak synergy with [Ally]" (red, $WR_{\text{smoothed}} < 0.48$).
* **Comp badges**: unchanged from §4 below, always `Comp` (blue) since there's no "made the gap worse" case.
* Final badge list order is `[matchup, synergy, ...comp]`, truncated to 3; falls back to a single `Neutral` "Solid blind pick for your role" badge if nothing cleared any threshold.
* A `get_pairwise_stat` Tauri command exposes the same smoothed-and-gated lookup for a single ally/enemy cell on demand, powering a draft-board hover preview independent of whichever role is currently being scored (see [Issue 7 in the backlog](issues-backlog.md#issue-7-refined-champion-badges-counter-and-synergy-highlights)).

---

## 4. Team Composition Balance ($B_{\text{comp}}$)

Rewards champion picks that fill structural gaps in the ally team composition. Calculated in [src-tauri/src/engine/comp.rs](../src-tauri/src/engine/comp.rs).

1. **Composition Needs Detection**: Scans locked allies (excluding the local player) to check for:
   * **Zero allies locked**: if no ally has been picked yet (e.g. a true first pick), *no* gap is flagged at all — with no team data, "every category is missing" is trivially true and would otherwise hand every candidate a free bonus for no real reason.
   * **Magic Damage (AP)**: Count of allies with magic or mixed damage. If $0$ (and at least one ally is locked), `needs_ap = true`.
   * **Physical Damage (AD)**: Count of allies with physical or mixed damage. If $0$ (and at least one ally is locked), `needs_ad = true`.
   * **Frontline/Tank**: Count of allies tagged as `Tank` in Data Dragon. If $0$ (and at least one ally is locked), `needs_frontline = true`.
2. **Score Calculation**:
   * If `needs_ap` and candidate is AP $\to$ $+0.06$ score bonus ("Adds missing magic damage").
   * If `needs_ad` and candidate is AD $\to$ $+0.06$ score bonus ("Adds missing physical damage").
   * If candidate is Mixed damage $\to$ $+0.03$ bonus per filled damage gap.
   * If `needs_frontline` and candidate is frontline $\to$ $+0.06$ score bonus ("Provides a frontline/tank").
3. Max possible composition bonus is $+0.12$ ($B_{\text{comp}} \in [0.0, 0.12]$).
