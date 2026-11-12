import type {CountryCode} from 'libphonenumber-js/min';
export function countryForDial(value:string|undefined,current?:CountryCode):CountryCode|null;
export function suggestCountry(timezone?:string,languages?:readonly string[]):CountryCode;
export function initialPhone(value?:string,fallback?:CountryCode):{country:CountryCode;dial:string;national:string};
export function normalizePhone(national:string,dial:string,country?:CountryCode):string;
