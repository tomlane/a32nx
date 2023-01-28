//  Copyright (c) 2021 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

import { AltitudeDescriptor, ApproachType, ApproachWaypointDescriptor, ElevatedCoordinates, WaypointDescriptor } from 'msfs-navdata';
import { Geometry } from '@fmgc/guidance/Geometry';
import { Predictions, StepResults, VnavStepError } from '@fmgc/guidance/vnav/Predictions';
import { FlapConf } from '@fmgc/guidance/vnav/common';
import { FlightPlanService } from '@fmgc/flightplanning/new/FlightPlanService';
import { FlightPlanLeg } from '@fmgc/flightplanning/new/legs/FlightPlanLeg';
import { distanceTo, placeBearingDistance } from 'msfs-geo';
import { reciprocal } from '@fmgc/guidance/lnav/CommonGeometry';

const ALTITUDE_ADJUSTMENT_FACTOR = 1.4;

/**
 * The minimum deceleration rate, in knots per second, to target on the approach path.
 *
 * This will be used as the target rate in case it cannot be achieved using the desired fpa.
 */
const MINIMUM_APPROACH_DECELERATION = 0.5;

export enum ApproachPathSegmentType {
    CONSTANT_SLOPE,
    CONSTANT_SLOPE_ALTITUDE_STEP,
    CONSTANT_SPEED,
    LEVEL_DECELERATION,
}

export interface DecelPathCharacteristics {
    flap1: NauticalMiles,
    flap2: NauticalMiles,
    decel: NauticalMiles,
    top: Feet,
    finalDescent: FinalDescentCharacteristics,
}

// TODO separate xLS and curved stuff cleanly
interface FinalDescentCharacteristics {
    anchorPoint: ElevatedCoordinates,
    finalAltitude: Feet,
    finalCourse?: DegreesTrue,
    /** negative for descent */
    fpa: Degrees,
    interceptAltitude: Feet,
    /** distance backward from the anchor point */
    interceptDistance: NauticalMiles,
    interceptPoint?: ElevatedCoordinates,
    /** is this a valid profile that can be used for guidance (FLS and/or FINAL APP) */
    validForGuidance?: boolean,
    nonPrecision?: boolean,
    anchorLegIndex?: number,
}

