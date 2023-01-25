/* eslint-disable no-undef */
// TODO: Deprecate, move boarding backend to WASM
function airplaneCanBoard() {
    const busDC2 = SimVar.GetSimVarValue("L:A32NX_ELEC_DC_2_BUS_IS_POWERED", "Bool");
    const busDCHot1 = SimVar.GetSimVarValue("L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED", "Bool");
    const gs = SimVar.GetSimVarValue("GPS GROUND SPEED", "knots");
    const isOnGround = SimVar.GetSimVarValue("SIM ON GROUND", "Bool");
    const eng1Running = SimVar.GetSimVarValue("ENG COMBUSTION:1", "Bool");
    const eng2Running = SimVar.GetSimVarValue("ENG COMBUSTION:2", "Bool");

    return !(gs > 0.1 || eng1Running || eng2Running || !isOnGround || (!busDC2 && !busDCHot1));
}

function setDefaultWeights(simbriefPaxWeight, simbriefBagWeight) {
    const perPaxWeight = (simbriefPaxWeight === undefined) ? Math.round(NXUnits.kgToUser(84)) : simbriefPaxWeight;
    const perBagWeight = (simbriefBagWeight === undefined) ? Math.round(NXUnits.kgToUser(20)) : simbriefBagWeight;
    const conversionFactor = (getUserUnit() == "Kilograms") ? 0.4535934 : 1;
    SimVar.SetSimVarValue("L:A32NX_WB_PER_PAX_WEIGHT", "Number", parseInt(perPaxWeight));
    SimVar.SetSimVarValue("L:A32NX_WB_PER_BAG_WEIGHT", "Number", parseInt(perBagWeight));
    SimVar.SetSimVarValue("L:A32NX_EFB_UNIT_CONVERSION_FACTOR", "Number", conversionFactor);

    SimVar.SetSimVarValue("L:A32NX_GSX_SYNC_ENABLED", "bool", false);
    SimVar.SetSimVarValue("L:A32NX_BOARDING_RATE", "Number", 2);
}

class A32NX_Boarding {
    constructor() {
        this.boardingState = "finished";
        this.time = 0;
        const payloadConstruct = new A32NX_PayloadConstructor();
        this.paxStations = payloadConstruct.paxStations;
        this.cargoStations = payloadConstruct.cargoStations;

        // GSX Helpers
        this.passengersLeftToFillOrEmpty = 0;
        this.prevBoardedOrDeboarded = 0;
        this.prevCargoDeboardedPercentage = 0;

        this.gsxStates = {
            AVAILABLE: 1,
            NOT_AVAILABLE: 2,
            BYPASSED: 3,
            REQUESTED: 4,
            PERFORMING: 5,
            COMPLETED: 6,
        };
    }

    async init() {
        setDefaultWeights();
        this.updateStationVars();
        this.loadPaxPayload();
        this.loadCargoZero();
        this.loadCargoPayload();
    }

    // Shuffle passengers within same section
    // TODO: Handle this more gracefully
    async shufflePax(paxStation) {
        // Set Active = Desired
        paxStation.activeFlags.setFlags(paxStation.desiredFlags.toNumber());
        await SimVar.SetSimVarValue(`L:${paxStation.simVar}`, "string", paxStation.desiredFlags.toString());
    }

    async fillPaxStation(paxStation, paxTarget) {

        const paxDiff = Math.min(paxTarget, paxStation.seats) - paxStation.activeFlags.getTotalFilledSeats();

        if (paxDiff > 0) {
            const fillChoices = paxStation.desiredFlags.getFilledSeatIds()
                .filter(seatIndex => !paxStation.activeFlags.getFilledSeatIds().includes(seatIndex));
            paxStation.activeFlags.fillSeats(Math.abs(paxDiff), fillChoices);
            await SimVar.SetSimVarValue(`L:${paxStation.simVar}`, "string", paxStation.activeFlags.toString());
        } else if (paxDiff < 0) {
            const emptyChoices = paxStation.desiredFlags.getEmptySeatIds()
                .filter(seatIndex => !paxStation.activeFlags.getEmptySeatIds().includes(seatIndex));
            paxStation.activeFlags.emptySeats(Math.abs(paxDiff), emptyChoices);
            await SimVar.SetSimVarValue(`L:${paxStation.simVar}`, "string", paxStation.activeFlags.toString());
        } else {
            this.shufflePax(paxStation);
        }
    }

    async fillCargoStation(cargoStation, loadToFill) {
        cargoStation.load = loadToFill;
        await SimVar.SetSimVarValue(`L:${cargoStation.simVar}`, "Number", parseInt(loadToFill));
    }

