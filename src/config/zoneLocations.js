const ZONE_LOCATION_ROWS = [
  ['Zona 1', '759b91895d3e0a4158629a28'],
  ['Zona 1', '828e85a57041a6ee2d6baad1'],
  ['Zona 1', 'bee5290b3c3ae886b270f5b2'],
  ['Zona 1', 'aa1f1fa3cf1f7774ad4fa3a0'],
  ['Zona 1', 'e3f2f84b00187f7a2c632d4f'],
  ['Zona 1', '4520db6032393a92dc8b7fec'],
  ['Zona 1', '055ad5a987349676303f3ad8'],
  ['Zona 1', '60c0addb0255bec380627287'],
  ['Zona 1', '81e9f19f69215009d98c44ea'],
  ['Zona 1', '890b034ee8003c9fe2f79fed'],
  ['Zona 2', '2d5ff35097b305f9eb016d4f'],
  ['Zona 2', 'b132baa3d40c8b34e46b1027'],
  ['Zona 2', '80152a9fbf337b43f3f47023'],
  ['Zona 3', '1a37560645ac94f680991cec'],
  ['Zona 3', '94d6887249b7ff12eb5d1b82'],
  ['Zona 3', '8d49280c8e09bf534c6d2077'],
  ['Zona 3', '9a981fad88d891a126cc57aa'],
  ['Zona 3', '52bfa152c0baa332aacf1771'],
  ['Zona 3', '42acf50d969c653037e9e360'],
  ['Zona 3', '06a732651aaa88aa1f1c0cf2'],
  ['Zona 3', '10e4f71507dc95e8b5753c83'],
];

function buildZoneValuesSql() {
  return ZONE_LOCATION_ROWS
    .map(([zoneName, locationId]) => `('${zoneName}', '${locationId}')`)
    .join(',\n    ');
}

module.exports = {
  ZONE_LOCATION_ROWS,
  buildZoneValuesSql,
};
