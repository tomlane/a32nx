use enum_map::{Enum, EnumMap};
use lazy_static::lazy_static;

use std::time::Duration;

use systems::{
    boarding::{BoardingRate, CargoSync, PaxSync},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

#[derive(Debug, Clone, Copy, Enum)]
pub enum A320Pax {
    A,
    B,
    C,
    D,
}
impl A320Pax {
    pub fn iterator() -> impl Iterator<Item = A320Pax> {
        [A320Pax::A, A320Pax::B, A320Pax::C, A320Pax::D]
            .iter()
            .copied()
    }
}

#[derive(Debug, Clone, Copy, Enum)]
pub enum A320Cargo {
    FwdBaggage,
    AftContainer,
    AftBaggage,
    AftBulkLoose,
}
impl A320Cargo {
    pub fn iterator() -> impl Iterator<Item = A320Cargo> {
        [
            A320Cargo::FwdBaggage,
            A320Cargo::AftContainer,
            A320Cargo::AftBaggage,
            A320Cargo::AftBulkLoose,
        ]
        .iter()
        .copied()
    }
}

// TODO: Move into systems crate
pub struct PaxInfo {
    max_pax: i8,
    name: String,
    pax_id: String,
    pax_target_id: String,
    payload_id: String,
}
impl PaxInfo {
    pub fn new(
        max_pax: i8,
        name: &str,
        pax_id: &str,
        pax_target_id: &str,
        payload_id: &str,
    ) -> Self {
        PaxInfo {
            max_pax,
            name: name.to_string(),
            pax_id: pax_id.to_string(),
            pax_target_id: pax_target_id.to_string(),
            payload_id: payload_id.to_string(),
        }
    }
}

pub struct CargoInfo {
    max_cargo_kg: f64,
    name: String,
    cargo_id: String,
    cargo_target_id: String,
    payload_id: String,
}
impl CargoInfo {
    pub fn new(
        max_cargo_kg: f64,
        name: &str,
        cargo_id: &str,
        cargo_target_id: &str,
        payload_id: &str,
    ) -> Self {
        CargoInfo {
            max_cargo_kg,
            name: name.to_string(),
            cargo_id: cargo_id.to_string(),
            cargo_target_id: cargo_target_id.to_string(),
            payload_id: payload_id.to_string(),
        }
    }
}

lazy_static! {
    static ref A320_PAX_INFO: EnumMap<A320Pax, PaxInfo> = EnumMap::from_array([
        PaxInfo::new(
            36,
            "A",
            "PAX_FLAGS_A",
            "PAX_FLAGS_A_DESIRED",
            "PAYLOAD STATION WEIGHT:1",
        ),
        PaxInfo::new(
            42,
            "B",
            "PAX_FLAGS_B",
            "PAX_FLAGS_B_DESIRED",
            "PAYLOAD STATION WEIGHT:2",
        ),
        PaxInfo::new(
            48,
            "C",
            "PAX_FLAGS_C",
            "PAX_FLAGS_C_DESIRED",
            "PAYLOAD STATION WEIGHT:3",
        ),
        PaxInfo::new(
            48,
            "D",
            "PAX_FLAGS_D",
            "PAX_FLAGS_D_DESIRED",
            "PAYLOAD STATION WEIGHT:4",
        )
    ]);
    static ref A320_CARGO_INFO: EnumMap<A320Cargo, CargoInfo> = EnumMap::from_array([
        CargoInfo::new(
            3402.0,
            "FWD_BAGGAGE",
            "CARGO_FWD_BAGGAGE_CONTAINER",
            "CARGO_FWD_BAGGAGE_CONTAINER_DESIRED",
            "PAYLOAD STATION WEIGHT:5",
        ),
        CargoInfo::new(
            2426.0,
            "AFT_CONTAINER",
            "CARGO_AFT_CONTAINER",
            "CARGO_AFT_CONTAINER_DESIRED",
            "PAYLOAD STATION WEIGHT:6",
        ),
        CargoInfo::new(
            2110.0,
            "AFT_BAGGAGE",
            "CARGO_AFT_BAGGAGE",
            "CARGO_AFT_BAGGAGE_DESIRED",
            "PAYLOAD STATION WEIGHT:7",
        ),
        CargoInfo::new(
            1497.0,
            "AFT_BULK_LOOSE",
            "CARGO_AFT_BULK_LOOSE",
            "CARGO_AFT_BULK_LOOSE_DESIRED",
            "PAYLOAD STATION WEIGHT:8",
        )
    ]);
}

pub struct A320BoardingSounds {
    pax_board_id: VariableIdentifier,
    pax_deboard_id: VariableIdentifier,
    pax_complete_id: VariableIdentifier,
    pax_ambience_id: VariableIdentifier,
    pax_board: bool,
    pax_deboard: bool,
    pax_complete: bool,
    pax_ambience: bool,
}
impl A320BoardingSounds {
    pub fn new(
        pax_board_id: VariableIdentifier,
        pax_deboard_id: VariableIdentifier,
        pax_complete_id: VariableIdentifier,
        pax_ambience_id: VariableIdentifier,
    ) -> Self {
        A320BoardingSounds {
            pax_board_id,
            pax_deboard_id,
            pax_complete_id,
            pax_ambience_id,
            pax_board: false,
            pax_deboard: false,
            pax_complete: false,
            pax_ambience: false,
        }
    }
    pub fn start_pax_boarding(&mut self) {
        self.pax_board = true;
    }
    pub fn stop_pax_boarding(&mut self) {
        self.pax_board = false;
    }
    pub fn start_pax_deboarding(&mut self) {
        self.pax_deboard = true;
    }
    pub fn stop_pax_deboarding(&mut self) {
        self.pax_deboard = false;
    }
    pub fn start_pax_boarding_complete(&mut self) {
        self.pax_complete = true;
    }
    pub fn stop_pax_boarding_complete(&mut self) {
        self.pax_complete = false;
    }
    pub fn start_pax_ambience(&mut self) {
        self.pax_ambience = true;
    }
    pub fn stop_pax_ambience(&mut self) {
        self.pax_ambience = false;
    }
}
impl SimulationElement for A320BoardingSounds {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.pax_board_id, self.pax_board);
        writer.write(&self.pax_deboard_id, self.pax_deboard);
        writer.write(&self.pax_complete_id, self.pax_complete);
        writer.write(&self.pax_ambience_id, self.pax_ambience);
    }
}
pub struct A320Boarding {
    is_boarding_id: VariableIdentifier,
    board_rate_id: VariableIdentifier,
    is_boarding: bool,
    board_rate: BoardingRate,
    pax: Vec<PaxSync>,
    cargo: Vec<CargoSync>,
    boarding_sounds: A320BoardingSounds,
    time: Duration,
}
impl A320Boarding {
    pub fn new(context: &mut InitContext) -> Self {
        let per_pax_weight_id = context.get_identifier("WB_PER_PAX_WEIGHT".to_owned());
        let unit_convert_id = context.get_identifier("EFB_UNIT_CONVERSION_FACTOR".to_owned());

        let mut pax = Vec::new();
        for ps in A320Pax::iterator() {
            pax.push(PaxSync::new(
                context.get_identifier(A320_PAX_INFO[ps].pax_id.to_owned()),
                context.get_identifier(A320_PAX_INFO[ps].pax_target_id.to_owned()),
                per_pax_weight_id,
                unit_convert_id,
                context.get_identifier(A320_PAX_INFO[ps].payload_id.to_owned()),
            ));
        }

        let mut cargo = Vec::new();
        for cs in A320Cargo::iterator() {
            cargo.push(CargoSync::new(
                context.get_identifier(A320_CARGO_INFO[cs].cargo_id.to_owned()),
                context.get_identifier(A320_CARGO_INFO[cs].cargo_target_id.to_owned()),
                unit_convert_id,
                context.get_identifier(A320_CARGO_INFO[cs].payload_id.to_owned()),
            ));
        }
        A320Boarding {
            is_boarding_id: context.get_identifier("BOARDING_STARTED_BY_USR".to_owned()),
            is_boarding: false,
            board_rate_id: context.get_identifier("BOARDING_RATE".to_owned()),
            board_rate: BoardingRate::Instant,
            boarding_sounds: A320BoardingSounds::new(
                context.get_identifier("SOUND_PAX_BOARDING".to_owned()),
                context.get_identifier("SOUND_PAX_DEBOARDING".to_owned()),
                context.get_identifier("SOUND_BOARDING_COMPLETE".to_owned()),
                context.get_identifier("SOUND_AMBIENCE".to_owned()),
            ),
            pax,
            cargo,
            time: Duration::from_nanos(0),
        }
    }

