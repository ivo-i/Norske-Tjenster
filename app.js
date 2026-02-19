'use strict';

const Homey = require('homey');
const { Log } = require('homey-log');

class App extends Homey.App {

    async onInit() {
        this.homeyLog = new Log({ homey: this.homey });
        this.userLanguage = this.homey.i18n.getLanguage();

        await this.initFlows();

        this.homey.settings.unset('debugLog');

        this.dDebug('Norweigan Public Services has been initialized');

        if (Homey.env.DEBUG === true) {
        }
    }

    async testConnection() {
        return true;
    }

    async initFlows() {
        this.dDebug('Initializing flows...');

        this.wastePickupTomorrow = this.homey.flow.getDeviceTriggerCard('wastePickupTomorrow');

        // isWaste_v2 condition card for renovation driver
        const isWaste_v2 = this.homey.flow.getConditionCard('isWaste_v2');
        isWaste_v2.registerRunListener(async (args, state) => {
            const fractions = args.device.fractionDates;
            if (!fractions) {
                return false;
            }
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const targetDays = args.when === "wasteToday" ? 0 : 1;
            
            for (const [, fractionDate] of Object.entries(fractions)) {
                if (!fractionDate) {
                    continue;
                }
                const diffDays = Math.floor((fractionDate - today) / (1000 * 60 * 60 * 24));
                if (diffDays === targetDays) {
                    return true;
                }
            }
            return false;
        });

        const isPost = this.homey.flow.getConditionCard('isPost');
        isPost.registerRunListener(async (args, state) => {
            const postDaysLeft = await args.device.getCapabilityValue('meter_posten_sensor');
            if (args.when === "postToday") {
                if (postDaysLeft === 0) {
                    return true;
                }
            } else if (args.when === "postTomorrow") {
                if (postDaysLeft === 1) {
                    return true;
                }
            }
            return false;
        });

        const isFlagday = this.homey.flow.getConditionCard('isFlagday');
        isFlagday.registerRunListener(async (args, state) => {
            const flagDayCount = await args.device.getCapabilityValue('meter_flagg_sensor');
            const flagDays = await args.device.getFlagDays();
            const nextFlagDay = await args.device.getNextFlagDayInfo(flagDays);
            const dayType = nextFlagDay.details;

            if (dayType !== "flaggdag") {
                return false;
            }
            if (args.when === "today") {
                if (flagDayCount === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (flagDayCount === 1) {
                    return true;
                }
            } else if (args.when === "in2days") {
                if (flagDayCount === 2) {
                    return true;
                }
            }
            return false;
        });

        const isFlagdayWhen = this.homey.flow.getConditionCard('isFlagdayWhen');
        isFlagdayWhen.registerRunListener(async (args, state) => {
            const flagDay = this.homey.flow.getToken(`flagg_${args.droptoken}`);
            const diffDays = new Date(flagDay.__value).getDate() - new Date().getDate();
            if (args.when === "today") {
                if (diffDays === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (diffDays === 1) {
                    return true;
                }
            } else if (args.when === "in2days") {
                if (diffDays === 2) {
                    return true;
                }
            }
            return false;
        });

        const isMarkedDay = this.homey.flow.getConditionCard('isMarkedDay');
        isMarkedDay.registerRunListener(async (args, state) => {
            const flagDayCount = await args.device.getCapabilityValue('meter_flagg_sensor');
            const flagDays = await args.device.getFlagDays();
            const nextFlagDay = await args.device.getNextFlagDayInfo(flagDays);
            const dayType = nextFlagDay.type;

            //this.dDebug('Flagday: ' + dayType + ' - ' + flagDayCount);

            if (dayType !== "Merkedag") {
                return false;
            }
            if (args.when === "today") {
                if (flagDayCount === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (flagDayCount === 1) {
                    return true;
                }
            } else if (args.when === "in2days") {
                if (flagDayCount === 2) {
                    return true;
                }
            }
            return false;
        });

        // isSpecificWaste condition card for renovation driver
        const isSpecificWaste = this.homey.flow.getConditionCard('isSpecificWaste');
        isSpecificWaste.registerRunListener(async (args, state) => {
            const fractions = args.device.fractionDates;
            if (!fractions) {
                return false;
            }
            
            // Map args.type to fraction key (bio -> food for compatibility)
            const typeMap = {
                'general': 'general',
                'paper': 'paper',
                'plastic': 'plastic',
                'bio': 'food',
                'glass': 'glass',
                'garden': 'garden'
            };
            
            const fractionKey = typeMap[args.type] || args.type;
            const fractionDate = fractions[fractionKey];
            
            if (!fractionDate) {
                return false;
            }
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((fractionDate - today) / (1000 * 60 * 60 * 24));
            
            const targetDays = args.when === "today" ? 0 : 1;
            return diffDays === targetDays;
        });
    }

    async formatWastePickupText(wasteType) {
        wasteType = wasteType !== undefined ? wasteType.toLowerCase() : 'waste';

        switch (wasteType) {
            case 'general':
                wasteType = this.homey.__({ en: 'General waste', no: 'Restavfall' });
                break;
            case 'paper':
                wasteType = this.homey.__({ en: 'Paper', no: 'Papir' });
                break;
            case 'plastic':
                wasteType = this.homey.__({ en: 'Plastic packaging', no: 'Plastemballasje' });
                break;
            case 'glass':
                wasteType = this.homey.__({ en: 'Glass and metal', no: 'Glass og metall' });
                break;
            case 'bio':
                wasteType = this.homey.__({ en: 'Food waste', no: 'Matavfall' });
                break;
            case 'garden':
                wasteType = this.homey.__({ en: 'Garden waste', no: 'Hageavfall' });
                break;
            case 'christmastree':
                wasteType = this.homey.__({ en: 'Christmas tree', no: 'Juletre' });
                break;
            case 'other':
                wasteType = this.homey.__({ en: 'Other waste', no: 'Annet avfall' });
                break;
            default:
                wasteType = this.homey.__({ en: 'Waste', no: 'Avfall' });
        }

        return `${wasteType}`;
    }

    async getMatchingWasteTypes(nextWastePickups, diffDays) {
        // Konverter diffDays til en array hvis det ikke allerede er en
        if (!Array.isArray(diffDays)) {
            diffDays = [diffDays];
        }

        // Filtrer ut avfallstyper som matcher noen av verdiene i diffDays
        const matchingWasteTypes = nextWastePickups
            .filter(pickup => diffDays.includes(pickup.diffDays))
            .map(pickup => pickup.wasteType);

        // Sjekk om det finnes noen matchende avfallstyper
        if (matchingWasteTypes.length === 0) {
            return false;
        }

        // Hent formaterte tekststrenger for hver avfallstype
        const formattedWasteTypes = await Promise.all(
            matchingWasteTypes.map(wasteType => this.formatWastePickupText(wasteType))
        );

        // Fjerner ordet "avfall" fra alle unntatt den siste
        for (let i = 0; i < formattedWasteTypes.length - 1; i++) {
            formattedWasteTypes[i] = formattedWasteTypes[i].replace('avfall', '');
        }

        // Setter sammen tekststrengen
        let wasteTypesString;
        if (formattedWasteTypes.length === 1) {
            wasteTypesString = formattedWasteTypes[0];
        } else if (formattedWasteTypes.length === 2) {
            formattedWasteTypes[1] = formattedWasteTypes[1].toLowerCase();
            wasteTypesString = formattedWasteTypes.join(' og ');
        } else if (formattedWasteTypes.length > 2) {
            const lastWasteType = formattedWasteTypes.pop();
            wasteTypesString = formattedWasteTypes.join(', ') + ' og ' + lastWasteType.toLowerCase();
        }

        return wasteTypesString;
    }

    async onUninit() {
        this.dDebug('Norweigan Public Services has been unitialized');
    }

    async logIt(args) {
        if (Homey.env.DEBUG === true) {
            this.log(args);
        }
    }

    async dLog(severity, message, driver, data) {
        const severityColor = (severity) => {
            switch (severity) {
                case 'DEBUG':
                    return "\x1b[35mDEBUG\x1b[0m";
                case 'INFO':
                    return "\x1b[34mINFO\x1b[0m";
                case 'WARNING':
                    return "\x1b[33mWARNING\x1b[0m";
                case 'ERROR':
                    return "\x1b[31mERROR\x1b[0m";
                default:
                    return "\x1b[35mDEBUG\x1b[0m";
            }
        };

        if (!this.homey) {
            this.log(`${severityColor(severity)} [${driver}]: ${message}`, data || '');
            return;
        }

        if (this.homey) {
            const now = new Date();

            let datestring = now.toLocaleDateString(this.userLanguage, {
                dateStyle: 'short',
                timeZone: 'Europe/Oslo'
            });
            let timestring = now.toLocaleTimeString(this.userLanguage, {
                timeStyle: 'medium',
                timeZone: 'Europe/Oslo'
            });

            let debugDateString = `${datestring} ${timestring}`;
            datestring = `${datestring} - ${timestring}`;

            const debugLog = this.homey.settings.get('debugLog') || [];
            const entry = { registered: debugDateString, severity, driver, message };
            if (data) {
                if (typeof data === 'string') {
                    entry.data = { data };
                } else if (data.message) {
                    entry.data = { error: data.message, stacktrace: data.stack };
                } else {
                    entry.data = data;
                }
            }

            debugLog.push(entry);
            if (debugLog.length > 100) {
                debugLog.splice(0, 1);
            }

            this.homey.log(`${severityColor(severity)} [${driver}]: ${message}`, data || '');
            this.homey.settings.set('debugLog', debugLog);
            this.homey.api.realtime('debugLog', entry);
        }
    }

    async dInfo(message, driver = 'App', data) {
        await this.dLog('INFO', message, driver, data);
    }

    async dDebug(message, driver = 'App', data) {
        await this.dLog('DEBUG', message, driver, data);
    }

    async dWarn(message, driver = 'App', data) {
        await this.dLog('WARNING', message, driver, data);
    }

    async dError(message, driver = 'App', data) {
        await this.dLog('ERROR', message, driver, data);
    }
}

module.exports = App;