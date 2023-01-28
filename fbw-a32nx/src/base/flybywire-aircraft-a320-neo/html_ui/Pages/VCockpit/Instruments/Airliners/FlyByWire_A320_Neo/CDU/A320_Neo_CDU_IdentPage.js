const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function findNewMonthIndex(index) {
    if (index === 0) {
        return 11;
    } else {
        return index - 1;
    }
}

function lessThan10(num) {
    if (num < 10) {
        return `0${num}`;
    } else {
        return num;
    }
}

function calculateActiveDate(date) {
    if (date.length === 13) {
        const startMonth = date.slice(0, 3);
        const startDay = date.slice(3, 5);

        const endMonth = date.slice(5, 8);
        const endDay = date.slice(8, 10);

        return `${startDay}${startMonth}-${endDay}${endMonth}`;
    } else {
        return date;
    }
}

function calculateSecDate(date) {
    if (date.length === 13) {
        const primStartMonth = date.slice(0, 3);
        const primStartDay = date.slice(3, 5);

        const primStartMonthIndex = months.findIndex((item) => item === primStartMonth);

        if (primStartMonthIndex === -1) {
            return "ERR";
        }

        let newEndMonth = primStartMonth;
        let newEndDay = primStartDay - 1;

        let newStartDay = newEndDay - 27;
        let newStartMonth = primStartMonth;

        if (newEndDay === 0) {
            newEndMonth = months[findNewMonthIndex(primStartMonthIndex)];
            newEndDay = monthLength[findNewMonthIndex(primStartMonthIndex)];
        }

        if (newStartDay <= 0) {
            newStartMonth = months[findNewMonthIndex(primStartMonthIndex)];
            newStartDay = monthLength[findNewMonthIndex(primStartMonthIndex)] + newStartDay;
        }

        return `${lessThan10(newStartDay)}${newStartMonth}-${lessThan10(newEndDay)}${newEndMonth}`;
    } else {
        return "ERR";
    }

}

/**
 *
 * @param {DatabaseIdent} dbIdent
 */
function formatPartNumber(dbIdent) {
    return dbIdent.provider.toUpperCase();
}

function formatEffectiveDates(dbIdent) {
    const [fromYear, fromMonth, fromDay] = dbIdent.effectiveFrom.split('-').map((v) => parseInt(v));
    const [toYear, toMonth, toDay] = dbIdent.effectiveTo.split('-').map((v) => parseInt(v));

    return `${fromDay.toFixed(0).padStart(2, '0')}${months[fromMonth - 1]}-${toDay.toFixed(0).padStart(2, '0')}${months[toMonth - 1]}`;
}

class CDUIdentPage {
    static ShowPage(mcdu, confirmDeleteAll = false) {
        mcdu.navigationDatabase.backendDatabase.getDatabaseIdent().then((activeDb) => {
            const stored = mcdu.dataManager.numberOfStoredElements();
            const storedRows = Array(4).fill('');
            if (stored.total > 0) {
                storedRows[0] = "STORED\xa0\xa0\xa0\xa0";
                storedRows[1] = `{green}${stored.routes.toFixed(0).padStart(2, '0')}{end}{small}RTES{end}\xa0{green}${stored.runways.toFixed(0).padStart(2, '0')}{end}{small}RWYS{end}`;
                storedRows[2] = `{green}{big}${stored.waypoints.toFixed(0).padStart(2, '0')}{end}{end}{small}WPTS{end}\xa0{green}{big}${stored.navaids.toFixed(0).padStart(2, '0')}{end}{end}{small}NAVS{end}`;
                storedRows[3] = confirmDeleteAll ? '{amber}CONFIRM DEL*{end}' : '{cyan}DELETE ALL}{end}';
            } else if (confirmDeleteAll) {
                confirmDeleteAll = false;
            }

            mcdu.clearDisplay();
            mcdu.page.Current = mcdu.page.IdentPage;
            mcdu.activeSystem = 'FMGC';

            mcdu.setTemplate([
                ["A320-200"],
                ["\xa0ENG"],
                ["LEAP-1A26[color]green"],
                ["\xa0ACTIVE NAV DATA BASE"],
                [`\xa0{cyan}${formatEffectiveDates(activeDb)}{end}`, `{green}${formatPartNumber(activeDb)}{end}`],
                ["\xa0SECOND NAV DATA BASE"],
                ["{small}{SWAP DB BACKEND{end}[color]cyan"],
                ["", storedRows[0]],
                ["", storedRows[1]],
                ["CHG CODE", storedRows[2]],
                ["{small}[  ]{end}[color]inop", storedRows[3]],
                ["IDLE/PERF", "SOFTWARE"],
                ["+0.0/+0.0[color]green", "STATUS/XLOAD>[color]inop"]
            ]);

            // TODO get rid of this before merging to master!!
            mcdu.onLeftInput[2] = () => {
                if (parseInt(NXDataStore.get('FBW_NAVDB_BACKEND', Fmgc.NavigationDatabaseBackend.Msfs)) === Fmgc.NavigationDatabaseBackend.Msfs) {
                    NXDataStore.set('FBW_NAVDB_BACKEND', Fmgc.NavigationDatabaseBackend.Navigraph.toString());
                } else {
                    NXDataStore.set('FBW_NAVDB_BACKEND', Fmgc.NavigationDatabaseBackend.Msfs.toString());
                }
                mcdu.flightPlanService.reset();
                mcdu.initVariables();
                // takes a short time for the DB to change
                setTimeout(() => CDUIdentPage.ShowPage(mcdu), 1000);
            };

            // DELETE ALL
            mcdu.onRightInput[4] = () => {
                if (confirmDeleteAll) {
                    const allDeleted = mcdu.dataManager.deleteAllStoredWaypoints();
                    if (!allDeleted) {
                        mcdu.addNewMessage(NXSystemMessages.fplnElementRetained);
                    }
                    CDUIdentPage.ShowPage(mcdu);
                } else {
                    CDUIdentPage.ShowPage(mcdu, true);
                }
            };
        }).catch(() => {
            if (parseInt(NXDataStore.get('FBW_NAVDB_BACKEND', Fmgc.NavigationDatabaseBackend.Msfs)) === Fmgc.NavigationDatabaseBackend.Msfs) {
                NXDataStore.set('FBW_NAVDB_BACKEND', Fmgc.NavigationDatabaseBackend.Navigraph.toString());
            } else {
                NXDataStore.set('FBW_NAVDB_BACKEND', Fmgc.NavigationDatabaseBackend.Msfs.toString());
            }
            mcdu.flightPlanService.reset();
            mcdu.initVariables();
            // takes a short time for the DB to change
            setTimeout(() => CDUIdentPage.ShowPage(mcdu), 1000);
        });
    }
}