    // TODO: Split into functions
    // TODO: Sounds
    pub(crate) fn update(&mut self, context: &UpdateContext) {
        for ps in 0..self.pax.len() {
            if self.pax_payload_is_sync(ps) {
                continue;
            } else {
                // TODO FIXME: Remove debug
                println!("Pax payload was not in sync for {}", ps);
                self.load_pax_payload(ps);
            }
        }
        for cs in 0..self.cargo.len() {
            if self.cargo_payload_is_sync(cs) {
                continue;
            } else {
                // TODO FIXME: Remove debug
                println!("Cargo payload was not in sync for {}", cs);
                self.load_cargo_payload(cs);
            }
        }
        if !self.is_boarding {
            self.time = Duration::from_nanos(0);
            return;
        }
        let delta_time = context.delta();

        let ms_delay = if self.board_rate == BoardingRate::Instant {
            0
        } else if self.board_rate == BoardingRate::Fast {
            1000
        } else {
            5000
        };
        self.time += delta_time;
        if self.time.as_millis() > ms_delay {
            self.time = Duration::from_nanos(0);
            for ps in 0..self.pax.len() {
                if self.pax_is_target(ps) {
                    continue;
                }
                if self.board_rate == BoardingRate::Instant {
                    self.move_all_pax(ps);
                } else {
                    self.move_one_pax(ps);
                    break;
                }
            }
            for cs in 0..self.cargo.len() {
                if self.cargo_is_target(cs) {
                    continue;
                }
                if self.board_rate == BoardingRate::Instant {
                    self.move_all_cargo(cs);
                } else {
                    self.move_one_cargo(cs);
                    break;
                }
            }
        }
    }

