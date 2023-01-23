use systems::simulation::{
    InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
    SimulatorWriter, UpdateContext, VariableIdentifier, Write,
};

// Utility to sync payload stations with LVars for pax and cargo

#[derive(Debug)]
pub struct PaxSync {
    pax_tgt_id: VariableIdentifier,
    pax_id: VariableIdentifier,
    per_pax_wgt_id: VariableIdentifier,
    unit_cvt_id: VariableIdentifier,
    payload_id: VariableIdentifier,
    per_pax_wgt: f64,
    unit_cvt: f64,
    pax_tgt: u64,
    pax: u64,
    payload: f64,
}
impl PaxSync {
    pub fn new(
        pax_id: VariableIdentifier,
        pax_tgt_id: VariableIdentifier,
        per_pax_wgt_id: VariableIdentifier,
        unit_cvt_id: VariableIdentifier,
        payload_id: VariableIdentifier,
    ) -> Self {
        PaxSync {
            pax_id,
            pax_tgt_id,
            per_pax_wgt_id,
            unit_cvt_id,
            payload_id,
            per_pax_wgt: 0.0,
            unit_cvt: 0.0,
            pax_tgt: 0,
            pax: 0,
            payload: 0.0,
        }
    }

    fn pax(&self) -> u64 {
        self.pax
    }

    fn pax_num(&self) -> i8 {
        self.pax.count_ones() as i8
    }

    fn pax_tgt_num(&self) -> i8 {
        self.pax_tgt.count_ones() as i8
    }

    fn load_payload(&mut self) {
        self.payload = self.pax_num() as f64 * self.per_pax_wgt * self.unit_cvt;
    }

    fn mv_all_pax(&mut self) {
        self.pax = self.pax_tgt;
        self.load_payload();
    }

    fn mv_1_pax(&mut self) {
        let pax_delta = self.pax_num() - self.pax_tgt_num();

        if pax_delta > 0 {
            // Union of empty active and filled desired
            // XOR to add right most bit
            let n = !self.pax & self.pax_tgt;
            let mask = n ^ (n & (n - 1));
            self.pax ^= mask;
        } else if pax_delta < 0 {
            // Union of filled active and empty desired
            // Remove right most bit
            let n = self.pax & !self.pax_tgt;
            self.pax = (n & (n - 1));

            // let n = self.pax.reverse_bits() & !self.pax_tgt.reverse_bits();
            // self.pax = (n & (n - 1)).reverse_bits();
        } else {
            // Union of filled active and empty desired
            // XOR to disable right most bit
            let n = self.pax & !self.pax_tgt;
            let mask = n ^ (n & (n - 1));
            self.pax ^= mask;
        }
        self.load_payload();
    }
}
impl SimulationElement for PaxSync {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.pax = reader.read(&self.pax_id);
        self.pax_tgt = reader.read(&self.pax_tgt_id);
        self.per_pax_wgt = reader.read(&self.per_pax_wgt_id);
        self.unit_cvt = reader.read(&self.unit_cvt_id);
    }
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.pax_id, self.pax);
        writer.write(&self.payload_id, self.payload);
        // writer.write(&self.pax_tgt_id, self.pax_tgt);
    }
}

#[derive(Debug)]
pub struct CargoSync {
    cargo_tgt_id: VariableIdentifier,
    cargo_id: VariableIdentifier,
    payload_id: VariableIdentifier,
    cargo: f64,
    cargo_tgt: f64,
    payload: f64,
}
impl CargoSync {
    pub fn new(
        cargo_id: VariableIdentifier,
        cargo_tgt_id: VariableIdentifier,
        payload_id: VariableIdentifier,
    ) -> Self {
        CargoSync {
            cargo_id,
            cargo_tgt_id,
            payload_id,
            cargo: 0.0,
            cargo_tgt: 0.0,
            payload: 0.0,
        }
    }

    fn cargo(&self) -> f64 {
        self.cargo
    }
}
impl SimulationElement for CargoSync {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.cargo = reader.read(&self.cargo_id);
        self.cargo_tgt = reader.read(&self.cargo_tgt_id);
    }
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.cargo_id, self.cargo);
        writer.write(&self.payload_id, self.payload);
        // writer.write(&self.cargo_tgt_id, self.cargo_tgt);
    }
}

pub struct A320BoardingSounds {
    pax_board_id: VariableIdentifier,
    pax_deboard_id: VariableIdentifier,
    pax_cmpt_id: VariableIdentifier,
    pax_amb_id: VariableIdentifier,
    pax_board: bool,
    pax_deboard: bool,
    pax_cmpt: bool,
    pax_amb: bool,
}
impl A320BoardingSounds {
    pub fn new(
        pax_board_id: VariableIdentifier,
        pax_deboard_id: VariableIdentifier,
        pax_cmpt_id: VariableIdentifier,
        pax_amb_id: VariableIdentifier,
    ) -> Self {
        A320BoardingSounds {
            pax_board_id,
            pax_deboard_id,
            pax_cmpt_id,
            pax_amb_id,
            pax_board: false,
            pax_deboard: false,
            pax_cmpt: false,
            pax_amb: false,
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
    pub fn start_pax_boarding_cmpt(&mut self) {
        self.pax_cmpt = true;
    }
    pub fn stop_pax_boarding_cmpt(&mut self) {
        self.pax_cmpt = false;
    }
    pub fn start_pax_ambience(&mut self) {
        self.pax_amb = true;
    }
    pub fn stop_pax_ambience(&mut self) {
        self.pax_amb = false;
    }
}
impl SimulationElement for A320BoardingSounds {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.pax_board_id, self.pax_board);
        writer.write(&self.pax_deboard_id, self.pax_deboard);
        writer.write(&self.pax_cmpt_id, self.pax_cmpt);
        writer.write(&self.pax_amb_id, self.pax_amb);
    }
}

