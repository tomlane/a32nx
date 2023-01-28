const MAX_FIX_ROW = 5;

const Markers = {
    FPLN_DISCONTINUITY: ["---F-PLN DISCONTINUITY--"],
    END_OF_FPLN:        ["------END OF F-PLN------"],
    NO_ALTN_FPLN:       ["-----NO ALTN F-PLN------"],
    END_OF_ALTN_FPLN:   ["---END OF ALT F-PLN----"],
    TOO_STEEP_PATH:     ["-----TOO STEEP PATH-----"]
};

class CDUFlightPlanPage {

    static ShowPage(mcdu, offset = 0, forPlan = 0) {

        // INIT
        function addLskAt(index, delay, callback) {
            mcdu.leftInputDelay[index] = (typeof delay === 'function') ? delay : () => delay;
            mcdu.onLeftInput[index] = callback;
        }

        function addRskAt(index, delay, callback) {
            mcdu.rightInputDelay[index] = (typeof delay === 'function') ? delay : () => delay;
            mcdu.onRightInput[index] = callback;
        }

        function getRunwayInfo(/** @type {import('msfs-navdata').Runway} */ runway) {
            return ['', ''];
            let runwayText, runwayAlt;
            if (runway) {
                runwayText = runway.ident.substring(2);
                runwayAlt = (runway.elevation * 3.280).toFixed(0).toString();
            }
            return [runwayText, runwayAlt];
        }

        //mcdu.flightPlanManager.updateWaypointDistances(false /* approach */);
        //mcdu.flightPlanManager.updateWaypointDistances(true /* approach */);
        mcdu.clearDisplay();
        mcdu.page.Current = mcdu.page.FlightPlanPage;
        mcdu.returnPageCallback = () => {
            CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
        };
        mcdu.activeSystem = 'FMGC';
        const fpm = mcdu.flightPlanManager;

        // regular update due to showing dynamic data on this page
        mcdu.page.SelfPtr = setTimeout(() => {
            if (mcdu.page.Current === mcdu.page.FlightPlanPage) {
                CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
            }
        }, mcdu.PageTimeout.Medium);

        const flightPhase = mcdu.flightPhaseManager.phase;
        const isFlying = flightPhase >= FmgcFlightPhases.TAKEOFF && flightPhase != FmgcFlightPhases.DONE;

        let showFrom = false;
        const showSEC = false;
        // TODO FIXME: Correct FMS lateral position calculations and move logic from F-PLN A
        // 22-70-00:11
        const adirLat = ADIRS.getLatitude();
        const adirLong = ADIRS.getLongitude();
        const ppos = (adirLat.isNormalOperation() && adirLong.isNormalOperation()) ? {
            lat: ADIRS.getLatitude().value,
            long: ADIRS.getLongitude().value,
        } : {
            lat: NaN,
            long: NaN
        };

        const forActiveOrTemporary = forPlan === 0;
        const targetPlan = forActiveOrTemporary ? mcdu.flightPlanService.activeOrTemporary : mcdu.flightPlanService.secondary(1);
        const planAccentColor = forActiveOrTemporary ? mcdu.flightPlanService.hasTemporary ? 'yellow' : 'green' : 'white';

        let headerText;
        if (forActiveOrTemporary) {
            if (mcdu.flightPlanService.hasTemporary) {
                headerText = `{yellow}{sp}TMPY{end}`;
            } else {
                headerText = `{sp}`;
            }
        } else {
            headerText = `{sp}{sp}{sp}{sp}{sp}{sp}{sp}{sp}{sp}{sp}{sp}SEC`;
        }

        let flightNumberText = '';
        if (forActiveOrTemporary) {
            flightNumberText = SimVar.GetSimVarValue("ATC FLIGHT NUMBER", "string", "FMC");
        }

        const stats = targetPlan.computeWaypointStatistics();
        // const stats = fpm.getCurrentFlightPlan().computeWaypointStatistics(ppos);

        // TODO FIXME: Move from F-PLN A
        const utcTime = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");

        if (mcdu.flightPlanService.active.originAirport) {
            if (!isFlying) {
                // TODO
                // fpm._waypointReachedAt = utcTime;
            }
        }

        const waypointsAndMarkers = [];
        const first = Math.max(0, targetPlan.activeLegIndex - 1);

        // PWPs
        const fmsPseudoWaypoints = mcdu.guidanceController.currentPseudoWaypoints;

        // Primary F-PLAN
        for (let i = first; i < targetPlan.legCount; i++) {
            const pseudoWaypointsOnLeg = fmsPseudoWaypoints.filter((it) => it.displayedOnMcdu && it.alongLegIndex === i);

            if (pseudoWaypointsOnLeg) {
                waypointsAndMarkers.push(...pseudoWaypointsOnLeg.map((pwp) => ({ pwp, fpIndex: i })));
            }

            /** @type {FlightPlanElement} */
            const wp = targetPlan.allLegs[i];

            if (wp.isDiscontinuity) {
                waypointsAndMarkers.push({ marker: Markers.FPLN_DISCONTINUITY, fpIndex: i, inAlternate: false });
                continue;
            }

            if (i >= targetPlan.activeLegIndex && wp.definition.type === 'HM') {
                waypointsAndMarkers.push({ holdResumeExit: wp, fpIndex: i });
            }

            waypointsAndMarkers.push({ wp, fpIndex: i, inAlternate: false });

            if (i === targetPlan.lastLegIndex) {
                waypointsAndMarkers.push({ marker: Markers.END_OF_FPLN, fpIndex: i, inAlternate: false });
            }
        }

        // Primary ALTN F-PLAN
        if (targetPlan.alternateDestinationAirport) {
            for (let i = 0; i < targetPlan.alternateFlightPlan.legCount; i++) {
                /** @type {FlightPlanElement} */
                const wp = targetPlan.alternateFlightPlan.allLegs[i];

                if (wp.isDiscontinuity) {
                    waypointsAndMarkers.push({ marker: Markers.FPLN_DISCONTINUITY, fpIndex: i, inAlternate: true });
                    continue;
                }

                // TODO port over (fms-v2)
                if (i >= targetPlan.alternateFlightPlan.activeLegIndex && wp.definition.type === 'HM') {
                    waypointsAndMarkers.push({ holdResumeExit: wp, fpIndex: i, inAlternate: true });
                }

                waypointsAndMarkers.push({ wp, fpIndex: i, inAlternate: true });

                if (i === targetPlan.alternateFlightPlan.lastLegIndex) {
                    waypointsAndMarkers.push({ marker: Markers.END_OF_ALTN_FPLN, fpIndex: i, inAlternate: true });
                }
            }
        } else {
            waypointsAndMarkers.push({ marker: Markers.NO_ALTN_FPLN, fpIndex: targetPlan.legCount + 1, inAlternate: true });
        }

        // Render F-PLAN Display

        // fprow:   1      | 2     | 3 4   | 5 6   | 7 8   | 9 10  | 11 12   |
        // display: SPD/ALT| R0    | R1    | R2    | R3    | R4    | DEST    | SCRATCHPAD
        // functions:      | F[0]  | F[1]  | F[2]  | F[3]  | F[4]  | F[5]    |
        //                 | FROM  | TO    |
        let rowsCount = 5;

        if (waypointsAndMarkers.length === 0) {
            rowsCount = 0;
            mcdu.setTemplate([
                [`{left}{small}{sp}${showFrom ? "FROM" : "{sp}{sp}{sp}{sp}"}{end}${headerText}{end}{right}{small}${flightNumberText}{sp}{sp}{sp}{end}{end}`],
                ...emptyFplnPage()
            ]);
            mcdu.onLeftInput[0] = () => CDULateralRevisionPage.ShowPage(mcdu, undefined, undefined, forPlan);
            return;
        } else if (waypointsAndMarkers.length >= 5) {
            rowsCount = 5;
        } else {
            rowsCount = waypointsAndMarkers.length;
        }

        // Only examine first 5 (or less) waypoints/markers
        const scrollWindow = [];
        for (let rowI = 0, winI = offset; rowI < rowsCount; rowI++, winI++) {
            winI = winI % (waypointsAndMarkers.length);

            const { /** @type {{wp: FlightPlanElement}} */ wp, pwp, marker, holdResumeExit, fpIndex, inAlternate} = waypointsAndMarkers[winI];

            const wpPrev = targetPlan.maybeElementAt(fpIndex - 1);
            const wpNext = targetPlan.maybeElementAt(fpIndex + 1);
            const wpActive = (fpIndex >= targetPlan.activeLegIndex);

            // Bearing/Track
            const bearingTrack = "";
            // const bearingTrackTo = wp ? wp : wpNext; TODO port over
            // if (wpPrev && bearingTrackTo && bearingTrackTo.additionalData.legType !== 14 /* HM */) {
            //     const magVar = Facilities.getMagVar(wpPrev.infos.coordinates.lat, wpPrev.infos.coordinates.long);
            //     switch (rowI) {
            //         case 1:
            //             if (fpm.getActiveWaypointIndex() === fpIndex) {
            //                 const br = fpm.getBearingToActiveWaypoint();
            //                 const bearing = A32NX_Util.trueToMagnetic(br, magVar);
            //                 bearingTrack = `BRG${bearing.toFixed(0).toString().padStart(3,"0")}\u00b0`;
            //             }
            //             break;
            //         case 2:
            //             const tr = Avionics.Utils.computeGreatCircleHeading(wpPrev.infos.coordinates, bearingTrackTo.infos.coordinates);
            //             const track = A32NX_Util.trueToMagnetic(tr, magVar);
            //             bearingTrack = `{${fpm.isCurrentFlightPlanTemporary() ? "yellow" : "green"}}TRK${track.toFixed(0).padStart(3,"0")}\u00b0{end}`;
            //             break;
            //     }
            // }

            if (wp && wp.isDiscontinuity === false) {
                // Waypoint
                if (offset === 0) {
                    showFrom = true;
                }

                let ident = wp.ident;
                const isOverfly = wp.definition.overfly;

                // Time
                let time;
                let timeCell = "----[s-text]";
                if (ident !== "MANUAL") {
                    if (isFlying) {
                        if (fpIndex === targetPlan.destinationLegIndex || isFinite(wp.liveUTCTo) || isFinite(wp.waypointReachedAt)) {
                            time = (fpIndex === targetPlan.destinationLegIndex || wpActive || ident === "(DECEL)") ? stats.get(fpIndex).etaFromPpos : wp.waypointReachedAt;
                            timeCell = `${FMCMainDisplay.secondsToUTC(time)}[s-text]`;
                        }
                    } else {
                        if (fpIndex === targetPlan.destinationLegIndex || isFinite(wp.liveETATo)) {
                            time = (fpIndex === targetPlan.destinationLegIndex || wpActive || ident === "(DECEL)") ? stats.get(fpIndex).timeFromPpos : 0;
                            timeCell = `${FMCMainDisplay.secondsTohhmm(time)}[s-text]`;
                        }
                    }
                }

                // Color
                let color;
                if (!inAlternate && fpIndex === targetPlan.activeLegIndex) {
                    color = "white";
                } else {
                    const inMissedApproach = targetPlan.index === Fmgc.FlightPlanIndex.Active && fpIndex >= targetPlan.firstMissedApproachLegIndex;

                    if (inMissedApproach || inAlternate) {
                        color = 'cyan';
                    } else {
                        color = planAccentColor;
                    }
                }

                // Fix Header
                const fixAnnotation = wp.annotation;

                // Bearing/Track
                const bearingTrack = "";
                if (wpPrev && wpPrev.isDiscontinuity === false && wp.type !== 14 /* HM */) {
                    // const magVar = Facilities.getMagVar(wpPrev.terminationWaypoint().location.lat, wpPrev.terminationWaypoint().location.lon);
                    switch (rowI) {
                        case 1:
                        // if (mcdu.flightPlanService.activeOrTemporary.activeLegIndex === fpIndex) { TODO
                        //     const br = fpm.getBearingToActiveWaypoint();
                        //     const bearing = A32NX_Util.trueToMagnetic(br, magVar);
                        //     bearingTrack = `BRG${bearing.toFixed(0).toString().padStart(3,"0")}\u00b0`;
                        // }
                        // break;
                        // case 2: TODO
                        //     const tr = Avionics.Utils.computeGreatCircleHeading(wpPrev.infos.coordinates, wp.infos.coordinates);
                        //     const track = A32NX_Util.trueToMagnetic(tr, magVar);
                        //     bearingTrack = `{${mcdu.flightPlanService.hasTemporary} ? "yellow" : "green"}}TRK${track.toFixed(0).padStart(3,"0")}\u00b0{end}`;
                        //     break;
                    }
                }

                // Distance
                let distance = "";

                // Active waypoint is live distance, others are distances in the flight plan
                // TODO FIXME: actually use the correct prediction
                if (!inAlternate) {
                    if (fpIndex === targetPlan.activeLegIndex) {
                        distance = stats.get(fpIndex).distanceFromPpos.toFixed(0);
                    } else {
                        distance = stats.get(fpIndex).distanceInFP.toFixed(0);
                    }
                }

                if (distance > 9999) {
                    distance = 9999;
                }

                distance = distance.toString();

                let fpa = '';
                if (wp.definition.verticalAngle !== undefined) {
                    fpa = (Math.round(wp.definition.verticalAngle * 10) / 10).toFixed(1);
                }

                let speedConstraint = "---";
                if (wp.speedConstraint > 10 && ident !== "MANUAL") {
                    speedConstraint = `{magenta}*{end}${wp.speedConstraint.toFixed(0)}`;
                }

                let altColor = color;
                let spdColor = color;
                let timeColor = color;

                // Altitude
                const hasAltConstraint = legHasAltConstraint(wp);
                let altitudeConstraint = "-----";
                let altPrefix = "\xa0";
                if (!inAlternate && fpIndex === targetPlan.destinationLegIndex) {
                    altColor = "white";
                    spdColor = "white";
                    altitudeConstraint = altitudeConstraint.padStart(5, "\xa0");
                    if (wp.isRunway()) {
                        altitudeConstraint = formatLegAltConstraint(wp);
                        altColor = color;
                    } else {
                        altitudeConstraint = formatAlt(targetPlan.destinationAirport.location.alt);
                    }
                } else if (!inAlternate && fpIndex === targetPlan.originLegIndex) {
                    if (wp.isRunway()) {
                        const runway = targetPlan.originRunway;

                        ident = `${targetPlan.originAirport.ident}${runway.ident.substring(2)}`;
                        altitudeConstraint = `{big}${formatAlt(runway.thresholdLocation.alt)}{end}`;
                        altColor = color;
                    } else {
                        altitudeConstraint = `{big}${formatAlt(targetPlan.originAirport.location.alt)}{end}`;
                    }
                } else if (hasAltConstraint) {
                    altPrefix = "{magenta}*{end}";
                    altitudeConstraint = formatLegAltConstraint(wp);
                }

                if (speedConstraint === "---") {
                    spdColor = "white";
                }

                if (altitudeConstraint === "-----") {
                    altColor = "white";
                }

                if (fpIndex !== targetPlan.destinationLegIndex) {
                    timeColor = color;
                } else {
                    timeColor = "white";
                }

                // forced turn indication if next leg is not a course reversal
                if (wpNext && legTurnIsForced(wpNext) && !legTypeIsCourseReversal(wpNext)) {
                    if (wpNext.turnDirection === 1) {
                        ident += "{";
                    } else {
                        ident += "}";
                    }
                }

                scrollWindow[rowI] = {
                    fpIndex: fpIndex,
                    inAlternate: inAlternate,
                    active: wpActive,
                    ident: ident,
                    color: color,
                    distance: distance,
                    spdColor: spdColor,
                    speedConstraint: speedConstraint,
                    altColor: altColor,
                    altitudeConstraint: {alt: altitudeConstraint, altPrefix: altPrefix},
                    timeCell: timeCell,
                    timeColor: timeColor,
                    fixAnnotation: fixAnnotation ? fixAnnotation : "",
                    bearingTrack: bearingTrack,
                    isOverfly: isOverfly,
                    fpa,
                };

                if (fpIndex !== targetPlan.destinationLegIndex) {
                    addLskAt(rowI,
                        (value) => {
                            if (value === "") {
                                return mcdu.getDelaySwitchPage();
                            }
                            return mcdu.getDelayBasic();
                        },
                        (value, scratchpadCallback) => {
                            switch (value) {
                                case "":
                                    CDULateralRevisionPage.ShowPage(mcdu, wp, fpIndex, forPlan, inAlternate);
                                    break;
                                case FMCMainDisplay.clrValue:
                                    CDUFlightPlanPage.clearElement(mcdu, fpIndex, offset, forPlan, inAlternate, scratchpadCallback);
                                    break;
                                case FMCMainDisplay.ovfyValue:
                                    mcdu.toggleWaypointOverfly(fpIndex, () => {
                                        CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
                                    });
                                    break;
                                default:
                                    if (value.length > 0) {
                                        mcdu.insertWaypoint(value, forPlan, inAlternate, fpIndex, true, (success) => {
                                            if (!success) {
                                                scratchpadCallback();
                                            }
                                            CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
                                        }, !mcdu.flightPlanService.hasTemporary);
                                    }
                                    break;
                            }
                        });
                } else {
                    addLskAt(rowI, () => mcdu.getDelaySwitchPage(),
                        (value, scratchpadCallback) => {
                            if (value === "") {
                                CDULateralRevisionPage.ShowPage(mcdu, wp, fpIndex, forPlan, inAlternate);
                            } else if (value.length > 0) {
                                mcdu.insertWaypoint(value, forPlan, inAlternate, fpIndex, true, (success) => {
                                    if (!success) {
                                        scratchpadCallback();
                                    }
                                    CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
                                }, true);
                            }
                        });
                }

                addRskAt(rowI, () => mcdu.getDelaySwitchPage(),
                    (value, scratchpadCallback) => {
                        if (value === "") {
                            CDUVerticalRevisionPage.ShowPage(mcdu, wp);
                        } else if (value === FMCMainDisplay.clrValue) {
                            mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
                        } else {
                            CDUVerticalRevisionPage.setConstraints(mcdu, wp, value, scratchpadCallback, offset);
                        }
                    });

            } else if (pwp) {
                scrollWindow[rowI] = {
                    fpIndex: fpIndex,
                    active: false,
                    ident: pwp.ident,
                    color: forActiveOrTemporary ? (mcdu.flightPlanService.hasTemporary) ? "yellow" : "green" : "white",
                    distance: Math.round(pwp.stats.distanceInFP).toString(),
                    spdColor: "white",
                    speedConstraint: "---",
                    altColor: 'white',
                    altitudeConstraint: { alt: "-----", altPrefix: "\xa0" },
                    timeCell: "----[s-text]",
                    timeColor: "white",
                    fixAnnotation: "",
                    bearingTrack: "",
                    isOverfly: false,
                };
            } else if (marker) {
                // Marker
                scrollWindow[rowI] = waypointsAndMarkers[winI];
                addLskAt(rowI, 0, (value, scratchpadCallback) => {
                    if (value === FMCMainDisplay.clrValue) {
                        CDUFlightPlanPage.clearElement(mcdu, fpIndex, offset, forPlan, inAlternate, scratchpadCallback);
                        return;
                    }

                    mcdu.insertWaypoint(value, forPlan, inAlternate, fpIndex, true, (success) => {
                        if (!success) {
                            scratchpadCallback();
                        }
                        CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
                    }, !mcdu.flightPlanService.hasTemporary);
                });
            } else if (holdResumeExit) {
                const isActive = fpIndex === targetPlan.activeLegIndex;
                const isNext = fpIndex === (targetPlan.activeLegIndex + 1);
                let color = "green";
                if (mcdu.flightPlanService.hasTemporary) {
                    color = "yellow";
                } else if (isActive) {
                    color = "white";
                }

                const decelReached = isActive || isNext && mcdu.holdDecelReached;
                const holdSpeed = fpIndex === mcdu.holdIndex && mcdu.holdSpeedTarget > 0 ? mcdu.holdSpeedTarget.toFixed(0) : '---';
                const turnDirection = holdResumeExit.definition.turnDirection;
                // prompt should only be shown once entering decel for hold (3 - 20 NM before hold)
                const immExit = decelReached && !holdResumeExit.additionalData.immExit;
                const resumeHold = decelReached && holdResumeExit.additionalData.immExit;

                scrollWindow[rowI] = {
                    fpIndex,
                    holdResumeExit,
                    color,
                    immExit,
                    resumeHold,
                    holdSpeed,
                    turnDirection,
                };

                addLskAt(rowI, 0, (value, scratchpadCallback) => {
                    if (value === FMCMainDisplay.clrValue) {
                        CDUFlightPlanPage.clearElement(mcdu, fpIndex, offset, forPlan, inAlternate, scratchpadCallback);
                    }

                    CDUHoldAtPage.ShowPage(mcdu, fpIndex);
                    scratchpadCallback();
                });

                addRskAt(rowI, 0, (value, scratchpadCallback) => {
                    // IMM EXIT, only active once reaching decel
                    if (isActive) {
                        mcdu.fmgcMesssagesListener.triggerToAllSubscribers('A32NX_IMM_EXIT', fpIndex, immExit);
                        setTimeout(() => {
                            CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
                        }, 500);
                    } else if (decelReached) {
                        fpm.removeWaypoint(fpIndex, true, () => {
                            CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
                        });
                    }
                    scratchpadCallback();
                });
            }
        }

        // Pass current waypoint data to FMGC
        SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_FP_INDEX", "number", targetPlan.index);

        if (scrollWindow[1]) {
            mcdu.currentFlightPlanWaypointIndex = scrollWindow[1].fpIndex;
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_IN_ALTERNATE", "Bool", scrollWindow[1].inAlternate);
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_INDEX", "number", scrollWindow[1].fpIndex);
        } else if (scrollWindow[0]) {
            mcdu.currentFlightPlanWaypointIndex = scrollWindow[0].fpIndex;
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_IN_ALTERNATE", "Bool", scrollWindow[0].inAlternate);
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_INDEX", "number", scrollWindow[0].fpIndex);
        } else {
            mcdu.currentFlightPlanWaypointIndex = first + offset;
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_IN_ALTERNATE", "Bool", false);
            SimVar.SetSimVarValue("L:A32NX_SELECTED_WAYPOINT_INDEX", "number", first + offset);
        }

        // Render scrolling data to text >> add ditto marks

        let firstWp = scrollWindow.length;
        const scrollText = [];
        for (let rowI = 0; rowI < scrollWindow.length; rowI++) {
            const { marker: cMarker, pwp: cPwp, holdResumeExit: cHold, speedConstraint: cSpd, altitudeConstraint: cAlt } = scrollWindow[rowI];
            let spdRpt = false;
            let altRpt = false;
            let showFix = true;
            let showDist = true;
            let showNm = false;

            if (cHold) {
                const { color, immExit, resumeHold, holdSpeed, turnDirection } = scrollWindow[rowI];
                scrollText[(rowI * 2)] = ['', `{amber}${immExit ? 'IMM\xa0\xa0' : ''}${resumeHold ? 'RESUME\xa0' : ''}{end}`, 'HOLD\xa0\xa0\xa0\xa0\xa0'];
                scrollText[(rowI * 2) + 1] = [`{${color}}HOLD ${turnDirection}{end}`, `{amber}${immExit ? 'EXIT*' : ''}${resumeHold ? 'HOLD*' : ''}{end}`, `{${color}}{small}{white}SPD{end}\xa0${holdSpeed}{end}{end}`];
            } else if (!cMarker && !cPwp) { // Waypoint
                if (rowI > 0) {
                    const { marker: pMarker, pwp: pPwp, holdResumeExit: pHold, speedConstraint: pSpd, altitudeConstraint: pAlt} = scrollWindow[rowI - 1];
                    if (!pMarker && !pPwp && !pHold) {
                        firstWp = Math.min(firstWp, rowI);
                        if (rowI === firstWp) {
                            showNm = true;
                        }
                        if (cSpd !== "---" && cSpd === pSpd) {
                            spdRpt = true;
                        }

                        if (cAlt.alt !== "-----" &&
                            cAlt.alt === pAlt.alt &&
                            cAlt.altPrefix === pAlt.altPrefix) {
                            altRpt = true;
                        }
                    // If previous row is a marker, clear all headers
                    } else if (!pHold) {
                        showDist = false;
                        showFix = false;
                    }
                }

                scrollText[(rowI * 2)] = renderFixHeader(scrollWindow[rowI], showNm, showDist, showFix);
                scrollText[(rowI * 2) + 1] = renderFixContent(scrollWindow[rowI], spdRpt, altRpt);

            // Marker
            } else {
                scrollText[(rowI * 2)] = [];
                scrollText[(rowI * 2) + 1] = cMarker;
            }
        }

        // Destination (R6)

        const destText = [];
        if (mcdu.flightPlanService.hasTemporary) {
            destText[0] = [" ", " "];
            destText[1] = ["{ERASE[color]amber", "INSERT*[color]amber"];

            addLskAt(5, 0, async () => {
                mcdu.eraseTemporaryFlightPlan(() => {
                    CDUFlightPlanPage.ShowPage(mcdu, 0, forPlan);
                });
            });
            addRskAt(5, 0, async () => {
                mcdu.insertTemporaryFlightPlan(() => {
                    CDUFlightPlanPage.ShowPage(mcdu, 0, forPlan);
                });
            });
        } else {
            let destCell = "----";
            if (targetPlan.destinationAirport) {
                destCell = targetPlan.destinationAirport.ident;

                if (targetPlan.destinationRunway) {
                    destCell += targetPlan.destinationRunway.ident.substring(2);
                }
            }
            let destTimeCell = "----";
            let destDistCell = "---";
            let destEFOBCell = "---";

            if (targetPlan.destinationAirport) {
                const destStats = stats.get(targetPlan.legCount - 1);

                if (destStats) {
                    destDistCell = destStats.distanceFromPpos.toFixed(0);
                    destEFOBCell = (NXUnits.kgToUser(mcdu.getDestEFOB(isFlying))).toFixed(1);

                    if (isFlying) {
                        destTimeCell = FMCMainDisplay.secondsToUTC(destStats.etaFromPpos);
                    } else {
                        destTimeCell = FMCMainDisplay.secondsTohhmm(destStats.timeFromPpos);
                    }
                }
            }
            if (!CDUInitPage.fuelPredConditionsMet(mcdu)) {
                destEFOBCell = "---";
            }

            destText[0] = ["\xa0DEST", "DIST EFOB", isFlying ? "\xa0UTC{sp}{sp}{sp}{sp}" : "TIME{sp}{sp}{sp}{sp}"];
            destText[1] = [destCell, `{small}${destDistCell}\xa0${destEFOBCell.padStart(4, '\xa0')}{end}`, `{small}${destTimeCell}{end}{sp}{sp}{sp}{sp}`];

            addLskAt(5, () => mcdu.getDelaySwitchPage(),
                () => {
                    CDULateralRevisionPage.ShowPage(mcdu, targetPlan.destinationLeg, targetPlan.destinationLegIndex, forPlan);
                });

            addRskAt(5, () => mcdu.getDelaySwitchPage(),
                () => {
                    CDUVerticalRevisionPage.ShowPage(mcdu, targetPlan.destinationLeg);
                });
        }

        // scrollText pad to 10 rows
        while (scrollText.length < 10) {
            scrollText.push([""]);
        }
        const allowScroll = waypointsAndMarkers.length > 4;
        if (allowScroll) {
            mcdu.onAirport = () => { // Only called if > 4 waypoints
                const isOnFlightPlanPage = mcdu.page.Current === mcdu.page.FlightPlanPage;
                const destinationAirportOffset = waypointsAndMarkers.length - 5;
                const allowCycleToOriginAirport = mcdu.flightPhaseManager.phase === FmgcFlightPhases.PREFLIGHT;
                if (offset === destinationAirportOffset && allowCycleToOriginAirport && isOnFlightPlanPage) { // only show origin if still on ground
                    // Go back to top of flight plan page to show origin airport.
                    offset = 0;
                } else {
                    offset = destinationAirportOffset; // if in air only dest is available.
                }
                CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
            };
            mcdu.onDown = () => { // on page down decrement the page offset.
                if (offset > 0) { // if page not on top
                    offset--;
                } else { // else go to the bottom
                    offset = waypointsAndMarkers.length - 1;
                }
                CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
            };
            mcdu.onUp = () => {
                if (offset < waypointsAndMarkers.length - 1) { // if page not on bottom
                    offset++;
                } else { // else go on top
                    offset = 0;
                }
                CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
            };
        }
        mcdu.setArrows(allowScroll, allowScroll, true, true);
        scrollText[0][1] = "SPD/ALT\xa0\xa0\xa0";
        scrollText[0][2] = isFlying ? "\xa0UTC{sp}{sp}{sp}{sp}" : "TIME{sp}{sp}{sp}{sp}";
        mcdu.setTemplate([
            [`{left}{small}{sp}${showFrom ? "FROM" : "{sp}{sp}{sp}{sp}"}{end}${headerText}{end}{right}{small}${flightNumberText}{sp}{sp}{sp}{end}{end}`],
            ...scrollText,
            ...destText
        ]);
    }