// TODO rename ApproachBuilder
export class DecelPathBuilder {
    static computeDecelPath(
        _geometry: Geometry,
    ): DecelPathCharacteristics {
        let facfIndex = -1;
        let fafIndex = -1;
        let mapIndex = -1;
        let fepIndex = -1;
        for (const [i, leg] of FlightPlanService.active.allLegs.entries()) {
            if (leg instanceof FlightPlanLeg) {
                const def = leg.definition;
                if (
                    def.approachWaypointDescriptor === ApproachWaypointDescriptor.FinalApproachCourseFix
                    || def.approachWaypointDescriptor === ApproachWaypointDescriptor.InitialApproachFixWithFacf
                ) {
                    facfIndex = i;
                }
                if (def.approachWaypointDescriptor === ApproachWaypointDescriptor.FinalApproachFix) {
                    fafIndex = i;
                }
                if (def.approachWaypointDescriptor === ApproachWaypointDescriptor.FinalEndpointFix) {
                    fepIndex = i;
                }
                if (def.approachWaypointDescriptor === ApproachWaypointDescriptor.MissedApproachPoint) {
                    mapIndex = i;
                }
            }
        }

        const approachType = FlightPlanService.active?.approach?.type;
        let finalDescent;

        switch (approachType) {
        case ApproachType.Gls:
        case ApproachType.Ils:
        case ApproachType.Mls:
        case ApproachType.MlsTypeA:
        case ApproachType.MlsTypeBC:
            finalDescent = DecelPathBuilder.computePrecisionDescent(facfIndex, fafIndex, mapIndex);
            break;
        default:
            finalDescent = DecelPathBuilder.computeNonPrecisionDescent(facfIndex, fafIndex, mapIndex, fepIndex);
            break;
        }

        console.log(finalDescent);

        // TO GET FPA:
        // If approach exists, use approach alt constraints to get FPA and glidepath
        // If no approach but arrival, use arrival alt constraints, if any
        // If no other alt constraints, use 3 degree descent from cruise altitude

        // Given FPA above, calculate distance required (backwards from Vapp @ runway threshold alt + 50ft + 1000ft),
        // to decelerate from green dot speed to Vapp using `decelerationFromGeometricStep`
        // Then, add a speedChangeStep (1.33 knots/second decel) backwards from this point (green dot spd) to previous speed, aka min(last spd constraint, spd lim)
        //      - TODO: make sure alt constraints are obeyed during this speed change DECEL segment?
        // The point at the beginning of the speedChangeStep is DECEL

        const TEMP_TROPO = 36_000;
        const TEMP_FUEL_WEIGHT = 2_300;
        const DES = 250;
        const O = 203;
        const S = 184;
        const F = 143;
        const vApp = 135;

        let fuelWeight = TEMP_FUEL_WEIGHT;

        // TODO what if we hit the intercept alt first

        // TODO skip for conf 3 approach
        const cFullToFullExtSegment = DecelPathBuilder.computeConfigurationChangeSegment(
            ApproachPathSegmentType.CONSTANT_SLOPE,
            finalDescent.fpa,
            1_000,
            F,
            vApp,
            fuelWeight,
            FlapConf.CONF_FULL,
            true,
            TEMP_TROPO,
        );
        fuelWeight += cFullToFullExtSegment.fuelBurned;

        // TODO the speeds of the following segments are too slow
        // TODO this should really be a constant FPA deceleration from intercept alt to F speed, solving for intiial speed
        const cFullExtto3Segment = DecelPathBuilder.computeConfigurationChangeSegment(
            ApproachPathSegmentType.CONSTANT_SLOPE_ALTITUDE_STEP,
            finalDescent.fpa,
            cFullToFullExtSegment.initialAltitude,
            F,
            F,
            fuelWeight,
            FlapConf.CONF_3,
            true,
            TEMP_TROPO,
            finalDescent.interceptAltitude,
        );
        fuelWeight += cFullExtto3Segment.fuelBurned;

        // at intercept alt we are already in conf 3 and begin extending l/g

        const c3to2Segment = DecelPathBuilder.computeConfigurationChangeSegment(
            ApproachPathSegmentType.LEVEL_DECELERATION,
            0,
            finalDescent.interceptAltitude,
            F + (S - F) / 2,
            F,
            fuelWeight,
            FlapConf.CONF_3,
            false,
            TEMP_TROPO,
        );
        fuelWeight += c3to2Segment.fuelBurned;

        const c2to1Segment = DecelPathBuilder.computeConfigurationChangeSegment(
            ApproachPathSegmentType.LEVEL_DECELERATION,
            0,
            finalDescent.interceptAltitude,
            S,
            F + (S - F) / 2,
            fuelWeight,
            FlapConf.CONF_2,
            false,
            TEMP_TROPO,
        );
        fuelWeight += c2to1Segment.fuelBurned;

        const c1toCleanSegment = DecelPathBuilder.computeConfigurationChangeSegment(
            ApproachPathSegmentType.LEVEL_DECELERATION,
            0,
            finalDescent.interceptAltitude,
            O,
            S,
            fuelWeight,
            FlapConf.CONF_1,
            false,
            TEMP_TROPO,
        );
        fuelWeight += c1toCleanSegment.fuelBurned;

        let cleanToDesSpeedSegment = DecelPathBuilder.computeConfigurationChangeSegment(
            ApproachPathSegmentType.LEVEL_DECELERATION,
            0,
            finalDescent.interceptAltitude,
            DES,
            O,
            fuelWeight,
            FlapConf.CLEAN,
            false,
            TEMP_TROPO,
        );

        // TODO for TOO_LOW_DECELERATION do CONSTANT_DECELERATION, not LEVEL_DECELERATION
        if (cleanToDesSpeedSegment.error === VnavStepError.AVAILABLE_GRADIENT_INSUFFICIENT
            || cleanToDesSpeedSegment.error === VnavStepError.TOO_LOW_DECELERATION) {
            if (DEBUG) {
                console.warn('[VNAV/computeDecelPath] AVAILABLE_GRADIENT_INSUFFICIENT/TOO_LOW_DECELERATION on cleanToDesSpeedSegment -> reverting to LEVEL_DECELERATION segment.');
            }

            // if (VnavConfig.VNAV_DESCENT_MODE !== VnavDescentMode.CDA) {
            cleanToDesSpeedSegment = DecelPathBuilder.computeConfigurationChangeSegment(
                ApproachPathSegmentType.LEVEL_DECELERATION,
                undefined,
                finalDescent.interceptAltitude,
                DES,
                O,
                fuelWeight,
                FlapConf.CLEAN,
                false,
                TEMP_TROPO,
            );
            // } else {
            //     throw new Error('[VNAV/computeDecelPath] Computation of cleanToDesSpeedSegment for CDA is not yet implemented');
            // }
        }

        return {
            flap1: finalDescent.interceptDistance
                + c3to2Segment.distanceTraveled
                + c2to1Segment.distanceTraveled
                + c1toCleanSegment.distanceTraveled,
            flap2: finalDescent.interceptDistance
                + c3to2Segment.distanceTraveled
                + c2to1Segment.distanceTraveled,
            decel: finalDescent.interceptDistance
                + c3to2Segment.distanceTraveled
                + c2to1Segment.distanceTraveled
                + c1toCleanSegment.distanceTraveled
                + cleanToDesSpeedSegment.distanceTraveled,
            top: finalDescent.interceptAltitude,
            finalDescent,
        };
    }

