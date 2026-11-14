// Fraction of ideal panel output kept after wiring, conversion, and thermal losses.
export const SYSTEM_LOSS_FRACTION = 0.75;
// Approximate linear panel aging per Earth year; real degradation depends on orbit and cell technology.
export const PANEL_DEGRADATION_FRACTION_PER_YEAR = 0.025;
// Earth contact scheduling uses minutes; a day has this many seconds for rate conversions.
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_MINUTE = 60;
// Decimal gigabyte throughput conversion from megabits.
export const MBITS_PER_GIGABYTE = 8000;
// Missing antenna margin is represented by a finite sentinel so results remain serializable.
export const NO_LINK_MARGIN_DB = -1000;
// Convert a mission duration in months into years for annual hazard and delta-v calculations.
export const MONTHS_PER_YEAR = 12;
// Standard gravitational acceleration used by the ideal rocket equation, in m/s².
export const STANDARD_GRAVITY_M_PER_S2 = 9.80665;
// Hard/easy CML4 required reserve against each resource requirement.
export const HARD_RESOURCE_MARGIN_FRACTION = 0.35;
export const EASY_RESOURCE_MARGIN_FRACTION = 0.2;
// Link reference anchor calibrated so LGA has ample Earth proximity margin and the deep-space dish is near 3 dB at Mars.
export const BASE_LINK_MARGIN_DB = 74;
export const REFERENCE_ANTENNA_GAIN_DB = 3;
export const REFERENCE_LINK_DISTANCE_KM = 1000;
// Opportunistic contact plans lose capacity to scheduling uncertainty in this simplified model.
export const OPPORTUNISTIC_DOWNLINK_FRACTION = 0.7;
export const SCHEDULED_DOWNLINK_FRACTION = 1;
// A 2x increase in range costs about 6.02 dB under the simplified free-space path-loss model.
export const FREE_SPACE_PATH_LOSS_DB_PER_DISTANCE_DECADE = 20;
// Reliability values are probabilities in [0, 1], expressed as fractions rather than percentages.
export const MINIMUM_PROBABILITY_FRACTION = 0;
export const MAXIMUM_PROBABILITY_FRACTION = 1;
// Radiation doubles the nominal annual hazard at index 0.5 when there is no computer hardening.
export const RADIATION_HAZARD_MULTIPLIER_FACTOR = 2;
// Missing component reliability metadata uses a conservative one-year survival estimate.
export const DEFAULT_COMPONENT_RELIABILITY_PROBABILITY = 0.95;
// Instrument reliability is likewise modeled as one-year survival in the series/parallel calculation.
export const DEFAULT_INSTRUMENT_RELIABILITY_PROBABILITY = 0.97;
// Risk reserve starts at 15%, rises with unreliability, and is capped at 35%.
export const BASE_COST_RESERVE_FRACTION = 0.15;
export const RISK_RESERVE_FRACTION_PER_FAILURE_PROBABILITY = 0.5;
export const MAX_COST_RESERVE_FRACTION = 0.35;
// Duplicated/overlapping science payloads have diminishing marginal return.
export const SCIENCE_REDUNDANCY_WEIGHT_FRACTIONS = [1, 0.7, 0.5] as const;
// Final diminishing-return factor used if the overlap depth exceeds the configured science weights.
export const MINIMUM_SCIENCE_REDUNDANCY_FRACTION = 0.5;
// Unmatched science tags retain a small fraction of instrument value to reward useful secondary science.
export const SCIENCE_TAG_FIT_FLOOR_FRACTION = 0.35;
export const SCIENCE_TAG_FIT_MATCH_SCALE_FRACTION = 0.65;
// A body-incompatible instrument should not normally be selected; this residual only avoids a discontinuous score.
export const INCOMPATIBLE_BODY_FIT_FRACTION = 0.25;
// Score subcomponents use these fixed game-design weights, not mission-dollar utility.
export const SCIENCE_SCORE_WEIGHT_FRACTION = 0.4;
export const EFFICIENCY_SCORE_WEIGHT_FRACTION = 0.2;
export const RESILIENCE_SCORE_WEIGHT_FRACTION = 0.25;
export const COST_SCORE_WEIGHT_FRACTION = 0.15;
// Outcome bonuses are small tie-breakers after measured score components.
export const SUCCESS_OUTCOME_BONUS_POINTS = 5;
export const PARTIAL_OUTCOME_BONUS_POINTS = 2;
// The evaluator flags a projected mission reliability below this teaching threshold as a warning.
export const RELIABILITY_WARNING_THRESHOLD_FRACTION = 0.7;
// The science efficiency score is capped at this game-scale maximum.
export const MAXIMUM_SCORE_POINTS = 100;
// When a zero-data design is evaluated, at least one nominal day is retained for a bound mission.
export const MINIMUM_MISSION_DAYS = 1;
// A battery record without depth-of-discharge metadata uses this conservative usable-energy fraction.
export const DEFAULT_BATTERY_USABLE_ENERGY_FRACTION = 0.8;
// Convert a fraction to percent for learner-facing finding values and scores.
export const PERCENT_UNITS_PER_FRACTION = 100;
// Search fixtures use a full nominal instrument duty cycle so scenario coverage is not hidden by arbitrary scheduling.
export const ENUMERATED_DUTY_CYCLE_PERCENT = 100;
// Search fixtures use at least a one-year planning horizon unless a scenario baseline is longer.
export const ENUMERATED_MINIMUM_DURATION_MONTHS = 12;
// Tag coverage is a set of required labels; a design is limited to this many distinct instruments in the audit search.
export const MAXIMUM_ENUMERATED_INSTRUMENT_COUNT = 3;
// Convert planned months to approximate days for deterministic mission data bookkeeping.
export const DAYS_PER_YEAR = 365.25;
export const DAYS_PER_MONTH = DAYS_PER_YEAR / MONTHS_PER_YEAR;
// Search caps keep design enumeration bounded; repeated panels/batteries and up to three distinct instruments are enough for audit designs.
export const MAXIMUM_PANEL_COUNT_PER_DESIGN = 2;
export const MAXIMUM_BATTERY_COUNT_PER_DESIGN = 2;
// Recorder duplication is capped at two copies in the audit search to bound combinations while testing buffer value.
export const MAXIMUM_DATA_STORAGE_COUNT_PER_DESIGN = 2;
// Two identical propulsion modules are allowed in the audit search to represent a simple redundant or larger-capacity option.
export const MAXIMUM_PROPULSION_COUNT_PER_DESIGN = 2;