    static clearElement(mcdu, fpIndex, offset, forPlan, forAlternate, scratchpadCallback) {
        if (fpIndex === Fmgc.FlightPlanIndex.Active && mcdu.flightPlanService.hasTemporary) {
            mcdu.setScratchpadMessage(NXSystemMessages.notAllowed);
            scratchpadCallback();
            return;
        }

        // TODO maybe move this to FMS logic ?
        if (fpIndex === Fmgc.FlightPlanIndex.Active && fpIndex <= mcdu.flightPlanService.activeLegIndex) {
            // 22-72-00:67
            // Stop clearing TO or FROM waypoints when NAV is engaged
            if (mcdu.navModeEngaged()) {
                mcdu.setScratchpadMessage(NXSystemMessages.notAllowedInNav);
                scratchpadCallback();
                return;
            }
        }

        try {
            mcdu.flightPlanService.deleteElementAt(fpIndex, forPlan, forAlternate);
        } catch (e) {
            console.error(e);
            mcdu.setScratchpadMessage(NXFictionalMessages.internalError);
            scratchpadCallback();
        }

        CDUFlightPlanPage.ShowPage(mcdu, offset, forPlan);
    }
}

function renderFixTableHeader(isFlying) {
    return [
        `{sp}\xa0FROM`,
        "SPD/ALT\xa0\xa0\xa0",
        isFlying ? "\xa0UTC{sp}{sp}{sp}{sp}" : "TIME{sp}{sp}{sp}{sp}"
    ];
}