    /**
     * Calculates a config change segment of the DECEL path.
     *
     * @return the config change segment step results
     */
    private static computeConfigurationChangeSegment(
        type: ApproachPathSegmentType,
        fpa: number,
        finalAltitude: Feet,
        fromSpeed: Knots,
        toSpeed: Knots,
        initialFuelWeight: number, // TODO take finalFuelWeight and make an iterative prediction
        newConfiguration: FlapConf,
        gearExtended: boolean,
        tropoAltitude: number,
        /** only for CONSTANT_SLOPE_ALTITUDE_STEP */
        initialAltitude?: Feet,
    ): StepResults {
        // TODO For now we use some "reasonable" values for the segment. When we have the ability to predict idle N1 and such at approach conditions,
        // we can change this.

        switch (type) {
        case ApproachPathSegmentType.CONSTANT_SLOPE: // FIXME hard-coded to -3deg in speedChangeStep

            let currentIterationAltitude = finalAltitude * ALTITUDE_ADJUSTMENT_FACTOR;
            let stepResults: StepResults;
            let altitudeError = 0;
            let iterationCount = 0;

            if (DEBUG) {
                console.log('starting iterative step compute');
                console.time(`step to altitude ${finalAltitude}`);
            }

            do {
                if (DEBUG) {
                    console.log(`iteration #${iterationCount}, with initialAltitude = ${currentIterationAltitude}, targetFinalAltitude = ${finalAltitude}`);

                    console.time(`step to altitude ${finalAltitude} iteration ${iterationCount}`);
                }

                const newStepResults = Predictions.speedChangeStep(
                    fpa ?? -3,
                    currentIterationAltitude,
                    fromSpeed,
                    toSpeed,
                    999,
                    999,
                    26,
                    107_000,
                    initialFuelWeight,
                    2,
                    0,
                    tropoAltitude,
                    gearExtended,
                    newConfiguration,
                    MINIMUM_APPROACH_DECELERATION,
                );

                // Stop if we encounter a NaN
                if (Number.isNaN(newStepResults.finalAltitude)) {
                    if (DEBUG) {
                        console.timeEnd(`step to altitude ${finalAltitude} iteration ${iterationCount}`);
                    }
                    break;
                }

                stepResults = newStepResults;

                altitudeError = finalAltitude - stepResults.finalAltitude;
                currentIterationAltitude += altitudeError;

                if (DEBUG) {
                    console.timeEnd('stuff after');

                    console.log(`iteration #${iterationCount} done finalAltitude = ${stepResults.finalAltitude}, error = ${altitudeError}`);

                    console.timeEnd(`step to altitude ${finalAltitude} iteration ${iterationCount}`);
                }

                iterationCount++;
            } while (Math.abs(altitudeError) >= 25 && iterationCount < 4);

            if (DEBUG) {
                console.timeEnd(`step to altitude ${finalAltitude}`);
                console.log('done with iterative step compute');
            }

            return {
                ...stepResults,
                initialAltitude: currentIterationAltitude,
            };
        case ApproachPathSegmentType.CONSTANT_SLOPE_ALTITUDE_STEP: {
            const distance = (finalAltitude - initialAltitude) * 0.3048 / 1852 / Math.tan(fpa * Math.PI / 180);

            const stepResults = Predictions.geometricStep(
                initialAltitude,
                finalAltitude,
                distance,
                (fromSpeed + toSpeed) / 2,
                999,
                107_000,
                initialFuelWeight,
                0,
                tropoAltitude,
                gearExtended,
                newConfiguration,
            );

            return {
                ...stepResults,
                initialAltitude,
            };
        }
        case ApproachPathSegmentType.CONSTANT_SPEED:
            throw new Error('[FMS/VNAV/computeConfigurationChangeSegment] CONSTANT_SPEED is not supported for configuration changes.');
        case ApproachPathSegmentType.LEVEL_DECELERATION:
            return Predictions.speedChangeStep(
                0,
                // TODO wtf is this "adjustment factor"?
                finalAltitude * ALTITUDE_ADJUSTMENT_FACTOR,
                fromSpeed,
                toSpeed,
                999,
                999,
                26,
                107_000,
                initialFuelWeight,
                2,
                0,
                tropoAltitude,
                gearExtended,
                newConfiguration,
            );
        default:
            throw new Error('[FMS/VNAV/computeConfigurationChangeSegment] Unknown segment type.');
        }
    }