    loadPaxPayload() {
        const PAX_WEIGHT = SimVar.GetSimVarValue("L:A32NX_WB_PER_PAX_WEIGHT", "Number");
        return Promise.all(Object.values(this.paxStations).map((paxStation) => {
            return SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${paxStation.stationIndex}`, getUserUnit(), paxStation.activeFlags.getTotalFilledSeats() * PAX_WEIGHT);
        }));
    }

    loadCargoPayload() {
        return Promise.all(Object.values(this.cargoStations).map((cargoStation) => {
            return SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${cargoStation.stationIndex}`, getUserUnit(), cargoStation.load);
        }));
    }

    loadCargoZero() {
        Object.values(this.cargoStations).forEach((cargoStation) => {
            SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${cargoStation.stationIndex}`, "Kilograms", 0);
            SimVar.SetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number", 0);
            SimVar.SetSimVarValue(`L:${cargoStation.simVar}`, "Number", 0);
        });
    }

    loadPaxZero() {
        Object.values(this.paxStations)
            .reverse()
            .forEach((paxStation) => SimVar.SetSimVarValue(`L:${paxStation.simVar}_DESIRED`, "Number", parseInt(0)));

        Object.values(this.cargoStations)
            .forEach((cargoStation) => SimVar.SetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number", parseInt(0)));
    }

    generateMsDelay(boardingRate) {
        switch (boardingRate) {
            case 'FAST':
                return 1000;
            case 'REAL':
                return 5000;
            default:
                return 5000;
        }
    }

    manageGsxBoarding(boardState) {
        switch (boardState) {
            //GSX doesn't emit 100% boarding, this case is to ensure cargo is 100% filled to target
            case this.gsxStates.COMPLETED:
                Object.values(this.cargoStations).map((cargoStation) => {
                    const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number");
                    this.fillCargoStation(cargoStation, stationCurrentLoadTarget);
                });
                break;
            case this.gsxStates.PERFORMING:
                const gsxBoardingTotal = SimVar.GetSimVarValue("L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL", "Number");
                this.passengersLeftToFillOrEmpty = gsxBoardingTotal - this.prevBoardedOrDeboarded;

                for (const paxStation of Object.values(this.paxStations).reverse()) {
                    const stationCurrentPax = paxStation.activeFlags.getTotalFilledSeats();
                    const stationCurrentPaxTarget = paxStation.desiredFlags.getTotalFilledSeats();
                    if (this.passengersLeftToFillOrEmpty <= 0) {
                        break;
                    }

                    const loadAmount = Math.min(this.passengersLeftToFillOrEmpty, paxStation.seats);
                    if (stationCurrentPax < stationCurrentPaxTarget) {
                        this.fillPaxStation(paxStation, stationCurrentPax + loadAmount);
                        this.passengersLeftToFillOrEmpty -= loadAmount;
                    }
                }
                this.prevBoardedOrDeboarded = gsxBoardingTotal;

                const gsxCargoPercentage = SimVar.GetSimVarValue("L:FSDT_GSX_BOARDING_CARGO_PERCENT", "Number");
                Object.values(this.cargoStations).map((cargoStation) => {
                    const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number");

                    const loadAmount = stationCurrentLoadTarget * (gsxCargoPercentage / 100);
                    this.fillCargoStation(cargoStation, loadAmount);
                });
                break;
            default:
                break;
        }
    }

    manageGsxDeBoarding(boardState) {
        switch (boardState) {

            // this is a backup state incase the EFB page isn't open to set desired PAX/Cargo to 0
            case this.gsxStates.REQUESTED:
                this.loadPaxZero();
                break;

            // GSX doesn't emit 100% deboard percentage, this is set to ensure cargo completetly empties
            case this.gsxStates.COMPLETED:
                Object.values(this.cargoStations).map((cargoStation) => {
                    this.fillCargoStation(cargoStation, 0);
                });
                break;

            case this.gsxStates.PERFORMING:
                const gsxDeBoardingTotal = SimVar.GetSimVarValue("L:FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL", "Number");
                this.passengersLeftToFillOrEmpty = gsxDeBoardingTotal - this.prevBoardedOrDeboarded;

                for (const paxStation of Object.values(this.paxStations).reverse()) {
                    const stationCurrentPax = paxStation.activeFlags.getTotalFilledSeats();
                    const stationCurrentPaxTarget = paxStation.desiredFlags.getTotalFilledSeats();
                    if (this.passengersLeftToFillOrEmpty <= 0) {
                        break;
                    }

                    if (stationCurrentPax > stationCurrentPaxTarget) {
                        this.fillPaxStation(paxStation, stationCurrentPax - Math.min(this.passengersLeftToFillOrEmpty, paxStation.seats));
                        this.passengersLeftToFillOrEmpty -= Math.min(this.passengersLeftToFillOrEmpty, paxStation.seats);
                    }
                }
                this.prevBoardedOrDeboarded = gsxDeBoardingTotal;

                const gsxCargoDeBoardPercentage = SimVar.GetSimVarValue("L:FSDT_GSX_DEBOARDING_CARGO_PERCENT", "Number");
                for (const cargoStation of Object.values(this.cargoStations)) {
                    if (this.prevCargoDeboardedPercentage == gsxCargoDeBoardPercentage) {
                        break;
                    }
                    const stationCurrentLoad = SimVar.GetSimVarValue(`L:${cargoStation.simVar}`, "Number");

                    const loadAmount = stationCurrentLoad * ((100 - gsxCargoDeBoardPercentage) / 100);
                    this.fillCargoStation(cargoStation, loadAmount);
                }
                this.prevCargoDeboardedPercentage = gsxCargoDeBoardPercentage;
                break;
            default:
                break;
        }
    }

    async manageBoarding(boardingRate) {
        if (boardingRate == 'INSTANT') {
            Object.values(this.paxStations).map(async (paxStation) => {
                const stationCurrentPaxTarget = paxStation.desiredFlags.getTotalFilledSeats();
                await this.fillPaxStation(paxStation, stationCurrentPaxTarget);
            });
            Object.values(this.cargoStations).map(async (cargoStation) => {
                const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number");
                await this.fillCargoStation(cargoStation, stationCurrentLoadTarget);
            });
            this.loadPaxPayload();
            this.loadCargoPayload();
            return;
        }

        const msDelay = this.generateMsDelay(boardingRate);

        if (this.time > msDelay) {
            this.time = 0;

            // Stations logic:
            for (const paxStation of Object.values(this.paxStations).reverse()) {
                const stationCurrentPax = paxStation.activeFlags.getTotalFilledSeats();
                const stationCurrentPaxTarget = paxStation.desiredFlags.getTotalFilledSeats();

                if (stationCurrentPax < stationCurrentPaxTarget) {
                    this.fillPaxStation(paxStation, stationCurrentPax + 1);
                    break;
                } else if (stationCurrentPax > stationCurrentPaxTarget) {
                    this.fillPaxStation(paxStation, stationCurrentPax - 1);
                    break;
                } else {
                    continue;
                }
            }

            for (const cargoStation of Object.values(this.cargoStations)) {
                const stationCurrentLoad = SimVar.GetSimVarValue(`L:${cargoStation.simVar}`, "Number");
                const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number");

                const loadDelta = Math.abs(stationCurrentLoadTarget - stationCurrentLoad);
                if (stationCurrentLoad < stationCurrentLoadTarget) {
                    this.fillCargoStation(cargoStation, stationCurrentLoad + Math.min(60, loadDelta));
                    break;
                } else if (stationCurrentLoad > stationCurrentLoadTarget) {
                    this.fillCargoStation(cargoStation, stationCurrentLoad - Math.min(60, loadDelta));
                    break;
                } else {
                    continue;
                }
            }

            this.loadPaxPayload();
            this.loadCargoPayload();
        }
    }

    async updateStationVars() {
        // Cargo
        const currentLoad = Object.values(this.cargoStations).map((cargoStation) => SimVar.GetSimVarValue(`L:${cargoStation.simVar}`, "Number")).reduce((acc, cur) => acc + cur);
        const loadTarget = Object.values(this.cargoStations).map((cargoStation) => SimVar.GetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number")).reduce((acc, cur) => acc + cur);

        // Pax
        let currentPax = 0;
        let paxTarget = 0;
        let isAllPaxStationFilled = true;
        Object.values(this.paxStations).map((paxStation) => {
            paxStation.activeFlags.setFlags(SimVar.GetSimVarValue(`L:${paxStation.simVar}`, 'Number'));
            const stationCurrentPax = paxStation.activeFlags.getTotalFilledSeats();
            currentPax += stationCurrentPax;

            paxStation.desiredFlags.setFlags(SimVar.GetSimVarValue(`L:${paxStation.simVar}_DESIRED`, 'Number'));
            const stationCurrentPaxTarget = paxStation.desiredFlags.getTotalFilledSeats();
            paxTarget += stationCurrentPaxTarget;

            if (stationCurrentPax !== stationCurrentPaxTarget) {
                isAllPaxStationFilled = false;
            }
        });

        let isAllCargoStationFilled = true;
        Object.values(this.cargoStations).map((cargoStation) => {
            const stationCurrentLoad = SimVar.GetSimVarValue(`L:${cargoStation.simVar}`, "Number");
            const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${cargoStation.simVar}_DESIRED`, "Number");

            if (stationCurrentLoad !== stationCurrentLoadTarget) {
                isAllCargoStationFilled = false;
            }
        });
        return [
            currentPax, paxTarget, isAllPaxStationFilled,
            currentLoad, loadTarget, isAllCargoStationFilled
        ];
    }

    async manageSoundControllers(currentPax, paxTarget, boardingStartedByUser) {
        if ((currentPax < paxTarget) && boardingStartedByUser == true) {
            await SimVar.SetSimVarValue("L:A32NX_SOUND_PAX_BOARDING", "Bool", true);
            this.isBoarding = true;
        } else {
            await SimVar.SetSimVarValue("L:A32NX_SOUND_PAX_BOARDING", "Bool", false);
        }

        await SimVar.SetSimVarValue("L:A32NX_SOUND_PAX_DEBOARDING", "Bool", currentPax > paxTarget && boardingStartedByUser == true);

        if ((currentPax == paxTarget) && this.isBoarding == true) {
            await SimVar.SetSimVarValue("L:A32NX_SOUND_BOARDING_COMPLETE", "Bool", true);
            this.isBoarding = false;
            return;
        }
        await SimVar.SetSimVarValue("L:A32NX_SOUND_BOARDING_COMPLETE", "Bool", false);

        await SimVar.SetSimVarValue("L:A32NX_SOUND_PAX_AMBIENCE", "Bool", currentPax > 0);
    }

    async manageBoardingState(currentPax, paxTarget, isAllPaxStationFilled, currentLoad, loadTarget, isAllCargoStationFilled) {

        if (currentPax === paxTarget && currentLoad === loadTarget && isAllPaxStationFilled && isAllCargoStationFilled) {
            // Finish boarding
            this.boardingState = "finished";
            await SimVar.SetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Bool", false);

        } else if ((currentPax < paxTarget) || (currentLoad < loadTarget)) {
            this.boardingState = "boarding";
        } else if ((currentPax === paxTarget) && (currentLoad === loadTarget)) {
            this.boardingState = "finished";
        }
    }

    async update(_deltaTime) {
        this.time += _deltaTime;

        const gsxPayloadSyncEnabled = NXDataStore.get("GSX_PAYLOAD_SYNC", 0);

        SimVar.SetSimVarValue("L:A32NX_GSX_SYNC_ENABLED", "bool", false);
        const boardingRate = NXDataStore.get("CONFIG_BOARDING_RATE", 'REAL');
        switch (boardingRate) {
            case 'REAL':
                SimVar.SetSimVarValue("L:A32NX_BOARDING_RATE", "Number", 2);
                break;
            case 'FAST':
                SimVar.SetSimVarValue("L:A32NX_BOARDING_RATE", "Number", 1);
                break;
            case 'INSTANT':
                SimVar.SetSimVarValue("L:A32NX_BOARDING_RATE", "Number", 0);
                break;
        }

        if (gsxPayloadSyncEnabled === '1') {
            SimVar.SetSimVarValue("L:A32NX_GSX_SYNC_ENABLED", "bool", true);
            const gsxBoardState = Math.round(SimVar.GetSimVarValue("L:FSDT_GSX_BOARDING_STATE", "Number"));
            const gsxDeBoardState = Math.round(SimVar.GetSimVarValue("L:FSDT_GSX_DEBOARDING_STATE", "Number"));

            this.manageGsxDeBoarding(gsxDeBoardState);
            this.manageGsxBoarding(gsxBoardState);

            this.loadPaxPayload();
            this.loadCargoPayload();

        } else {
            SimVar.SetSimVarValue("L:A32NX_GSX_SYNC_ENABLED", "bool", false);
            /*
            const boardingStartedByUser = SimVar.GetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Bool");
            const boardingRate = NXDataStore.get("CONFIG_BOARDING_RATE", 'REAL');

            if (!boardingStartedByUser) {
                return;
            }

            if ((!airplaneCanBoard() && boardingRate == 'REAL') || (!airplaneCanBoard() && boardingRate == 'FAST')) {
                return;
            }

            const [
                currentPax, paxTarget, isAllPaxStationFilled,
                currentLoad, loadTarget, isAllCargoStationFilled
            ] = await this.updateStationVars();

            await this.manageSoundControllers(currentPax, paxTarget, boardingStartedByUser);

            await this.manageBoardingState(currentPax, paxTarget, isAllPaxStationFilled, currentLoad, loadTarget, isAllCargoStationFilled);

            this.manageBoarding(boardingRate);
            */
        }
    }
}
