//! Role-proximity matrix for synergy weighting.
//!
//! Synergy between two champions matters more when their roles interact closely
//! on the map. ADC↔Support share a lane (strongest); ADC↔Top rarely interact
//! (weakest). Values are symmetric and live in [0, 1].

use crate::data::models::Role;

pub fn proximity(a: Role, b: Role) -> f64 {
    use Role::*;
    if a == b {
        return 0.0;
    }
    let (x, y) = ordered(a, b);
    match (x, y) {
        (Adc, Support) => 1.00,
        (Jungle, Mid) => 0.70,
        (Jungle, Support) => 0.60,
        (Jungle, Adc) => 0.55,
        (Mid, Support) => 0.50,
        (Top, Jungle) => 0.45,
        (Mid, Adc) => 0.40,
        (Top, Mid) => 0.30,
        (Top, Support) => 0.30,
        (Top, Adc) => 0.20,
        _ => 0.25,
    }
}

/// Canonical ordering so the match arms above only need one direction.
fn ordered(a: Role, b: Role) -> (Role, Role) {
    if rank(a) <= rank(b) {
        (a, b)
    } else {
        (b, a)
    }
}

fn rank(r: Role) -> u8 {
    use Role::*;
    match r {
        Top => 0,
        Jungle => 1,
        Mid => 2,
        Adc => 3,
        Support => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::proximity;
    use crate::data::models::Role::*;

    #[test]
    fn botlane_is_strongest_and_symmetric() {
        assert_eq!(proximity(Adc, Support), 1.0);
        assert_eq!(proximity(Support, Adc), 1.0);
        assert!(proximity(Adc, Top) < proximity(Mid, Jungle));
    }
}