    private static computePrecisionDescent(facfIndex: number, fafIndex: number, mapIndex: number): FinalDescentCharacteristics {
        if (facfIndex === -1 || fafIndex === -1 || mapIndex === -1) {
            return DecelPathBuilder.computeDefaultFinalDescent();
        }

        const facfLeg: FlightPlanLeg = FlightPlanService.active.allLegs[facfIndex] as FlightPlanLeg;
        const mapLeg: FlightPlanLeg = FlightPlanService.active.allLegs[mapIndex] as FlightPlanLeg;
        if (facfLeg.definition.altitudeDescriptor !== AltitudeDescriptor.AtAlt1GsIntcptAlt2
            && facfLeg.definition.altitudeDescriptor !== AltitudeDescriptor.AtOrAboveAlt1GsIntcptAlt2
        ) {
            throw new Error('Invalid precision approach... no G/S intercept coded!');
        }

        if (mapLeg.waypointDescriptor !== WaypointDescriptor.Runway) {
            throw new Error('Invalid precision approach... map is not the runway threshold!');
        }

        const interceptAltitude = facfLeg.definition.altitude2;
        const fpa = mapLeg.definition.verticalAngle;
        const anchorPoint: ElevatedCoordinates = {
            ...mapLeg.definition.waypoint.location,
            // TODO check this assumption
            alt: mapLeg.definition.altitude1,
        };
        // TODO turn to true
        const finalCourse = facfLeg.definition.magneticCourse;

        const interceptDistance = (interceptAltitude - anchorPoint.alt) * 0.3048 / 1852 / Math.tan(-fpa * Math.PI / 180);

        const interceptPoint = {
            ...placeBearingDistance(
                anchorPoint,
                reciprocal(finalCourse),
                interceptDistance,
            ),
            alt: interceptAltitude,
        };

        return {
            anchorPoint,
            finalAltitude: anchorPoint.alt,
            finalCourse,
            fpa,
            interceptAltitude,
            interceptDistance,
            interceptPoint,
            validForGuidance: true,
        };
    }

