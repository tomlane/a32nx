use systems::simulation::{
    InitContext, Read, SimulationElement, SimulatorReader, UpdateContext, VariableIdentifier,
};

pub struct A320Boarding {
    pax_stations_id: Vec<VariableIdentifier>,
    pax_stations: Vec<u64>,
    cargo_stations_id: Vec<VariableIdentifier>,
    cargo_stations: Vec<i32>,
    is_boarding_id: VariableIdentifier,
    is_boarding: bool,
}
impl A320Boarding {
    pub fn new(context: &mut InitContext) -> Self {
        let mut pax_stations_id = Vec::new();
        pax_stations_id.push(context.get_identifier("PAX_FLAGS_A".to_owned()));
        pax_stations_id.push(context.get_identifier("PAX_FLAGS_B".to_owned()));
        pax_stations_id.push(context.get_identifier("PAX_FLAGS_C".to_owned()));
        pax_stations_id.push(context.get_identifier("PAX_FLAGS_D".to_owned()));

        let mut pax_stations = Vec::new();
        pax_stations.push(0);
        pax_stations.push(0);
        pax_stations.push(0);
        pax_stations.push(0);

        let mut cargo_stations_id = Vec::new();
        cargo_stations_id.push(context.get_identifier("CARGO_FWD_BAGGAGE_CONTAINER".to_owned()));
        cargo_stations_id.push(context.get_identifier("CARGO_AFT_CONTAINER".to_owned()));
        cargo_stations_id.push(context.get_identifier("CARGO_AFT_BAGGAGE".to_owned()));
        cargo_stations_id.push(context.get_identifier("CARGO_AFT_BULK_LOOSE".to_owned()));

        let mut cargo_stations = Vec::new();
        cargo_stations.push(0);
        cargo_stations.push(0);
        cargo_stations.push(0);
        cargo_stations.push(0);

        A320Boarding {
            pax_stations_id: pax_stations_id,
            pax_stations: pax_stations,
            cargo_stations_id: cargo_stations_id,
            cargo_stations: cargo_stations,
            is_boarding_id: context.get_identifier("BOARDING_STARTED_BY_USR".to_owned()),
            is_boarding: false,
        }
    }

    pub fn update(&mut self, _context: &UpdateContext) {}

    fn update_pax_station(&mut self, pS: usize, new_pax: u64) {
        self.pax_stations[pS] = new_pax;
    }

    fn pax_station_id(&self, pS: usize) -> VariableIdentifier {
        self.pax_stations_id[pS]
    }

    fn pax_station(&self, pS: usize) -> u64 {
        self.pax_stations[pS]
    }

    fn pax_count(&self, pS: usize) -> u8 {
        self.pax_stations[pS].count_ones() as u8
    }

    fn cargo_station_id(&self, cS: usize) -> VariableIdentifier {
        self.cargo_stations_id[cS]
    }

    fn cargo_station(&self, cS: usize) -> i32 {
        self.cargo_stations[cS]
    }

    fn is_boarding(&self) -> bool {
        self.is_boarding
    }
}
impl SimulationElement for A320Boarding {
    fn read(&mut self, reader: &mut SimulatorReader) {
        let mut new_pax_stations = Vec::new();
        for r in self.pax_stations_id.iter() {
            new_pax_stations.push(reader.read(&r));
        }

        let mut new_cargo_stations = Vec::new();
        for r in self.cargo_stations_id.iter() {
            new_cargo_stations.push(reader.read(&r));
        }
        self.pax_stations = new_pax_stations;
        self.cargo_stations = new_cargo_stations;
        self.is_boarding = reader.read(&self.is_boarding_id);
    }
}

#[cfg(test)]
mod boarding_test {
    use super::*;
    use crate::boarding::A320Boarding;
    use crate::systems::simulation::{
        test::{SimulationTestBed, TestBed, WriteByName},
        Aircraft,
        SimulationElement, //, SimulationElementVisitor,
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
    impl SimulationElement for BoardingTestAircraft {}

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

        fn load_pax_a(mut self, pax_qty: u8) -> Self {
            let mut pax_flag: u64 = 0;
            let st_qty = pax_qty;
            for b in 0..st_qty {
                pax_flag ^= 1 << b;
            }
            self.write_by_name("PAX_FLAGS_A", pax_flag);
            self.command(|a| a.boarding.update_pax_station(0, pax_flag));
            self
        }

        fn pax_station(&self, pS: usize) -> u64 {
            self.query(|a| a.boarding.pax_station(pS))
        }

        fn cargo_station(&self, cS: usize) -> i32 {
            self.query(|a| a.boarding.cargo_station(cS))
        }

        fn is_boarding(&self) -> bool {
            self.query(|a| a.boarding.is_boarding())
        }

        fn iterate(mut self, iterations: usize) -> Self {
            for _ in 0..iterations {
                self.run();
            }
            self
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
        BoardingTestBed::new()
    }

    #[test]
    fn boarding_init() {
        let test_bed = test_bed();
        assert!((test_bed.is_boarding() == false));
        assert!(test_bed.pax_station(0) == 0);
        assert!(test_bed.pax_station(1) == 0);
        assert!(test_bed.pax_station(2) == 0);
        assert!(test_bed.pax_station(3) == 0);
        assert!(test_bed.cargo_station(0) == 0);
        assert!(test_bed.cargo_station(1) == 0);
        assert!(test_bed.cargo_station(2) == 0);
        assert!(test_bed.cargo_station(3) == 0);
    }

    #[test]
    fn boarding_first_pax_station_full() {
        let station_quantity_a = 36;

        let test_bed = test_bed().load_pax_a(station_quantity_a).iterate(1);

        let pax_station_a = test_bed.pax_station(0);

        let mut max_pax_a: u64 = 0;
        for b in 0..station_quantity_a {
            max_pax_a ^= 1 << b;
        }

        // TODO FIXME
        println!("pax_station_a: {}", pax_station_a);

        assert!((pax_station_a == max_pax_a));
    }
}