    fn board_rate(&self) -> BoardingRate {
        self.board_rate
    }

    fn pax(&self, ps: usize) -> u64 {
        self.pax[ps].pax()
    }

    fn pax_num(&self, ps: usize) -> i8 {
        self.pax[ps].pax_num() as i8
    }

    fn pax_payload(&self, ps: usize) -> f64 {
        self.pax[ps].payload()
    }

    fn pax_is_target(&mut self, ps: usize) -> bool {
        self.pax[ps].pax_is_target()
    }

    fn pax_payload_is_sync(&mut self, ps: usize) -> bool {
        self.pax[ps].payload_is_sync()
    }

    fn move_all_pax(&mut self, ps: usize) {
        self.pax[ps].move_all_pax();
    }

    fn move_one_pax(&mut self, ps: usize) {
        self.pax[ps].move_one_pax();
    }

    fn load_pax_payload(&mut self, ps: usize) {
        self.pax[ps].load_payload();
    }

    fn cargo(&self, cs: usize) -> f64 {
        self.cargo[cs].cargo()
    }

    fn cargo_payload(&self, cs: usize) -> f64 {
        self.cargo[cs].payload()
    }

    fn cargo_is_target(&mut self, cs: usize) -> bool {
        self.cargo[cs].cargo_is_target()
    }

    fn cargo_payload_is_sync(&mut self, cs: usize) -> bool {
        self.cargo[cs].payload_is_sync()
    }

    fn move_all_cargo(&mut self, cs: usize) {
        self.cargo[cs].move_all_cargo();
    }

    fn move_one_cargo(&mut self, cs: usize) {
        self.cargo[cs].move_one_cargo();
    }

    fn load_cargo_payload(&mut self, cs: usize) {
        self.cargo[cs].load_payload();
    }

    fn is_boarding(&self) -> bool {
        self.is_boarding
    }
}
impl SimulationElement for A320Boarding {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        // TODO: Disable if performance is bad
        // if self.is_boarding {
        for ps in 0..self.pax.len() {
            self.pax[ps].accept(visitor);
        }
        for cs in 0..self.cargo.len() {
            self.cargo[cs].accept(visitor);
        }
        self.boarding_sounds.accept(visitor);
        // }

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.is_boarding = reader.read(&self.is_boarding_id);
        self.board_rate = reader.read(&self.board_rate_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.is_boarding_id, self.is_boarding);
    }
}

#[cfg(test)]
mod boarding_test {

    const LBS_TO_KG: f64 = 0.4535934;
    const HOURS_TO_MINUTES: u64 = 60;
    const MINUTES_TO_SECONDS: u64 = 60;
    const DEFAULT_PER_PAX_WEIGHT_KG: f64 = 84.0;

