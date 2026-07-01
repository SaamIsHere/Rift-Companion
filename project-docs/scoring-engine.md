# Scoring Engine & Algorithm

The Rift Companion scoring engine evaluates eligible champions to recommend the top 5 picks for the local player's role. It ranks picks using a weighted sum of lane matchups, team synergy, enemy counters, and composition balance.

The core scoring implementation resides in [src-tauri/src/engine/scoring.rs](../src-tauri/src/engine/scoring.rs).

---

## The Scoring Formula

For each candidate champion $c$ eligible for the local player's role:

$$\text{Net} = w_{\text{matchup}} \cdot A_{\text{matchup}}(c) + w_{\text{synergy}} \cdot A_{\text{synergy}}(c) + w_{\text{counter}} \cdot A_{\text{counter}}(c) + w_{\text{comp}} \cdot B_{\text{comp}}(c) + w_{\text{baseline}} \cdot A_{\text{global}}(c)$$

$$\text{Score} = \text{clamp}(50.0 + \text{Net} \cdot \text{DISPLAY\_SCALE}, 0.0, 100.0)$$

### Weight Coefficients
Defined in [src-tauri/src/engine/weights.rs](../src-tauri/src/engine/weights.rs):
* $w_{\text{matchup}} = 0.40$ (Laning phase matchup vs. the direct opponent)
* $w_{\text{synergy}} = 0.25$ (Ally synergy, weighted by role proximity)
* $w_{\text{counter}} = 0.20$ (General advantage vs. the rest of the enemy team)
* $w_{\text{comp}} = 0.15$ (Team balance bonus filling composition gaps)
* $w_{\text{baseline}} = 0.15$ (Overall champion strength in the role as a tie-breaker)
* $\text{DISPLAY\_SCALE} = 300.0$ (Converts advantage deviations of ~$\pm 0.10$ to a $0\text{--}100$ scale)

---

## 1. Bayesian Smoothing

To prevent small sample sizes (e.g. a niche champion winning $2/2$ matches) from skewing the results, win rates are smoothed toward a global prior using additive Bayesian smoothing:

$$WR_{\text{smoothed}} = \frac{WR_{\text{observed}} \cdot N_{\text{games}} + prior \cdot C}{N_{\text{games}} + C}$$

* **Prior baseline ($prior$)**: $0.50$ (calculated by construction of overall win-rate datasets).
* **Smoothing strength ($C$)**: $100.0$ pseudo-games (defined as `SMOOTH_C` in [weights.rs](../src-tauri/src/engine/weights.rs#L31)).
* **Behavior**: As $N_{\text{games}} \to 0$, $WR_{\text{smoothed}} \to prior$ ($0.50$). As $N_{\text{games}} \to \infty$, $WR_{\text{smoothed}} \to WR_{\text{observed}}$.

---

## 2. Lane Matchup Advantage ($A_{\text{matchup}}$)

Evaluates the champion vs. the direct laner in the same role (e.g. Mid vs. Mid).

1. **Direct Opponent Inference**: Since solo/duo draft info hides enemy position tags, the engine infers roles based on each champion's most-played position: `Repository::primary_role()`.
2. **Threshold Gate**: If a matchup cell has $N_{\text{games}} < 100$ (defined as `MIN_MATCHES`), the matchup cell is treated as *invalid* to block unreliable outliers. The matchup score then falls back to overall role strength $A_{\text{global}}$.
3. **Calculation**: If $N_{\text{games}} \geq 100$, $A_{\text{matchup}} = WR_{\text{smoothed}} - 0.50$.
4. **badge triggers**: If $WR_{\text{smoothed}} > 0.52$, a "Strong lane counter to [Champion Name]" badge is added.

---

## 3. Ally Synergy Advantage ($A_{\text{synergy}}$)

Computes the synergy score using a weighted average of win rates with locked allies, adjusted by their proximity on the map.

$$A_{\text{synergy}} = \frac{\sum_{a} P(\text{role}, \text{role}_a) \cdot (WR_{\text{smoothed}}(c, a) - 0.50)}{\sum_{a} P(\text{role}, \text{role}_a)}$$

### Role Proximity Weight Matrix ($P$)
Defined in [src-tauri/src/engine/synergy.rs](../src-tauri/src/engine/synergy.rs#L9-L28):
* ADC $\leftrightarrow$ Support: $1.00$
* Jungle $\leftrightarrow$ Mid: $0.70$
* Jungle $\leftrightarrow$ Support: $0.60$
* Jungle $\leftrightarrow$ ADC: $0.55$
* Mid $\leftrightarrow$ Support: $0.50$
* Top $\leftrightarrow$ Jungle: $0.45$
* Mid $\leftrightarrow$ ADC: $0.40$
* Top $\leftrightarrow$ Mid: $0.30$
* Top $\leftrightarrow$ Support: $0.30$
* Top $\leftrightarrow$ ADC: $0.20$
* Unmapped relationships: $0.25$

Synergies with $N_{\text{games}} < 100$ are skipped. If a high synergy ally is found ($WR_{\text{smoothed}} > 0.52$), a "High synergy with [Ally Name]" badge is generated.

---

## 4. General Enemy Counter Advantage ($A_{\text{counter}}$)

Measures the champion's advantage vs. the rest of the revealed enemy team (excluding the direct lane opponent).

$$A_{\text{counter}} = \frac{1}{N_{\text{enemies}}} \sum_{e \neq \text{opp}} (WR_{\text{smoothed}}(c, e) - 0.50)$$

Cells with $N_{\text{games}} < 100$ are skipped.

---

## 5. Team Composition Balance ($B_{\text{comp}}$)

Rewards champion picks that fill structural gaps in the ally team composition. Calculated in [src-tauri/src/engine/comp.rs](../src-tauri/src/engine/comp.rs).

1. **Composition Needs Detection**: Scans locked allies (excluding the local player) to check for:
   * **Magic Damage (AP)**: Count of allies with magic or mixed damage. If $0$, `needs_ap = true`.
   * **Physical Damage (AD)**: Count of allies with physical or mixed damage. If $0$, `needs_ad = true`.
   * **Frontline/Tank**: Count of allies tagged as `Tank` in Data Dragon. If $0$, `needs_frontline = true`.
2. **Score Calculation**:
   * If `needs_ap` and candidate is AP $\to$ $+0.06$ score bonus ("Adds missing magic damage").
   * If `needs_ad` and candidate is AD $\to$ $+0.06$ score bonus ("Adds missing physical damage").
   * If candidate is Mixed damage $\to$ $+0.03$ bonus per filled damage gap.
   * If `needs_frontline` and candidate is frontline $\to$ $+0.06$ score bonus ("Provides a frontline/tank").
3. Max possible composition bonus is $+0.12$ ($B_{\text{comp}} \in [0.0, 0.12]$).
