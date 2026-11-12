import {getCountries,getCountryCallingCode,parsePhoneNumberFromString} from 'libphonenumber-js/min';
const countries=getCountries(),countrySet=new Set(countries);
export function countryForDial(value,current='BR'){
 const dial=String(value||'').replace(/\D/g,'');if(!dial)return null;
 if(countrySet.has(current)&&getCountryCallingCode(current)===dial)return current;
 const common={'1':'US','7':'RU','44':'GB'};return common[dial]||countries.find(c=>getCountryCallingCode(c)===dial)||null;
}
// Local suggestion only: no GPS permission or external location lookup.
export function suggestCountry(timezone='',languages=[]){
 if(/^America\/(Rio_Branco|Sao_Paulo|Manaus|Belem|Fortaleza|Recife|Maceio|Bahia|Sao_Luis|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Santarem|Noronha|Araguaina)$/.test(timezone))return 'BR';
 const zones={'America/La_Paz':'BO','Europe/Lisbon':'PT','Atlantic/Azores':'PT','Atlantic/Madeira':'PT','America/Argentina/Buenos_Aires':'AR','America/Asuncion':'PY','America/Lima':'PE','America/Santiago':'CL','America/Mexico_City':'MX','America/Bogota':'CO','Europe/London':'GB','Europe/Madrid':'ES','America/New_York':'US','America/Chicago':'US','America/Denver':'US','America/Los_Angeles':'US'};
 if(zones[timezone])return zones[timezone];
 for(const language of languages){try{const region=new Intl.Locale(language).region;if(countrySet.has(region))return region;}catch{}}
 return 'BR';
}
export function initialPhone(value='',fallback='BR'){
 const parsed=parsePhoneNumberFromString('+'+String(value).replace(/\D/g,'')),country=parsed?.country||countryForDial(parsed?.countryCallingCode,fallback)||fallback;
 return {country,dial:parsed?.countryCallingCode||getCountryCallingCode(country),national:parsed?.nationalNumber||''};
}
export function normalizePhone(national,dial,country='BR'){
 const digits=String(national||'').replace(/\D/g,'');if(!digits||!countryForDial(dial,country))return '';
 const parsed=parsePhoneNumberFromString(String(national).trim().startsWith('+')?String(national):'+'+dial+digits);
 return parsed?.number.replace(/^\+/,'')||dial+digits;
}
