import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(`${process.env.TEMP}/india-districts.json`, 'utf8'));

const INDIA_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

function cleanName(s) {
  return String(s).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function normalizeDistrict(name) {
  const n = cleanName(name);
  const aliases = {
    'Bengaluru (Bangalore) Urban': ['Bengaluru', 'Bangalore'],
    'Bengaluru (Bangalore) Rural': ['Bengaluru Rural'],
    'Mysuru (Mysore)': ['Mysuru', 'Mysore'],
    Gurgaon: ['Gurugram', 'Gurgaon'],
    Allahabad: ['Prayagraj', 'Allahabad'],
    Faizabad: ['Ayodhya', 'Faizabad'],
    Pondicherry: ['Puducherry', 'Pondicherry'],
    'Thoothukudi (Tuticorin)': ['Thoothukudi', 'Tuticorin'],
    'Sahibzada Ajit Singh Nagar (Mohali)': ['Mohali', 'SAS Nagar'],
    'Kamrup Metropolitan': ['Guwahati', 'Kamrup Metropolitan'],
    'Gautam Buddha Nagar': ['Noida', 'Gautam Buddha Nagar'],
    'Mumbai City': ['Mumbai'],
    'Mumbai Suburban': ['Mumbai Suburban', 'Mumbai'],
  };
  if (aliases[n]) return aliases[n];
  const m = n.match(/^(.+?)\s*\((.+)\)$/);
  if (m) {
    const primary = m[1].trim();
    const alt = m[2].trim();
    if (alt.length < 40 && !alt.includes(',')) return [primary, alt];
    return [primary];
  }
  return [n];
}

const stateMap = {
  'Andhra Pradesh': 'Andhra Pradesh',
  'Arunachal Pradesh': 'Arunachal Pradesh',
  Assam: 'Assam',
  Bihar: 'Bihar',
  'Chandigarh (UT)': 'Chandigarh',
  Chhattisgarh: 'Chhattisgarh',
  'Dadra and Nagar Haveli (UT)': 'Dadra and Nagar Haveli and Daman and Diu',
  'Daman and Diu (UT)': 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi (NCT)': 'Delhi',
  Goa: 'Goa',
  Gujarat: 'Gujarat',
  Haryana: 'Haryana',
  'Himachal Pradesh': 'Himachal Pradesh',
  'Jammu and Kashmir': 'Jammu and Kashmir',
  Jharkhand: 'Jharkhand',
  Karnataka: 'Karnataka',
  Kerala: 'Kerala',
  'Lakshadweep (UT)': 'Lakshadweep',
  'Madhya Pradesh': 'Madhya Pradesh',
  Maharashtra: 'Maharashtra',
  Manipur: 'Manipur',
  Meghalaya: 'Meghalaya',
  Mizoram: 'Mizoram',
  Nagaland: 'Nagaland',
  Odisha: 'Odisha',
  'Puducherry (UT)': 'Puducherry',
  Punjab: 'Punjab',
  Rajasthan: 'Rajasthan',
  Sikkim: 'Sikkim',
  'Tamil Nadu': 'Tamil Nadu',
  Telangana: 'Telangana',
  Tripura: 'Tripura',
  Uttarakhand: 'Uttarakhand',
  'Uttar Pradesh': 'Uttar Pradesh',
  'West Bengal': 'West Bengal',
};

const byState = Object.fromEntries(INDIA_STATES.map((s) => [s, new Set()]));

[
  'Port Blair',
  'Diglipur',
  'Mayabunder',
  'Car Nicobar',
  'Campbell Bay',
].forEach((c) => byState['Andaman and Nicobar Islands'].add(c));
['Leh', 'Kargil', 'Nubra', 'Zanskar'].forEach((c) => byState.Ladakh.add(c));

for (const entry of raw.states) {
  const mapped = stateMap[entry.state];
  if (!mapped || !byState[mapped]) {
    console.warn('Unmapped state', entry.state);
    continue;
  }
  for (const d of entry.districts) {
    for (const name of normalizeDistrict(d)) {
      if (name) byState[mapped].add(name);
    }
  }
}

const tnExtras = [
  'Chengalpattu',
  'Kallakurichi',
  'Mayiladuthurai',
  'Ranipet',
  'Tenkasi',
  'Tirupathur',
  'Nagercoil',
  'Udhagamandalam',
  'Ooty',
  'Hosur',
  'Tiruchirappalli',
  'Trichy',
  'Kumbakonam',
  'Karaikudi',
  'Pollachi',
  'Rajapalayam',
  'Ambur',
  'Gudiyatham',
  'Vaniyambadi',
  'Tindivanam',
  'Villupuram',
  'Attur',
  'Mettupalayam',
  'Udumalaipettai',
  'Palani',
  'Bodinayakanur',
  'Sivakasi',
  'Aruppukkottai',
  'Paramakudi',
  'Rameswaram',
  'Mannargudi',
  'Pattukkottai',
  'Chidambaram',
  'Panruti',
  'Neyveli',
  'Tiruttani',
  'Avadi',
  'Tambaram',
  'Pallavaram',
  'Chromepet',
  'Poonamallee',
  'Sriperumbudur',
  'Mahabalipuram',
  'Arni',
  'Gingee',
  'Tanjore',
  'Velankanni',
  'Sirkazhi',
  'Tiruchengode',
  'Komarapalayam',
  'Sankagiri',
  'Yercaud',
  'Kodaikanal',
  'Coonoor',
  'Kotagiri',
];
tnExtras.forEach((c) => byState['Tamil Nadu'].add(c));

const extras = {
  Kerala: ['Kochi', 'Cochin', 'Trivandrum'],
  Karnataka: ['Mangaluru', 'Mangalore', 'Hubballi', 'Hubli', 'Belagavi', 'Belgaum'],
  Telangana: ['Secunderabad', 'Cyberabad'],
  Gujarat: ['Vadodara', 'Baroda'],
  'West Bengal': ['Siliguri', 'Durgapur', 'Asansol', 'Kharagpur'],
  Goa: ['Panaji', 'Panjim', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'],
  Haryana: ['Gurugram'],
  Punjab: ['Mohali'],
  Maharashtra: ['Navi Mumbai', 'Pimpri-Chinchwad', 'Kalyan', 'Vasai-Virar'],
  'Uttar Pradesh': ['Noida', 'Greater Noida', 'Prayagraj'],
};
for (const [st, cities] of Object.entries(extras)) {
  cities.forEach((c) => byState[st].add(c));
}

function sortCities(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b, 'en'));
}

let out =
  '/** All Indian states/UTs with district + major city options for registration pickers. */\n';
out += 'export const INDIA_STATES: string[] = [\n';
for (const s of INDIA_STATES) out += `  ${JSON.stringify(s)},\n`;
out += '];\n\n';
out += 'export const INDIA_CITIES_BY_STATE: Record<string, string[]> = {\n';
for (const s of INDIA_STATES) {
  const cities = sortCities(byState[s]);
  out += `  ${JSON.stringify(s)}: [\n`;
  for (const c of cities) out += `    ${JSON.stringify(c)},\n`;
  out += '  ],\n';
}
out += '};\n\n';
out += 'export function citiesForState(state: string): string[] {\n';
out += '  return INDIA_CITIES_BY_STATE[state] ?? [];\n';
out += '}\n';

fs.writeFileSync(new URL('../src/data/indiaLocations.ts', import.meta.url), out);
console.log('states', INDIA_STATES.length);
console.log('TN cities', byState['Tamil Nadu'].size);
console.log(
  'total cities',
  Object.values(byState).reduce((n, s) => n + s.size, 0),
);
