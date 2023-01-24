use std::time::Duration;

use systems::{
    boarding::{BoardingRate, CargoSync, PaxSync},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

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

        let pax = vec![
            PaxSync::new(
                "A".to_string(),
                context.get_identifier("PAX_FLAGS_A".to_owned()),
                context.get_identifier("PAX_FLAGS_A_DESIRED".to_owned()),
                per_pax_weight_id,
                unit_convert_id,
                context.get_identifier("PAYLOAD STATION WEIGHT:1".to_owned()),
            ),
            PaxSync::new(
                "B".to_string(),
                context.get_identifier("PAX_FLAGS_B".to_owned()),
                context.get_identifier("PAX_FLAGS_B_DESIRED".to_owned()),
                per_pax_weight_id,
                unit_convert_id,
                context.get_identifier("PAYLOAD STATION WEIGHT:2".to_owned()),
            ),
            PaxSync::new(
                "C".to_string(),
                context.get_identifier("PAX_FLAGS_C".to_owned()),
                context.get_identifier("PAX_FLAGS_C_DESIRED".to_owned()),
                per_pax_weight_id,
                unit_convert_id,
                context.get_identifier("PAYLOAD STATION WEIGHT:3".to_owned()),
            ),
            PaxSync::new(
                "D".to_string(),
                context.get_identifier("PAX_FLAGS_D".to_owned()),
                context.get_identifier("PAX_FLAGS_D_DESIRED".to_owned()),
                per_pax_weight_id,
                unit_convert_id,
                context.get_identifier("PAYLOAD STATION WEIGHT:4".to_owned()),
            ),
        ];

        let cargo = vec![
            CargoSync::new(
                context.get_identifier("CARGO_FWD_BAGGAGE_CONTAINER".to_owned()),
                context.get_identifier("CARGO_FWD_BAGGAGE_CONTAINER_DESIRED".to_owned()),
                context.get_identifier("PAYLOAD STATION WEIGHT:5".to_owned()),
            ),
            CargoSync::new(
                context.get_identifier("CARGO_AFT_CONTAINER".to_owned()),
                context.get_identifier("CARGO_AFT_CONTAINER_DESIRED".to_owned()),
                context.get_identifier("PAYLOAD STATION WEIGHT:6".to_owned()),
            ),
            CargoSync::new(
                context.get_identifier("CARGO_AFT_BAGGAGE".to_owned()),
                context.get_identifier("CARGO_AFT_BAGGAGE_DESIRED".to_owned()),
                context.get_identifier("PAYLOAD STATION WEIGHT:7".to_owned()),
            ),
            CargoSync::new(
                context.get_identifier("CARGO_AFT_BULK_LOOSE".to_owned()),
                context.get_identifier("CARGO_AFT_BULK_LOOSE_DESIRED".to_owned()),
                context.get_identifier("PAYLOAD STATION WEIGHT:8".to_owned()),
            ),
        ];

        A320Boarding {
            is_boarding_id: context.get_identifier("BOARDING_STARTED_BY_USR".to_owned()),
            is_boarding: false,
            board_rate_id: context.get_identifier("BOARDING_RATE".to_owned()),
            board_rate: BoardingRate::Instant,
            boarding_sounds: A320BoardingSounds::new(
                context.get_identifier("SOUND_PAX_BOARDING".to_owned()),
                context.get_identifier("SOUND_PAX_DEBOARDING".to_owned()),
                context.get_identifier("SOUND_BOARDING_COMPLETE".to_owned()),
                context.get_identifier("SOUND_pax_ambienceIENCE".to_owned()),
            ),
            pax,
            cargo,
            time: Duration::from_nanos(0),
        }
    }

    pub(crate) fn update(&mut self, context: &UpdateContext) {
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
            for ps in (0..self.pax.len()).rev() {
                if self.pax_is_target(ps) {
                    continue;
                }
                if self.board_rate == BoardingRate::Instant {
                    self.move_all_pax(ps);
                } else {
                    self.move_1_pax(ps);
                    break;
                }
            }
            // TODO: Cargo
            for cs in 0..self.cargo.len() {
                /*
                if self.cargo[cs].cargo_is_target() {
                    continue;
                }
                if self.board_rate == BoardingRate::Instant {
                    self.move_all_cargo(cs);
                } else {
                    self.move_1_cargo(cs);
                    break;
                }
                */
            }
        }
    }

    fn pax(&self, ps: usize) -> u64 {
        self.pax[ps].pax()
    }

    fn pax_is_target(&mut self, ps: usize) -> bool {
        self.pax[ps].pax_is_target()
    }

    fn move_all_pax(&mut self, ps: usize) {
        self.pax[ps].move_all_pax();
    }

    fn move_1_pax(&mut self, ps: usize) {
        self.pax[ps].move_1_pax();
    }

    fn cargo(&self, cs: usize) -> f64 {
        self.cargo[cs].cargo()
    }

    fn pax_num(&self, ps: usize) -> i8 {
        self.pax[ps].pax_num() as i8
    }

    fn is_boarding(&self) -> bool {
        self.is_boarding
    }
}
impl SimulationElement for A320Boarding {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for ps in 0..self.pax.len() {
            self.pax[ps].accept(visitor);
        }
        for cs in 0..self.cargo.len() {
            self.cargo[cs].accept(visitor);
        }
        self.boarding_sounds.accept(visitor);

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
    use rand::seq::IteratorRandom;
    use systems::electrical::Electricity;