    use approx::relative_eq;
    use rand::seq::IteratorRandom;
    use rand::SeedableRng;
    use systems::electrical::Electricity;

    use super::*;
    use crate::boarding::A320Boarding;
    use crate::systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft, SimulationElement, SimulationElementVisitor,
    };

    struct BoardingTestAircraft {
        boarding: A320Boarding,
    }

    impl BoardingTestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                boarding: A320Boarding::new(context),
            }
        }
    }
    impl Aircraft for BoardingTestAircraft {
        fn update_before_power_distribution(
            &mut self,
            context: &UpdateContext,
            _electricity: &mut Electricity,
        ) {
            self.boarding.update(context);
        }
    }
    impl SimulationElement for BoardingTestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.boarding.accept(visitor);

            visitor.visit(self);
        }
    }

    struct BoardingTestBed {
        test_bed: SimulationTestBed<BoardingTestAircraft>,
    }
    impl BoardingTestBed {
        fn new() -> Self {
            let test_bed = BoardingTestBed {
                test_bed: SimulationTestBed::new(BoardingTestAircraft::new),
            };

            test_bed
        }

        fn and_run(mut self) -> Self {
            self.run();

            self
        }

        fn and_stabilize(mut self) -> Self {
            self.test_bed.run_multiple_frames(Duration::from_secs(300));

            self
        }

        fn init_vars_kg(mut self) -> Self {
            // KG
            self.write_by_name("BOARDING_RATE", BoardingRate::Instant);
            self.write_by_name("EFB_UNIT_CONVERSION_FACTOR", LBS_TO_KG);
            self.write_by_name("WB_PER_PAX_WEIGHT", DEFAULT_PER_PAX_WEIGHT_KG);

            self
        }

        fn init_vars_lbs(mut self) -> Self {
            // KG
            self.write_by_name("BOARDING_RATE", BoardingRate::Instant);
            self.write_by_name("EFB_UNIT_CONVERSION_FACTOR", 1);
            self.write_by_name("WB_PER_PAX_WEIGHT", DEFAULT_PER_PAX_WEIGHT_KG / LBS_TO_KG);

            self
        }

        fn instant_board_rate(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Instant);

            self
        }

        fn fast_board_rate(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Fast);

            self
        }

        fn real_board_rate(mut self) -> Self {
            self.write_by_name("BOARDING_RATE", BoardingRate::Real);

            self
        }

        fn load_pax(&mut self, ps: A320Pax, pax_qty: i8) {
            assert!(pax_qty <= A320_PAX_INFO[ps].max_pax);

            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");
            let per_pax_weight: f64 = self.read_by_name("WB_PER_PAX_WEIGHT");

            let seed = 380320;
            let mut rng = rand_pcg::Pcg32::seed_from_u64(seed);

            let binding: Vec<i8> = (0..A320_PAX_INFO[ps].max_pax).collect();
            let choices = binding
                .iter()
                .choose_multiple(&mut rng, pax_qty.try_into().unwrap());

            let mut pax_flag: u64 = 0;
            for c in choices {
                pax_flag ^= 1 << c;
            }

            let payload = pax_qty as f64 * per_pax_weight / unit_convert;

            self.write_by_name(&A320_PAX_INFO[ps].pax_id, pax_flag);
            self.write_by_name(&A320_PAX_INFO[ps].payload_id, payload);
        }

        fn with_pax(mut self, ps: A320Pax, pax_qty: i8) -> Self {
            self.load_pax(ps, pax_qty);
            self
        }

        fn target_pax(&mut self, ps: A320Pax, pax_qty: i8) {
            assert!(pax_qty <= A320_PAX_INFO[ps].max_pax);

            let seed = 747777;
            let mut rng = rand_pcg::Pcg32::seed_from_u64(seed);

            let binding: Vec<i8> = (0..A320_PAX_INFO[ps].max_pax).collect();
            let choices = binding
                .iter()
                .choose_multiple(&mut rng, pax_qty.try_into().unwrap());

            let mut pax_flag: u64 = 0;
            for c in choices {
                pax_flag ^= 1 << c;
            }

            self.write_by_name(&A320_PAX_INFO[ps].pax_target_id, pax_flag);
        }

        fn with_pax_target(mut self, ps: A320Pax, pax_qty: i8) -> Self {
            self.target_pax(ps, pax_qty);
            self
        }

        fn load_cargo(&mut self, cs: A320Cargo, cargo_qty: f64) {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            assert!(cargo_qty <= A320_CARGO_INFO[cs].max_cargo_kg * unit_convert / LBS_TO_KG);

            let payload = cargo_qty / unit_convert;

            self.write_by_name(&A320_CARGO_INFO[cs].cargo_id, cargo_qty);
            self.write_by_name(&A320_CARGO_INFO[cs].payload_id, payload);
        }

        fn target_cargo(&mut self, cs: A320Cargo, cargo_qty: f64) {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            assert!(cargo_qty <= A320_CARGO_INFO[cs].max_cargo_kg * unit_convert / LBS_TO_KG);

            self.write_by_name(&A320_CARGO_INFO[cs].cargo_target_id, cargo_qty);
        }

        fn start_boarding(mut self) -> Self {
            self.write_by_name("BOARDING_STARTED_BY_USR", true);
            self
        }

        fn with_no_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.load_pax(ps, 0);
            }
            self
        }

        fn with_half_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.load_pax(ps, A320_PAX_INFO[ps].max_pax / 2);
            }
            self
        }

        fn with_full_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.load_pax(ps, A320_PAX_INFO[ps].max_pax);
            }
            self
        }

        fn target_half_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.target_pax(ps, A320_PAX_INFO[ps].max_pax / 2);
            }
            self
        }

        fn target_full_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.target_pax(ps, A320_PAX_INFO[ps].max_pax);
            }
            self
        }

        fn target_no_pax(mut self) -> Self {
            for ps in A320Pax::iterator() {
                self.target_pax(ps, 0);
            }
            self
        }

        fn has_no_pax(&self) {
            for ps in A320Pax::iterator() {
                let pax_num = 0;
                let pax_payload = 0.0;
                assert_eq!(self.pax_num(ps), pax_num);
                assert!(relative_eq!(self.pax_payload(ps), pax_payload));
            }
        }

        fn has_half_pax(&self) {
            for ps in A320Pax::iterator() {
                let pax_num = A320_PAX_INFO[ps].max_pax / 2;
                let pax_payload = pax_num as f64 * DEFAULT_PER_PAX_WEIGHT_KG / LBS_TO_KG;
                assert_eq!(self.pax_num(ps), pax_num);
                assert!(relative_eq!(self.pax_payload(ps), pax_payload));
            }
        }

        fn has_full_pax(&self) {
            for ps in A320Pax::iterator() {
                let pax_num = A320_PAX_INFO[ps].max_pax;
                let pax_payload = pax_num as f64 * DEFAULT_PER_PAX_WEIGHT_KG / LBS_TO_KG;
                assert_eq!(self.pax_num(ps), pax_num);
                assert!(relative_eq!(self.pax_payload(ps), pax_payload));
            }
        }

        fn load_half_cargo(mut self) -> Self {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            for cs in A320Cargo::iterator() {
                self.load_cargo(
                    cs,
                    A320_CARGO_INFO[cs].max_cargo_kg / (unit_convert / LBS_TO_KG) / 2.0,
                );
            }
            self
        }

        fn load_full_cargo(mut self) -> Self {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            for cs in A320Cargo::iterator() {
                self.load_cargo(
                    cs,
                    A320_CARGO_INFO[cs].max_cargo_kg / (unit_convert / LBS_TO_KG),
                );
            }
            self
        }

        fn has_no_cargo(&self) {
            for cs in A320Cargo::iterator() {
                let cargo = 0.0;
                let cargo_payload = 0.0;
                assert_eq!(self.cargo(cs), cargo);
                assert!(relative_eq!(self.cargo_payload(cs), cargo_payload));
            }
        }

        fn has_half_cargo(&mut self) {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            for cs in A320Cargo::iterator() {
                let cargo = A320_CARGO_INFO[cs].max_cargo_kg / (unit_convert / LBS_TO_KG) / 2.0;
                let cargo_payload = cargo / unit_convert;
                assert_eq!(self.cargo(cs), cargo);
                assert!(relative_eq!(self.cargo_payload(cs), cargo_payload));
            }
        }

        fn has_full_cargo(&mut self) {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            for cs in A320Cargo::iterator() {
                let cargo = A320_CARGO_INFO[cs].max_cargo_kg / (unit_convert / LBS_TO_KG);
                let cargo_payload = cargo / unit_convert;
                assert_eq!(self.cargo(cs), cargo);
                assert!(relative_eq!(self.cargo_payload(cs), cargo_payload));
            }
        }

        fn target_no_cargo(mut self) -> Self {
            for cs in A320Cargo::iterator() {
                self.target_cargo(cs, 0.0);
            }
            self
        }

        fn target_half_cargo(mut self) -> Self {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            for cs in A320Cargo::iterator() {
                self.target_cargo(
                    cs,
                    A320_CARGO_INFO[cs].max_cargo_kg / (unit_convert / LBS_TO_KG) / 2.0,
                );
            }
            self
        }

        fn target_full_cargo(mut self) -> Self {
            let unit_convert: f64 = self.read_by_name("EFB_UNIT_CONVERSION_FACTOR");

            for cs in A320Cargo::iterator() {
                self.target_cargo(
                    cs,
                    A320_CARGO_INFO[cs].max_cargo_kg / (unit_convert / LBS_TO_KG),
                );
            }
            self
        }

        fn is_boarding(&self) -> bool {
            self.query(|a| a.boarding.is_boarding())
        }

        fn board_rate(&self) -> BoardingRate {
            self.query(|a| a.boarding.board_rate())
        }

        fn pax(&self, ps: A320Pax) -> u64 {
            self.query(|a| a.boarding.pax(ps as usize))
        }

        fn pax_num(&self, ps: A320Pax) -> i8 {
            self.query(|a| a.boarding.pax_num(ps as usize))
        }

        fn pax_payload(&self, ps: A320Pax) -> f64 {
            self.query(|a| a.boarding.pax_payload(ps as usize))
        }

        fn cargo(&self, cs: A320Cargo) -> f64 {
            self.query(|a| a.boarding.cargo(cs as usize))
        }

        fn cargo_payload(&self, cs: A320Cargo) -> f64 {
            self.query(|a| a.boarding.cargo_payload(cs as usize))
        }
    }

    impl TestBed for BoardingTestBed {
        type Aircraft = BoardingTestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<BoardingTestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<BoardingTestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> BoardingTestBed {
        BoardingTestBed::new()
    }

    fn test_bed_with() -> BoardingTestBed {
        test_bed()
    }

    // TODO: Less asserts
    #[test]
    fn boarding_init() {
        let test_bed = test_bed_with().init_vars_kg();
        assert_eq!(test_bed.board_rate(), BoardingRate::Instant);
        assert_eq!(test_bed.is_boarding(), false);
        assert_eq!(test_bed.pax_num(A320Pax::A), 0);
        assert_eq!(test_bed.pax_num(A320Pax::B), 0);
        assert_eq!(test_bed.pax_num(A320Pax::C), 0);
        assert_eq!(test_bed.pax_num(A320Pax::D), 0);
        assert_eq!(test_bed.cargo(A320Cargo::FwdBaggage), 0.0);
        assert_eq!(test_bed.cargo(A320Cargo::AftContainer), 0.0);
        assert_eq!(test_bed.cargo(A320Cargo::AftBaggage), 0.0);
        assert_eq!(test_bed.cargo(A320Cargo::AftBulkLoose), 0.0);

        assert!(test_bed.contains_variable_with_name("BOARDING_RATE"));
        assert!(test_bed.contains_variable_with_name("EFB_UNIT_CONVERSION_FACTOR"));
        assert!(test_bed.contains_variable_with_name("WB_PER_PAX_WEIGHT"));
        assert!(test_bed.contains_variable_with_name(&A320_PAX_INFO[A320Pax::A].pax_id));
        assert!(test_bed.contains_variable_with_name(&A320_PAX_INFO[A320Pax::B].pax_id));
        assert!(test_bed.contains_variable_with_name(&A320_PAX_INFO[A320Pax::C].pax_id));
        assert!(test_bed.contains_variable_with_name(&A320_PAX_INFO[A320Pax::D].pax_id));
    }
    #[test]
    fn loaded_no_pax() {
        let test_bed = test_bed_with().init_vars_kg().with_no_pax().and_run();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn loaded_full_pax() {
        let test_bed = test_bed_with().init_vars_kg().with_full_pax().and_run();

        test_bed.has_full_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn loaded_half_pax() {
        let test_bed = test_bed_with().init_vars_kg().with_half_pax().and_run();

        test_bed.has_half_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn loaded_no_pax_full_cargo() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_no_pax()
            .load_full_cargo()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_full_cargo();
    }

    #[test]
    fn loaded_no_pax_half_cargo() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_no_pax()
            .load_half_cargo()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn loaded_half_use_lbs() {
        let mut test_bed = test_bed_with()
            .init_vars_lbs()
            .with_half_pax()
            .load_half_cargo()
            .and_run();

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn target_half_pre_board() {
        let test_bed = test_bed_with()
            .init_vars_kg()
            .target_half_pax()
            .target_half_cargo()
            .and_run()
            .and_stabilize();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn test_boarding_trigger() {
        let test_bed = test_bed_with().init_vars_kg().start_boarding().and_run();
        assert_eq!(test_bed.is_boarding(), true);
    }

    #[test]
    fn target_half_pax_trigger_and_finish_board() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .target_half_pax()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn target_half_pax_trigger_and_finish_board_realtime_use_lbs() {
        let mut test_bed = test_bed_with()
            .init_vars_lbs()
            .target_half_pax()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let one_hour_in_seconds = 1 * HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn loaded_half_idle_pending() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_half_pax()
            .load_half_cargo()
            .and_run();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn target_half_and_board() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .target_half_pax()
            .target_half_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn target_half_and_board_lbs() {
        let mut test_bed = test_bed_with()
            .init_vars_lbs()
            .target_half_pax()
            .target_half_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn target_half_and_board_instant() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .target_half_pax()
            .target_half_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run();

        test_bed.has_half_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn start_half_pax_target_full_pax_fast_board() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_half_pax()
            .load_half_cargo()
            .target_full_pax()
            .target_half_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_full_pax();
        test_bed.has_half_cargo();
    }

    #[test]
    fn start_half_cargo_target_full_cargo_real_board_lbs() {
        let mut test_bed = test_bed_with()
            .init_vars_lbs()
            .with_half_pax()
            .load_half_cargo()
            .target_half_pax()
            .target_full_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let one_hour_in_seconds = 1 * HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_half_pax();
        test_bed.has_full_cargo();
    }

    #[test]
    fn start_half_target_full_instantly() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_half_pax()
            .load_half_cargo()
            .target_full_pax()
            .target_full_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run();

        test_bed.has_full_pax();
        test_bed.has_full_cargo();
    }

    #[test]
    fn deboard_full_pax_full_cargo_idle_pending() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_full_pax()
            .load_full_cargo()
            .target_no_pax()
            .target_no_cargo()
            .fast_board_rate()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_full_pax();
        test_bed.has_full_cargo();
    }

    #[test]
    fn deboard_full_pax_full_cargo_fast() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_full_pax()
            .load_full_cargo()
            .target_no_pax()
            .target_no_cargo()
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let fifteen_minutes_in_seconds = 15 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(fifteen_minutes_in_seconds));

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn deboard_half_pax_full_cargo_lbs_instantly() {
        let test_bed = test_bed_with()
            .init_vars_lbs()
            .with_half_pax()
            .load_full_cargo()
            .target_no_pax()
            .target_no_cargo()
            .instant_board_rate()
            .start_boarding()
            .and_run();

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn deboard_half_real() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let one_hour_in_seconds = 1 * HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_no_pax();
        test_bed.has_no_cargo();
    }

    #[test]
    fn deboard_half_five_min_change_to_board_full_real() {
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let five_minutes = 5 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(five_minutes));

        test_bed = test_bed.target_full_pax().target_full_cargo();

        let one_hour_in_seconds = 1 * HOURS_TO_MINUTES * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(one_hour_in_seconds));

        test_bed.has_full_pax();
        test_bed.has_full_cargo();
    }

    #[test]
    fn deboard_half_two_min_change_instant_lbs() {
        let mut test_bed = test_bed_with()
            .init_vars_lbs()
            .with_half_pax()
            .load_half_cargo()
            .target_no_pax()
            .target_no_cargo()
            .real_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let five_minutes = 2 * MINUTES_TO_SECONDS;

        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(five_minutes));

        test_bed = test_bed.instant_board_rate().and_run();
        test_bed.has_no_pax();
        test_bed.has_no_cargo();
    }

    // TODO: Sound tests
    // TODO: Set is board = false and test
}