pub struct A320Boarding {
    is_boarding_id: VariableIdentifier,
    is_boarding: bool,
    pax: Vec<PaxSync>,
    cargo: Vec<CargoSync>,
    boarding_sounds: A320BoardingSounds,
}
impl A320Boarding {
    pub fn new(context: &mut InitContext) -> Self {
        let per_pax_weight = context.get_identifier("WB_PER_PAX_WEIGHT".to_owned());
        let unit_cvt = context.get_identifier("EFB_UNIT_CONVERSION_FACTOR".to_owned());

        let pax = vec![
            PaxSync::new(
                context.get_identifier("PAX_FLAGS_A".to_owned()),
                context.get_identifier("PAX_FLAGS_A_DESIRED".to_owned()),
                per_pax_weight,
                unit_cvt,
                context.get_identifier("PAYLOAD STATION WEIGHT:1".to_owned()),
            ),
            PaxSync::new(
                context.get_identifier("PAX_FLAGS_B".to_owned()),
                context.get_identifier("PAX_FLAGS_B_DESIRED".to_owned()),
                per_pax_weight,
                unit_cvt,
                context.get_identifier("PAYLOAD STATION WEIGHT:2".to_owned()),
            ),
            PaxSync::new(
                context.get_identifier("PAX_FLAGS_C".to_owned()),
                context.get_identifier("PAX_FLAGS_C_DESIRED".to_owned()),
                per_pax_weight,
                unit_cvt,
                context.get_identifier("PAYLOAD STATION WEIGHT:3".to_owned()),
            ),
            PaxSync::new(
                context.get_identifier("PAX_FLAGS_D".to_owned()),
                context.get_identifier("PAX_FLAGS_D_DESIRED".to_owned()),
                per_pax_weight,
                unit_cvt,
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
            boarding_sounds: A320BoardingSounds::new(
                context.get_identifier("SOUND_PAX_BOARDING".to_owned()),
                context.get_identifier("SOUND_PAX_DEBOARDING".to_owned()),
                context.get_identifier("SOUND_BOARDING_COMPLETE".to_owned()),
                context.get_identifier("SOUND_PAX_AMBIENCE".to_owned()),
            ),
            pax,
            cargo,
        }
    }

    pub fn update(&mut self, _context: &UpdateContext) {
        // println!("pax stations: {:?}", self.pax);
    }

    fn pax(&self, ps: usize) -> u64 {
        self.pax[ps].pax()
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
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.is_boarding_id, self.is_boarding);
    }
}

#[cfg(test)]
mod boarding_test {
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
    impl Aircraft for BoardingTestAircraft {}
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

        fn load_pax(mut self, station: &str, max_pax: i8, pax_qty: i8) -> Self {
            let mut pax_flag: u64 = 0;
            for b in 0..pax_qty {
                pax_flag ^= 1 << b;
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

        fn tgt_pax_a(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_A_DESIRED", 36, pax_qty)
        }
        fn tgt_pax_b(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_B_DESIRED", 42, pax_qty)
        }
        fn tgt_pax_c(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_C_DESIRED", 48, pax_qty)
        }
        fn tgt_pax_d(mut self, pax_qty: i8) -> Self {
            self.load_pax("PAX_FLAGS_D_DESIRED", 48, pax_qty)
        }

        fn start_boarding(mut self) -> Self {
            self.write_by_name("BOARDING_STARTED_BY_USR", true);
            self
        }

        fn pax(&self, ps: usize) -> u64 {
            self.query(|a| a.boarding.pax(ps))
        }
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
        let test_bed = test_bed();
        assert!((test_bed.is_boarding() == false));
        for ps in 0..test_bed.pax_len() {
            assert!(test_bed.pax(ps) == 0);
        }
        for cs in 0..test_bed.cargo_len() {
            assert!(test_bed.cargo(cs) == 0.0);
        }
    }

    #[test]
    fn loaded_pax_a_c() {
        let pax_a = 36;
        let pax_c = 48;
        let test_bed = test_bed().load_pax_a(pax_a).load_pax_c(pax_c).and_run();

        assert!(test_bed.pax_a_num() == pax_a);
        assert!(test_bed.pax_b_num() == 0);
        assert!(test_bed.pax_c_num() == pax_c);
        assert!(test_bed.pax_d_num() == 0);
    }

    #[test]
    fn loaded_pax_b_d() {
        let pax_b = 42;
        let pax_d = 48;
        let test_bed = test_bed().load_pax_b(pax_b).load_pax_d(pax_d).and_run();

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
        let test_bed = test_bed()
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
        let test_bed = test_bed()
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
    fn test_boarding_trigger() {
        let test_bed = test_bed().start_boarding().and_run();
        assert!((test_bed.is_boarding() == true));
    }
}