    use super::*;
    use crate::boarding::A320Boarding;
    use crate::systems::simulation::{
        test::{SimulationTestBed, TestBed, WriteByName},
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
            self.write_by_name("EFB_UNIT_CONVERSION_FACTOR", 0.4535934);
            self.write_by_name("WB_PER_PAX_WEIGHT", 84.0);
            self.write_by_name("WB_PER_BAG_WEIGHT", 20.0);

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

        fn load_pax(mut self, station: &str, max_pax: i8, pax_qty: i8) -> Self {
            assert!(pax_qty <= max_pax);

            let mut rng = rand::thread_rng();

            let binding: Vec<i8> = (0..max_pax).collect();
            let choices = binding
                .iter()
                .choose_multiple(&mut rng, pax_qty.try_into().unwrap());

            let mut pax_flag: u64 = 0;
            for c in choices {
                pax_flag ^= 1 << c;
            }

            self.write_by_name(station, pax_flag);
            self
        }

        fn load_pax_a(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_A", 36, pax_qty)
        }

        fn load_pax_b(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_B", 42, pax_qty)
        }

        fn load_pax_c(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_C", 48, pax_qty)
        }

        fn load_pax_d(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_D", 48, pax_qty)
        }

        fn target_pax_a(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_A_DESIRED", 36, pax_qty)
        }

        fn target_pax_b(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_B_DESIRED", 42, pax_qty)
        }

        fn target_pax_c(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_C_DESIRED", 48, pax_qty)
        }

        fn target_pax_d(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_D_DESIRED", 48, pax_qty)
        }

        fn start_boarding(mut self) -> Self {
            self.write_by_name("BOARDING_STARTED_BY_USR", true);
            self
        }

        fn pax(&self, ps: usize) -> u64 {
            self.query(|a| a.boarding.pax(ps))
        }

        /*
        fn pax_a(&self) -> u64 {
            self.pax(0)
        }

        fn pax_b(&self) -> u64 {
            self.pax(1)
        }

        fn pax_c(&self) -> u64 {
            self.pax(2)
        }

        fn pax_d(&self) -> u64 {
            self.pax(3)
        }
        */

        fn pax_num(&self, ps: usize) -> i8 {
            self.query(|a| a.boarding.pax_num(ps))
        }

        fn pax_a_num(&self) -> i8 {
            self.pax_num(0)
        }

        fn pax_b_num(&self) -> i8 {
            self.pax_num(1)
        }

        fn pax_c_num(&self) -> i8 {
            self.pax_num(2)
        }

        fn pax_d_num(&self) -> i8 {
            self.pax_num(3)
        }

        fn pax_len(&self) -> usize {
            self.query(|a| a.boarding.pax.len())
        }

        fn cargo(&self, cs: usize) -> f64 {
            self.query(|a| a.boarding.cargo(cs))
        }

        fn cargo_len(&self) -> usize {
            self.query(|a| a.boarding.cargo.len())
        }

        fn is_boarding(&self) -> bool {
            self.query(|a| a.boarding.is_boarding())
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

    #[test]
    fn boarding_init() {
        let test_bed = test_bed_with().init_vars_kg();
        assert!((test_bed.is_boarding() == false));
        for ps in 0..test_bed.pax_len() {
            assert!(test_bed.pax(ps) == 0);
        }
        for cs in 0..test_bed.cargo_len() {
            assert!(test_bed.cargo(cs) == 0.0);
        }

        assert!(test_bed.contains_variable_with_name("BOARDING_RATE"));
        assert!(test_bed.contains_variable_with_name("EFB_UNIT_CONVERSION_FACTOR"));
        assert!(test_bed.contains_variable_with_name("WB_PER_PAX_WEIGHT"));
        // assert!(test_bed.contains_variable_with_name("WB_PER_BAG_WEIGHT"));
        assert!(test_bed.contains_variable_with_name("PAX_FLAGS_A"));
        assert!(test_bed.contains_variable_with_name("PAX_FLAGS_B"));
        assert!(test_bed.contains_variable_with_name("PAX_FLAGS_C"));
        assert!(test_bed.contains_variable_with_name("PAX_FLAGS_D"));
    }

    #[test]
    fn loaded_pax_a_c() {
        let pax_a = 36;
        let pax_c = 48;
        let test_bed = test_bed_with()
            .load_pax_a(pax_a)
            .load_pax_c(pax_c)
            .and_run();

        assert!(test_bed.pax_a_num() == pax_a);
        assert!(test_bed.pax_b_num() == 0);
        assert!(test_bed.pax_c_num() == pax_c);
        assert!(test_bed.pax_d_num() == 0);
    }

    #[test]
    fn loaded_pax_b_d() {
        let pax_b = 42;
        let pax_d = 48;
        let test_bed = test_bed_with()
            .init_vars_kg()
            .load_pax_b(pax_b)
            .load_pax_d(pax_d)
            .and_run();

        assert!(test_bed.pax_a_num() == 0);
        assert!(test_bed.pax_b_num() == pax_b);
        assert!(test_bed.pax_c_num() == 0);
        assert!(test_bed.pax_d_num() == pax_d);
    }

    #[test]
    fn loaded_full_pax() {
        let pax_a = 36;
        let pax_b = 42;
        let pax_c = 48;
        let pax_d = 48;
        let test_bed = test_bed_with()
            .init_vars_kg()
            .load_pax_a(pax_a)
            .load_pax_b(pax_b)
            .load_pax_c(pax_c)
            .load_pax_d(pax_d)
            .and_run();

        assert!(test_bed.pax_a_num() == pax_a);
        assert!(test_bed.pax_b_num() == pax_b);
        assert!(test_bed.pax_c_num() == pax_c);
        assert!(test_bed.pax_d_num() == pax_d);
    }

    #[test]
    fn loaded_half_pax() {
        let pax_a = 18;
        let pax_b = 21;
        let pax_c = 24;
        let pax_d = 24;
        let test_bed = test_bed_with()
            .init_vars_kg()
            .load_pax_a(pax_a)
            .load_pax_b(pax_b)
            .load_pax_c(pax_c)
            .load_pax_d(pax_d)
            .and_run();

        assert!(test_bed.pax_a_num() == pax_a);
        assert!(test_bed.pax_b_num() == pax_b);
        assert!(test_bed.pax_c_num() == pax_c);
        assert!(test_bed.pax_d_num() == pax_d);
    }

    #[test]
    fn target_half_pax_pre_board() {
        let pax_a = 18;
        let pax_b = 21;
        let pax_c = 24;
        let pax_d = 24;
        let test_bed = test_bed_with()
            .init_vars_kg()
            .target_pax_a(pax_a)
            .target_pax_b(pax_b)
            .target_pax_c(pax_c)
            .target_pax_d(pax_d)
            .and_run()
            .and_stabilize();

        assert!(test_bed.pax_a_num() == 0);
        assert!(test_bed.pax_b_num() == 0);
        assert!(test_bed.pax_c_num() == 0);
        assert!(test_bed.pax_d_num() == 0);
    }

    #[test]
    fn test_boarding_trigger() {
        let test_bed = test_bed_with().init_vars_kg().start_boarding().and_run();
        assert!((test_bed.is_boarding() == true));
    }

    #[test]
    fn target_half_pax_trigger_and_finish_board() {
        let pax_a = 18;
        let pax_b = 21;
        let pax_c = 24;
        let pax_d = 24;
        let mut test_bed = test_bed_with()
            .init_vars_kg()
            .target_pax_a(pax_a)
            .target_pax_b(pax_b)
            .target_pax_c(pax_c)
            .target_pax_d(pax_d)
            .fast_board_rate()
            .start_boarding()
            .and_run()
            .and_stabilize();

        let s = 60 * 60;
        test_bed
            .test_bed
            .run_multiple_frames(Duration::from_secs(s));

        assert!(test_bed.pax_a_num() == pax_a);
        assert!(test_bed.pax_b_num() == pax_b);
        assert!(test_bed.pax_c_num() == pax_c);
        assert!(test_bed.pax_d_num() == pax_d);
    }
}
