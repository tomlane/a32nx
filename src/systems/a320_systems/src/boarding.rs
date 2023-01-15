use systems::simulation::{
    InitContext, Read, SimulationElement, SimulatorReader, UpdateContext, VariableIdentifier,
};

pub struct A320Boarding {
    pax_stations_id: Vec<VariableIdentifier>,
    pax_stations: Vec<u64>,
    cargo_stations_id: Vec<VariableIdentifier>,
    cargo_stations: Vec<i32>,
}
impl A320Boarding {
    pub fn new(context: &mut InitContext) -> Self {
        let mut pax_flags_id = Vec::new();
        pax_flags_id.push(context.get_identifier("PAX_FLAGS_A".to_owned()));
        pax_flags_id.push(context.get_identifier("PAX_FLAGS_B".to_owned()));
        pax_flags_id.push(context.get_identifier("PAX_FLAGS_C".to_owned()));
        pax_flags_id.push(context.get_identifier("PAX_FLAGS_D".to_owned()));

        let mut pax_flags = Vec::new();
        pax_flags.push(0);
        pax_flags.push(0);
        pax_flags.push(0);
        pax_flags.push(0);

        A320Boarding {
            pax_stations_id: pax_flags_id,
            pax_stations: pax_flags,
            cargo_stations_id: Vec::new(),
            cargo_stations: Vec::new(),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        // duct_temperature: &impl DuctTemperature,
        // pack_flow_per_cubic_meter: MassRate,
        // pressurization: &impl Cabin,
    ) {
        /*
        let mut air_in = Air::new();
        air_in.set_temperature(duct_temperature.duct_demand_temperature()[self.zone_id.id()]);
        air_in.set_flow_rate(pack_flow_per_cubic_meter * self.zone_volume.get::<cubic_meter>());

        self.zone_air.update(
            context,
            &air_in,
            self.zone_volume,
            self.passengers,
            self.fwd_door_is_open,
            self.rear_door_is_open,
            pressurization,
        );
        */
    }

    /*
    pub function_name(&self) -> bool {
        self.unlimited_fuel || self.left_inner_tank_fuel_quantity > Mass::new::<kilogram>(0.)
    }
    */
}
impl SimulationElement for A320Boarding {
    fn read(&mut self, reader: &mut SimulatorReader) {
        let mut new_pax_stations = Vec::new();
        for r in self.pax_stations_id.iter() {
            new_pax_stations.push(reader.read(&r));
        }
        self.pax_stations = new_pax_stations;
    }
}

#[cfg(test)]
mod boarding_test {
    use super::*;
    use crate::boarding::A320Boarding;
    use crate::systems::simulation::{
        test::{SimulationTestBed, TestBed},
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
    impl SimulationElement for BoardingTestAircraft {}

    struct BoardingTestBed {
        test_bed: SimulationTestBed<BoardingTestAircraft>,
    }
    impl BoardingTestBed {
        fn new() -> Self {
            let mut test_bed = BoardingTestBed {
                test_bed: SimulationTestBed::new(BoardingTestAircraft::new),
            };

            test_bed
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
        assert!((true));
        /*
        let test_bed = test_bed_with()
            .ambient_temperature_of(ThermodynamicTemperature::new::<degree_celsius>(10.))
            .iterate(1);

        assert!((test_bed.cabin_temperature().get::<degree_celsius>() - 10.) < 1.);*/
    }
}