    private static computeNonPrecisionDescent(facfIndex, fafIndex, mapIndex, fepIndex): FinalDescentCharacteristics {
        if (fafIndex === -1 || (mapIndex === -1 && fepIndex === -1)) {
            return DecelPathBuilder.computeDefaultFinalDescent();
        }

        const mapLeg = FlightPlanService.active.allLegs[mapIndex] as FlightPlanLeg;
        const fepLeg = FlightPlanService.active.allLegs[fepIndex] as FlightPlanLeg;

        const fpa = mapLeg.definition.verticalAngle;
        // TODO calculate correctly per FCOM
        const anchorPoint: ElevatedCoordinates = {
            ...mapLeg.definition.waypoint.location,
            // TODO check this assumption
            alt: mapLeg.definition.altitude1,
        };
        const anchorLegIndex = mapIndex;

        let minAlt = -Infinity;
        const minAlts = new Map<number, Feet>();
        for (let i = mapIndex - 1; i > 0; i--) {
            const leg = FlightPlanService.active.allLegs[i];
            if (leg instanceof FlightPlanLeg) {
                switch (leg.definition.altitudeDescriptor) {
                case AltitudeDescriptor.AtAlt1:
                case AltitudeDescriptor.AtAlt1AngleAlt2:
                case AltitudeDescriptor.AtOrAboveAlt1:
                    minAlt = Math.max(minAlt, leg.definition.altitude1);
                    break;
                case AltitudeDescriptor.AtOrAboveAlt2:
                case AltitudeDescriptor.BetweenAlt1Alt2:
                    minAlt = Math.max(minAlt, leg.definition.altitude2);
                    break;
                default:
                }
            }
            minAlts.set(i, minAlt);
        }

        let distance = mapLeg.definition.length;
        let interceptAltitude;
        for (let i = mapIndex - 1; i > 0 && FlightPlanService.active.allLegs[i] instanceof FlightPlanLeg; i--) {
            const leg = FlightPlanService.active.allLegs[i] as FlightPlanLeg;

            let legDist;

            // TODO calc length when not specified
            if (leg.definition.type === 'TF') {
                const prevLeg = FlightPlanService.active.allLegs[i - 1];
                if (prevLeg instanceof FlightPlanLeg && prevLeg.isXF()) {
                    legDist = distanceTo(
                        prevLeg.definition.waypoint.location,
                        leg.definition.waypoint.location,
                    );
                } else {
                    break;
                }
            } else {
                legDist = leg.definition.length;
            }

            const termAlt = anchorPoint.alt + (distance * 1852 / 0.3048) * Math.tan(-fpa * Math.PI / 180);
            const initialAlt = termAlt + (legDist * 1852 / 0.3048) * Math.tan(-fpa * Math.PI / 180);

            if (i === fafIndex && initialAlt >= minAlts.get(i - 1)) {
                // we intercepted in this leg! :D
                interceptAltitude = minAlts.get(i - 1);
                const altDiff = termAlt - interceptAltitude;
                const distance2Intercept = altDiff / Math.tan(fpa * Math.PI / 180) / 1852 * 0.3048;
                distance += distance2Intercept;
                console.log(`Intecept ${distance2Intercept.toFixed(1)} prior to ${leg.ident}`);
                break;
            } else if (i <= fafIndex && initialAlt >= minAlts.get(i)) {
                // we intercepted in this leg! :D
                interceptAltitude = minAlts.get(i);
                const altDiff = termAlt - interceptAltitude;
                const distance2Intercept = altDiff / Math.tan(fpa * Math.PI / 180) / 1852 * 0.3048;
                distance += distance2Intercept;
                console.log(`Intecept ${distance2Intercept.toFixed(1)} prior to ${leg.ident}`);
                break;
            } else {
                distance += legDist;
            }
        }

        if (!interceptAltitude) {
            return DecelPathBuilder.computeDefaultFinalDescent();
        }

        return {
            anchorPoint,
            finalAltitude: anchorPoint.alt,
            fpa,
            interceptAltitude,
            interceptDistance: distance,
            validForGuidance: true,
            nonPrecision: true,
            anchorLegIndex,
        };
    }

    private static computeDefaultFinalDescent(): FinalDescentCharacteristics {
        let anchorPoint;
        let interceptAltitude = 1500;
        let finalCourse;

        if (FlightPlanService.active.destinationRunway) {
            anchorPoint = {
                ...FlightPlanService.active.destinationRunway.thresholdLocation,
                alt: FlightPlanService.active.destinationRunway.thresholdLocation.alt + FlightPlanService.active.destinationRunway.thresholdCrossingHeight,
            };
            interceptAltitude += FlightPlanService.active.destinationRunway.thresholdLocation.alt;
            finalCourse = FlightPlanService.active.destinationRunway.bearing;
        } if (FlightPlanService.active.destinationAirport) {
            anchorPoint = {
                ...FlightPlanService.active.destinationAirport.location,
                alt: FlightPlanService.active.destinationAirport.location.alt + 50,
            };
            interceptAltitude += FlightPlanService.active.destinationAirport.location.alt;
        } else {
            return null;
        }

        const interceptDistance = (interceptAltitude - anchorPoint.alt) * 0.3048 / 1852 / Math.tan(3 * Math.PI / 180);

        return {
            anchorPoint,
            finalAltitude: anchorPoint.alt,
            finalCourse,
            fpa: -3,
            interceptAltitude,
            interceptDistance,
        };
    }
}