function renderFixHeader(rowObj, showNm = false, showDist = true, showFix = true) {
    const { fixAnnotation, color, distance, bearingTrack, fpa } = rowObj;
    let right = showDist ? `{${color}}${distance}{end}` : '';
    if (fpa) {
        right += `{white}${fpa}°{end}`;
    } else if (showNm) {
        right += `{${color}}NM{end}\xa0\xa0\xa0`;
    } else {
        right += '\xa0\xa0\xa0\xa0\xa0';
    }
    return [
        `${(showFix) ? fixAnnotation.padEnd(7, "\xa0").padStart(8, "\xa0") : ""}`,
        right,
        `{${color}}${bearingTrack}{end}\xa0`,
    ];
}

function renderFixContent(rowObj, spdRepeat = false, altRepeat = false) {
    const {ident, isOverfly, color, spdColor, speedConstraint, altColor, altitudeConstraint, timeCell, timeColor} = rowObj;

    return [
        `${ident}${isOverfly ? FMCMainDisplay.ovfyValue : ""}[color]${color}`,
        `{${spdColor}}${spdRepeat ? "\xa0\"\xa0" : speedConstraint}{end}{${altColor}}/${altRepeat ? "\xa0\xa0\xa0\"\xa0\xa0" : altitudeConstraint.altPrefix + altitudeConstraint.alt}{end}[s-text]`,
        `${timeCell}{sp}{sp}{sp}{sp}[color]${timeColor}`
    ];
}

