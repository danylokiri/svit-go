/**
 * Geo lookup tables used by the world-map hero.
 *
 * - `cityCoords`     : catalog city name → [longitude, latitude]
 * - `catalogToTopo`  : catalog country name → name used by world-atlas TopoJSON
 *                      (covers cases like "USA" → "United States of America")
 *
 * If a city exists in the catalog but is missing here, the map endpoint
 * simply omits it (we don't have coords to place the pin). Log on the
 * server tells us which to add later.
 */

export const cityCoords: Record<string, [number, number]> = {
  // Europe
  "London":      [-0.1276, 51.5074],
  "Paris":       [ 2.3522, 48.8566],
  "Provence":    [ 5.3700, 43.9000],
  "Nice":        [ 7.2620, 43.7102],
  "Rome":        [12.4964, 41.9028],
  "Florence":    [11.2558, 43.7696],
  "Venice":      [12.3155, 45.4408],
  "Positano":    [14.4844, 40.6280],
  "Dolomites":   [11.7167, 46.4102],
  "Como":        [ 9.0852, 45.8081],
  "Sicily":      [14.0154, 37.5999],
  "Palermo":     [13.3614, 38.1157],
  "Cinque Terre":[ 9.7282, 44.1281],
  "Madrid":      [-3.7038, 40.4168],
  "Barcelona":   [ 2.1734, 41.3851],
  "Mallorca":    [ 2.9000, 39.6953],
  "Ibiza":       [ 1.4821, 38.9067],
  "Seville":     [-5.9845, 37.3891],
  "Granada":     [-3.5986, 37.1773],
  "Valencia":    [-0.3763, 39.4699],
  "Lisbon":      [-9.1393, 38.7223],
  "Porto":       [-8.6291, 41.1579],
  "Madeira":     [-16.9241,32.7607],
  "Algarve":     [-8.0793, 37.0194],
  "Athens":      [23.7275, 37.9838],
  "Santorini":   [25.4615, 36.3932],
  "Mykonos":     [25.3289, 37.4467],
  "Rhodes":      [28.2225, 36.4341],
  "Crete":       [25.0136, 35.2401],
  "Corfu":       [19.9217, 39.6243],
  "Amsterdam":   [ 4.9041, 52.3676],
  "Berlin":      [13.4050, 52.5200],
  "Munich":      [11.5820, 48.1351],
  "Hamburg":     [10.0099, 53.5511],
  "Vienna":      [16.3738, 48.2082],
  "Salzburg":    [13.0550, 47.8095],
  "Prague":      [14.4378, 50.0755],
  "Budapest":    [19.0402, 47.4979],
  "Edinburgh":   [-3.1883, 55.9533],
  "Bath":        [-2.3590, 51.3814],
  "Dublin":      [-6.2603, 53.3498],
  "Stockholm":   [18.0686, 59.3293],
  "Copenhagen":  [12.5683, 55.6761],
  "Oslo":        [10.7522, 59.9139],
  "Helsinki":    [24.9384, 60.1699],
  "Reykjavik":   [-21.9426,64.1466],
  "Iceland":     [-21.9426,64.1466],
  "Antalya":     [30.7133, 36.8969],
  "Istanbul":    [28.9784, 41.0082],
  "Bodrum":      [27.4305, 37.0344],
  "Cappadocia":  [34.8000, 38.6431],
  "Tbilisi":     [44.7833, 41.7151],
  "Bakuriani":   [43.5328, 41.7497],

  // Africa
  "Marrakech":   [-7.9811, 31.6295],
  "Fez":         [-5.0078, 34.0181],
  "Casablanca":  [-7.5898, 33.5731],
  "Cairo":       [31.2357, 30.0444],
  "Luxor":       [32.6396, 25.6872],
  "Hurghada":    [33.8116, 27.2579],
  "Nairobi":     [36.8219, -1.2921],
  "Masai Mara":  [35.1500, -1.4061],
  "Serengeti":   [34.8333, -2.3333],
  "Zanzibar":    [39.2083, -6.1659],
  "Arusha":      [36.6830, -3.3869],
  "Cape Town":   [18.4241, -33.9249],
  "Kruger":      [31.6500, -23.9888],
  "Okavango":    [22.7000, -19.5500],
  "Mahé":        [55.4920, -4.6796],
  "Mahe":        [55.4920, -4.6796],
  "Antananarivo":[47.5079, -18.8792],

  // Middle East
  "Dubai":       [55.2708, 25.2048],
  "Abu Dhabi":   [54.3773, 24.4539],
  "Amman":       [35.9106, 31.9454],
  "Petra":       [35.4444, 30.3285],
  "Wadi Rum":    [35.4781, 29.5762],
  "Jerusalem":   [35.2137, 31.7683],
  "Tel Aviv":    [34.7818, 32.0853],
  "Muscat":      [58.4059, 23.5880],
  "Doha":        [51.5310, 25.2854],

  // Asia
  "Mumbai":      [72.8777, 19.0760],
  "Delhi":       [77.1025, 28.7041],
  "Jaipur":      [75.7873, 26.9124],
  "Kerala":      [76.2711,  9.9312],
  "Goa":         [73.8278, 15.2993],
  "Bangkok":     [100.5018,13.7563],
  "Phuket":      [98.3923,  7.8804],
  "Chiang Mai":  [98.9853, 18.7883],
  "Krabi":       [98.9189,  8.0863],
  "Singapore":   [103.8198, 1.3521],
  "Kuala Lumpur":[101.6869, 3.1390],
  "Hanoi":       [105.8342,21.0285],
  "Ho Chi Minh City":[106.6297,10.8231],
  "Halong":      [107.0431,20.9101],
  "Tokyo":       [139.6503,35.6762],
  "Kyoto":       [135.7681,35.0116],
  "Osaka":       [135.5023,34.6937],
  "Hokkaido":    [142.8635,43.2203],
  "Seoul":       [126.9780,37.5665],
  "Beijing":     [116.4074,39.9042],
  "Shanghai":    [121.4737,31.2304],
  "Hong Kong":   [114.1694,22.3193],
  "Bali":        [115.2167, -8.6500],
  "Denpasar":    [115.2167, -8.6500],
  "Komodo":      [119.4886, -8.5589],
  "Jakarta":     [106.8456, -6.2088],
  "Kandy":       [80.6337,  7.2906],
  "Colombo":     [79.8612,  6.9271],
  "Male":        [73.5093,  4.1755],
  "Male Atoll":  [73.5093,  4.1755],
  "Maldives":    [73.5093,  4.1755],
  "Manila":      [120.9842,14.5995],
  "Palawan":     [118.7384,  9.8349],
  "Boracay":     [121.9215,11.9674],

  // Americas
  "New York":         [-74.006,  40.7128],
  "Los Angeles":      [-118.2437,34.0522],
  "Miami":            [-80.1918, 25.7617],
  "Chicago":          [-87.6298, 41.8781],
  "San Francisco":    [-122.4194,37.7749],
  "Las Vegas":        [-115.1398,36.1699],
  "Mexico City":      [-99.1332, 19.4326],
  "Cancun":           [-86.8515, 21.1619],
  "Tulum":            [-87.4654, 20.2114],
  "Toronto":          [-79.3832, 43.6532],
  "Vancouver":        [-123.1207,49.2827],
  "Havana":           [-82.3666, 23.1136],
  "San Jose":         [-84.0907,  9.9281],   // Costa Rica
  "Buenos Aires":     [-58.3816,-34.6037],
  "Patagonia":        [-72.7800,-49.3300],
  "Rio de Janeiro":   [-43.1729,-22.9068],
  "Salvador":         [-38.5014,-12.9714],
  "Lima":             [-77.0428,-12.0464],
  "Cuzco":            [-71.9675,-13.5320],
  "Machu Picchu":     [-72.5450,-13.1631],
  "Galapagos":        [-90.4300, -0.7400],
  "Quito":            [-78.4678, -0.1807],
  "Bogota":           [-74.0721,  4.7110],
  "Cartagena":        [-75.4794, 10.3910],
  "Santiago":         [-70.6483,-33.4489],

  // Extra catalog cities — added from "missing coords" warnings
  "Aix-en-Provence": [5.4474, 43.5297],
  "Alberobello":  [17.2356, 40.7837],
  "Baa Atoll":    [73.0000,  5.2000],
  "Banff":        [-115.5708, 51.1784],
  "Bled":         [14.1138, 46.3683],
  "Chania":       [24.0157, 35.5138],
  "Cusco":        [-71.9675, -13.5320],
  "Dubrovnik":    [18.0944, 42.6507],
  "El Nido":      [119.4063, 11.1949],
  "Funchal":      [-16.9241, 32.6669],
  "Göreme":       [34.8278, 38.6431],
  "Hoi An":       [108.3380, 15.8801],
  "Inverness":    [-4.2241, 57.4778],
  "Jackson":      [-110.7624, 43.4799],   // Jackson Hole, WY
  "Kigali":       [30.0619, -1.9441],
  "Kochi":        [76.2711,  9.9312],
  "Krakow":       [19.9450, 50.0647],
  "Labuan Bajo":  [119.8856, -8.4914],
  "Luang Prabang":[102.1349, 19.8845],
  "Maun":         [23.4239, -19.9833],
  "Nadi":         [177.4413, -17.7765],
  "Naha":         [127.6809, 26.2124],
  "New Orleans":  [-90.0715, 29.9511],
  "Niseko":       [140.6873, 42.8049],
  "Palma":        [2.6502, 39.5696],         // Mallorca
  "Paro":         [89.4126, 27.4287],
  "Pokhara":      [83.9856, 28.2096],
  "Port Louis":   [57.5012, -20.1609],       // Mauritius
  "Reine":        [13.0888, 67.9325],        // Norway / Lofoten
  "San José":     [-84.0907,  9.9281],       // Costa Rica
  "San Pedro de Atacama":[-68.2050, -22.9098],
  "Sandakan":     [118.1179,  5.8402],       // Borneo
  "Siem Reap":    [103.8550, 13.3633],
  "Split":        [16.4402, 43.5081],
  "Taormina":     [15.2870, 37.8526],
  "Ubud":         [115.2625, -8.5069],
  "Windhoek":     [17.0832, -22.5597],
  "Yogyakarta":   [110.3695, -7.7956],
  "Yulara":       [130.9810, -25.2406],      // Uluru
  "Zermatt":      [7.7491, 46.0207],

  // Oceania
  "Sydney":      [151.2093,-33.8688],
  "Melbourne":   [144.9631,-37.8136],
  "Cairns":      [145.7700,-16.9203],
  "Auckland":    [174.7633,-36.8485],
  "Queenstown":  [168.6626,-45.0312],
  "Wellington":  [174.7762,-41.2865],
  "Bora Bora":   [-151.7415,-16.5004],
  "Tahiti":      [-149.5665,-17.6509],
  "Fiji":        [178.0650,-17.7134],
  "Suva":        [178.4419,-18.1248],
};

/**
 * Catalog country names → world-atlas TopoJSON country names.
 * Only entries that need translation. Names that match exactly (e.g. "Greece"
 * = "Greece") don't need to be here.
 */
/**
 * Catalog country names → world-atlas TopoJSON country names.
 *
 * The world-atlas data uses long official forms for some countries
 * (notably "United States of America"). Most of our catalog names already
 * match exactly — `world.json` provides "Czechia", "United Kingdom",
 * "South Korea", "United Arab Emirates" as-is, so no aliases needed.
 *
 * Small island states (Maldives, Seychelles, Mauritius, Singapore, Hong Kong,
 * French Polynesia) aren't present as separate polygons in world-atlas;
 * they'll appear only via city pins, never as highlighted country shapes.
 */
export const catalogToTopo: Record<string, string> = {
  "United States": "United States of America",
};
