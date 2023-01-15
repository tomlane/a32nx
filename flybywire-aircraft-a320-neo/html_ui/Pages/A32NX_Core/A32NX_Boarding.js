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
        this.loadPaxPayload();
        this.loadCargoZero();
        this.loadCargoPayload();
    }

    // Shuffle passengers within same station
    // TODO: Handle this more gracefully
    async shufflePax(station) {
        // Set Active = Desired
        station.activeFlags.setFlags(station.desiredFlags.toNumber());
        await SimVar.SetSimVarValue(`L:${station.simVar}`, "string", station.desiredFlags.toString());
    }

    async fillPaxStation(station, paxTarget) {
        const paxDiff = Math.min(paxTarget, station.seats) - station.activeFlags.getTotalFilledSeats();

        if (paxDiff > 0) {
            const fillChoices = station.desiredFlags.getFilledSeatIds()
                .filter(seatIndex => !station.activeFlags.getFilledSeatIds().includes(seatIndex));
            station.activeFlags.fillSeats(Math.abs(paxDiff), fillChoices);
            await SimVar.SetSimVarValue(`L:${station.simVar}`, "string", station.activeFlags.toString());
        } else if (paxDiff < 0) {
            const emptyChoices = station.desiredFlags.getEmptySeatIds()
                .filter(seatIndex => !station.activeFlags.getEmptySeatIds().includes(seatIndex));
            station.activeFlags.emptySeats(Math.abs(paxDiff), emptyChoices);
            await SimVar.SetSimVarValue(`L:${station.simVar}`, "string", station.activeFlags.toString());
        } else {
            this.shufflePax(station);
        }
    }

    async fillCargoStation(station, loadToFill) {
        station.load = loadToFill;
        await SimVar.SetSimVarValue(`L:${station.simVar}`, "Number", parseInt(loadToFill));
    }

    loadPaxPayload() {
        const PAX_WEIGHT = SimVar.GetSimVarValue("L:A32NX_WB_PER_PAX_WEIGHT", "Number");
        return Promise.all(Object.values(this.paxStations).map((station) => {
            return SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station.stationIndex}`, getUserUnit(), station.activeFlags.getTotalFilledSeats() * PAX_WEIGHT);
        }));
    }

    loadCargoPayload() {
        return Promise.all(Object.values(this.cargoStations).map((station) => {
            return SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station.stationIndex}`, getUserUnit(), station.load);
        }));
    }

    loadCargoZero() {
        Object.values(this.cargoStations).forEach((station) => {
            SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station.stationIndex}`, "Kilograms", 0);
            SimVar.SetSimVarValue(`L:${station.simVar}_DESIRED`, "Number", 0);
            SimVar.SetSimVarValue(`L:${station.simVar}`, "Number", 0);
        });
    }

    loadPaxZero() {
        Object.values(this.paxStations)
            .reverse()
            .forEach((station) => SimVar.SetSimVarValue(`L:${station.simVar}_DESIRED`, "Number", parseInt(0)));

        Object.values(this.cargoStations)
            .forEach((station) => SimVar.SetSimVarValue(`L:${station.simVar}_DESIRED`, "Number", parseInt(0)));
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
                Object.values(this.cargoStations).map((station) => {
                    const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, "Number");
                    this.fillCargoStation(station, stationCurrentLoadTarget);
                });
                break;
            case this.gsxStates.PERFORMING:
                const gsxBoardingTotal = SimVar.GetSimVarValue("L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL", "Number");
                this.passengersLeftToFillOrEmpty = gsxBoardingTotal - this.prevBoardedOrDeboarded;

                Object.values(this.paxStations).reverse().some((station) => {
                    const stationCurrentPax = station.activeFlags.getTotalFilledSeats();
                    const stationCurrentPaxTarget = station.desiredFlags.getTotalFilledSeats();
                    if (this.passengersLeftToFillOrEmpty <= 0) {
                        return;
                    }

                    const loadAmount = Math.min(this.passengersLeftToFillOrEmpty, station.seats);
                    if (stationCurrentPax < stationCurrentPaxTarget) {
                        this.fillPaxStation(station, stationCurrentPax + loadAmount);
                        this.passengersLeftToFillOrEmpty -= loadAmount;
                    }
                });
                this.prevBoardedOrDeboarded = gsxBoardingTotal;

                const gsxCargoPercentage = SimVar.GetSimVarValue("L:FSDT_GSX_BOARDING_CARGO_PERCENT", "Number");
                Object.values(this.cargoStations).map((station) => {
                    const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, "Number");

                    const loadAmount = stationCurrentLoadTarget * (gsxCargoPercentage / 100);
                    this.fillCargoStation(station, loadAmount);
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
                Object.values(this.cargoStations).map((station) => {
                    this.fillCargoStation(station, 0);
                });
                break;

            case this.gsxStates.PERFORMING:
                const gsxDeBoardingTotal = SimVar.GetSimVarValue("L:FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL", "Number");
                this.passengersLeftToFillOrEmpty = gsxDeBoardingTotal - this.prevBoardedOrDeboarded;

                Object.values(this.paxStations).reverse().some((station) => {
                    const stationCurrentPax = station.activeFlags.getTotalFilledSeats();
                    const stationCurrentPaxTarget = station.desiredFlags.getTotalFilledSeats();
                    if (this.passengersLeftToFillOrEmpty <= 0) {
                        reyu;
                    }

                    if (stationCurrentPax > stationCurrentPaxTarget) {
                        this.fillPaxStation(station, stationCurrentPax - Math.min(this.passengersLeftToFillOrEmpty, station.seats));
                        this.passengersLeftToFillOrEmpty -= Math.min(this.passengersLeftToFillOrEmpty, station.seats);
                    }
                });
                this.prevBoardedOrDeboarded = gsxDeBoardingTotal;

                const gsxCargoDeBoardPercentage = SimVar.GetSimVarValue("L:FSDT_GSX_DEBOARDING_CARGO_PERCENT", "Number");
                Object.values(this.cargoStations).some((station) => {
                    if (this.prevCargoDeboardedPercentage == gsxCargoDeBoardPercentage) {
                        return;
                    }
                    const stationCurrentLoad = SimVar.GetSimVarValue(`L:${station.simVar}`, "Number");

                    const loadAmount = stationCurrentLoad * ((100 - gsxCargoDeBoardPercentage) / 100);
                    this.fillCargoStation(station, loadAmount);
                });
                this.prevCargoDeboardedPercentage = gsxCargoDeBoardPercentage;
                break;
            default:
                break;
        }
    }

    async manageBoarding(boardingRate) {
        if (boardingRate == 'INSTANT') {
            Object.values(this.paxStations).some(async (station) => {
                const stationCurrentPaxTarget = station.desiredFlags.getTotalFilledSeats();
                await this.fillPaxStation(station, stationCurrentPaxTarget);
            });
            Object.values(this.cargoStations).some(async (station) => {
                const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, "Number");
                await this.fillCargoStation(station, stationCurrentLoadTarget);
            });
            this.loadPaxPayload();
            this.loadCargoPayload();
            return;
        }

        const msDelay = this.generateMsDelay(boardingRate);

        if (this.time > msDelay) {
            this.time = 0;

            // Stations logic:
            Object.values(this.cargoStations).reverse().some((station) => {
                const stationCurrentPax = station.activeFlags.getTotalFilledSeats();

                const stationCurrentPaxTarget = station.desiredFlags.getTotalFilledSeats();

                if (stationCurrentPax < stationCurrentPaxTarget) {
                    this.fillPaxStation(station, stationCurrentPax + 1);
                    return;
                } else if (stationCurrentPax > stationCurrentPaxTarget) {
                    this.fillPaxStation(station, stationCurrentPax - 1);
                    return;
                }
            });

            Object.values(this.cargoStations).some((station) => {
                const stationCurrentLoad = SimVar.GetSimVarValue(`L:${station.simVar}`, "Number");
                const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, "Number");

                const loadDelta = Math.abs(stationCurrentLoadTarget - stationCurrentLoad);
                if (stationCurrentLoad < stationCurrentLoadTarget) {
                    this.fillCargoStation(station, stationCurrentLoad + Math.min(60, loadDelta));
                    return;
                } else if (stationCurrentLoad > stationCurrentLoadTarget) {
                    this.fillCargoStation(station, stationCurrentLoad - Math.min(60, loadDelta));
                    return;
                }
            });

            this.loadPaxPayload();
            this.loadCargoPayload();
        }
    }

    async updateStationVars() {
        // Cargo
        const currentLoad = Object.values(this.cargoStations).map((station) => SimVar.GetSimVarValue(`L:${station.simVar}`, "Number")).reduce((acc, cur) => acc + cur);
        const loadTarget = Object.values(this.cargoStations).map((station) => SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, "Number")).reduce((acc, cur) => acc + cur);

        // Pax
        let currentPax = 0;
        let paxTarget = 0;
        let isAllPaxStationFilled = true;
        Object.values(this.paxStations).map((station) => {
            station.activeFlags.setFlags(SimVar.GetSimVarValue(`L:${station.simVar}`, 'Number'));
            const stationCurrentPax = station.activeFlags.getTotalFilledSeats();
            currentPax += stationCurrentPax;

            station.desiredFlags.setFlags(SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, 'Number'));
            const stationCurrentPaxTarget = station.desiredFlags.getTotalFilledSeats();
            paxTarget += stationCurrentPaxTarget;

            if (stationCurrentPax !== stationCurrentPaxTarget) {
                isAllPaxStationFilled = false;
            }
        });

        let isAllCargoStationFilled = true;
        Object.values(this.cargoStations).map((station) => {
            const stationCurrentLoad = SimVar.GetSimVarValue(`L:${station.simVar}`, "Number");
            const stationCurrentLoadTarget = SimVar.GetSimVarValue(`L:${station.simVar}_DESIRED`, "Number");

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

        if (gsxPayloadSyncEnabled === '1') {
            const gsxBoardState = Math.round(SimVar.GetSimVarValue("L:FSDT_GSX_BOARDING_STATE", "Number"));
            const gsxDeBoardState = Math.round(SimVar.GetSimVarValue("L:FSDT_GSX_DEBOARDING_STATE", "Number"));

            this.manageGsxDeBoarding(gsxDeBoardState);
            this.manageGsxBoarding(gsxBoardState);

            this.loadPaxPayload();
            this.loadCargoPayload();

        } else {
            const boardingStartedByUser = SimVar.GetSimVarValue("L:A32NX_BOARDING_STARTED_BY_USR", "Bool");
            const boardingRate = NXDataStore.get("CONFIG_BOARDING_RATE", 'REAL');

            if (!boardingStartedByUser) {
                return;
            }

            if ((!airplaneCanBoard() && boardingRate == 'REAL') || (!airplaneCanBoard() && boardingRate == 'FAST')) {
                return;
            }

            [currentPax, paxTarget, isAllPaxStationFilled, currentLoad, loadTarget, isAllCargoStationFilled] = await this.updateStationVars();

            await this.manageSoundControllers(currentPax, paxTarget, boardingStartedByUser);

            await this.manageBoardingState(currentPax, paxTarget, isAllPaxStationFilled, currentLoad, loadTarget, isAllCargoStationFilled);

            this.manageBoarding(boardingRate);
        }
    }
}