function emptyFplnPage(forPlan) {
    return [
        ["", "SPD/ALT{sp}{sp}{sp}", "TIME{sp}{sp}{sp}{sp}"],
        [`PPOS[color]${forPlan === 0 ? 'green' : 'white'}`, "---/ -----", "----{sp}{sp}{sp}{sp}"],
        [""],
        ["---F-PLN DISCONTINUITY---"],
        [""],
        ["------END OF F-PLN-------"],
        [""],
        ["-----NO ALTN F-PLN-------"],
        [""],
        [""],
        ["\xa0DEST", "DIST EFOB", "TIME{sp}{sp}{sp}{sp}"],
        ["------", "---- ----", "----{sp}{sp}{sp}{sp}"]
    ];
}

function legTypeIsCourseReversal(wp) {
    switch (wp.additionalData.legType) {
        case 12: // HA
        case 13: // HF
        case 14: // HM
        case 16: // PI
            return true;
        default:
    }
    return false;
}

function legTurnIsForced(wp) {
    // forced turns are only for straight legs
    return (wp.turnDirection === 1 /* Left */ || wp.turnDirection === 2 /* Right */)
        // eslint-disable-next-line semi-spacing
        && wp.additionalData.legType !== 1 /* AF */ && wp.additionalData.legType !== 17 /* RF */;
}

/**
 * @param {FlightPlanLeg} leg
 * @return {boolean}
 */
function legHasAltConstraint(leg) {
    return !!leg.definition.altitudeDescriptor && leg.definition.altitudeDescriptor !== 'G' && leg.definition.altitudeDescriptor !== 'H';
}

function formatAlt(alt) {
    // TODO FLs
    return (Math.round(alt / 10) * 10).toString().padStart(5, '\xa0');
}

function formatLegAltConstraint(leg) {
    // always return the minimum altitude?
    switch (leg.definition.altitudeDescriptor) {
        case '@':
        case '+':
        case '-':
        case 'B':
        case 'I':
        case 'J':
        case 'V':
        case 'X':
        case 'Y':
            return formatAlt(leg.definition.altitude1);
        case 'C':
            return formatAlt(leg.definition.altitude2);
    }
    return '';
}
