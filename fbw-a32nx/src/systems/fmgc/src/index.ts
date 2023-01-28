// Copyright (c) 2021-2022 FlyByWire Simulations
// Copyright (c) 2021-2022 Synaptic Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { normaliseApproachName } from '@shared/flightplan';
import { FlightPlanService } from './flightplanning/new/FlightPlanService';
import { NavigationDatabase, NavigationDatabaseBackend } from './NavigationDatabase';
import { FlightPlanManager } from './flightplanning/FlightPlanManager';
import { FlightPhaseManager, getFlightPhaseManager } from './flightphase';
import { FlightPlanAsoboSync } from './flightplanning/FlightPlanAsoboSync';
import { GuidanceController } from './guidance/GuidanceController';
import { NavRadioManager } from './radionav/NavRadioManager';
import { EfisSymbols } from './efis/EfisSymbols';
import { DescentBuilder } from './guidance/vnav/descent/DescentBuilder';
import { DecelPathBuilder } from './guidance/vnav/descent/DecelPathBuilder';
import { initComponents, updateComponents, recallMessageById } from './components';
import { WaypointBuilder } from './flightplanning/WaypointBuilder';
import { WaypointFactory } from './flightplanning/new/waypoints/WaypointFactory';
import { WaypointEntryUtils } from './flightplanning/new/WaypointEntryUtils';
import { Navigation } from './navigation/Navigation';
import { FlightPlanIndex } from './flightplanning/new/FlightPlanManager';
import { NavigationDatabaseService } from './flightplanning/new/NavigationDatabaseService';
import { SimBriefUplinkAdapter } from './flightplanning/new/uplink/SimBriefUplinkAdapter';

function initFmgcLoop(baseInstrument: BaseInstrument, flightPlanManager: FlightPlanManager): void {
    initComponents(baseInstrument, flightPlanManager);
}

function updateFmgcLoop(deltaTime: number): void {
    updateComponents(deltaTime);
}

export {
    FlightPlanService,
    NavigationDatabase,
    NavigationDatabaseBackend,
    NavigationDatabaseService,
    FlightPlanIndex,
    FlightPhaseManager,
    getFlightPhaseManager,
    FlightPlanManager,
    FlightPlanAsoboSync,
    GuidanceController,
    NavRadioManager,
    initFmgcLoop,
    updateFmgcLoop,
    recallMessageById,
    EfisSymbols,
    DescentBuilder,
    DecelPathBuilder,
    WaypointBuilder,
    WaypointFactory,
    WaypointEntryUtils,
    normaliseApproachName,
    Navigation,
    SimBriefUplinkAdapter,
};
