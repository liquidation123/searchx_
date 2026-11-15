const messier = number => 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-' + number + '/';
const horsehead = 'https://science.nasa.gov/missions/webb/webb-captures-top-of-iconic-horsehead-nebula-in-unprecedented-detail/';
const horseheadStudy = 'https://doi.org/10.1051/0004-6361/202449198';
const epsilon = 'https://www.hq.eso.org/sci/activities/vltsv/visirsv/sterzik.html';
const wise = 'https://doi.org/10.3847/0004-6256/152/3/78';
const aurigae = 'https://chandra.harvard.edu/press/18_releases/press_071818.html';
const barnard = 'https://science.nasa.gov/missions/chandra/assessing-the-habitability-of-planets-around-old-red-dwarfs/';
const barnardPlanets = 'https://science.nasa.gov/universe/exoplanets/discovery-alert-four-little-planets-one-big-step/';
const draconis = 'https://britastro.org/vss/objects/obj-dra.html';

const question = (reference, question, choices, correct, feedback) => ({ reference, question, choices, correct, feedback });

const sets = {
  'GJ 699': [
    question(barnard, 'How far away is Barnard’s Star?', ['About 6 light-years', 'About 60 light-years', 'About 600 light-years'], 0, 'At roughly six light-years, Barnard’s Star is one of the Sun’s nearest stellar neighbors.'),
    question(barnard, 'What kind of star did Chandra and Hubble study in the Barnard’s Star system?', ['A young blue giant', 'An old red dwarf', 'A cooling white dwarf'], 1, 'Barnard’s Star is a cool, low-mass red dwarf estimated to be about 10 billion years old.'),
    question(barnardPlanets, 'What did high-precision velocity measurements reveal around Barnard’s Star?', ['A companion white dwarf', 'A single Jupiter-sized planet', 'Four planets less massive than Earth'], 2, 'Small changes in the star’s velocity helped establish four close-orbiting sub-Earth-mass planets.'),
  ],
  'Barnard 33': [
    question(horseheadStudy, 'What makes Barnard 33 look dark in visible light?', ['The gas has cooled until it cannot scatter light', 'Dust blocks light from the glowing gas behind it', 'The cloud lies beyond the Milky Way'], 1, 'Dust in Barnard 33 extinguishes visible light from the background emission region IC 434.'),
    question(horsehead, 'What does Webb’s nearly edge-on view of the Horsehead help astronomers study?', ['The boundary between ultraviolet-lit gas and more shielded material', 'The rotation of a disk around a single star', 'Distances to galaxies behind Orion'], 0, 'Its orientation makes it easier to trace the transition from irradiated gas and dust to the shielded molecular cloud.'),
    question(horsehead, 'What did Webb’s near-infrared camera reveal along the Horsehead’s illuminated edge?', ['A chain of supernova shells', 'A spiral pattern made of stars', 'Fine structure in the gas and dust'], 2, 'NIRCam resolved features at the top of the cloud, where radiation illuminates the material.'),
  ],
  'M 42': [
    question(messier(42), 'Why is the Orion Nebula a stellar nursery?', ['Its stars are about to leave the Milky Way', 'New stars are forming in its gas and dust', 'Its glow comes from a single aging star'], 1, 'The gas and dust in M42 form a nearby region where young stars are being born.'),
    question(messier(42), 'What is the Trapezium in the Orion Nebula?', ['A dark foreground cloud', 'Four bright galaxies behind Orion', 'A group of young massive stars near the center'], 2, 'The central massive stars have a trapezoidal arrangement, giving the Trapezium its name.'),
    question(messier(42), 'Why did Hubble observe the Orion Nebula in infrared as well as visible light?', ['To see young objects that dust hides at visible wavelengths', 'To see the nebula’s glow before the stars formed', 'To make all the stars appear at the same distance'], 0, 'Infrared wavelengths can reveal young stars and other objects that are obscured in visible light.'),
  ],
  'M 31': [
    question(messier(31), 'What kind of galaxy does Andromeda’s disk and arm pattern identify?', ['Elliptical galaxy', 'Spiral galaxy', 'Irregular galaxy'], 1, 'Andromeda contains a disk with spiral structure, which appears tilted from Earth.'),
    question(messier(31), 'Roughly how far away is the Andromeda Galaxy?', ['2.5 million light-years', '2,500 light-years', '250 million light-years'], 0, 'M31 is roughly 2.5 million light-years from Earth and is one of our closest large galactic neighbors.'),
    question(messier(31), 'What can Hubble resolve in its mosaic of Andromeda’s disk?', ['Individual stars in another galaxy', 'Individual planets around most of those stars', 'The surfaces of the largest stars'], 0, 'Hubble’s resolution lets astronomers study enormous numbers of individual stars across Andromeda’s disk.'),
  ],
  'M 1': [
    question(messier(1), 'What did observers on Earth record in 1054 where the Crab Nebula is now?', ['A passing comet', 'A supernova bright enough to see by day', 'An eclipse of a distant star'], 1, 'The bright guest star was the explosion whose debris we now see as the Crab Nebula.'),
    question(messier(1), 'What remains at the center of the Crab Nebula?', ['A rapidly spinning neutron star', 'A white dwarf cooling alone', 'A stellar-mass black hole'], 0, 'The Crab Pulsar is a spinning neutron star that powers activity in the surrounding remnant.'),
    question('https://science.nasa.gov/missions/hubble/nasas-hubble-revisits-crab-nebula-to-track-25-years-of-expansion/', 'What do Hubble images of the Crab taken years apart reveal?', ['Its debris is contracting back to the center', 'Its outer filaments are fixed in place', 'The supernova remnant is expanding'], 2, 'Comparing images across years reveals outward movement in the remnant.'),
  ],
  'M 45': [
    question(messier(45), 'What kind of stellar group is the Pleiades?', ['An open cluster', 'A globular cluster', 'A binary star'], 0, 'The Pleiades is a relatively loose grouping of young stars in the Milky Way.'),
    question(messier(45), 'What lights up the wispy nebula near the Pleiades star Merope?', ['Hot gas behind a supernova shock', 'Visible starlight scattered by dust', 'A white dwarf ionizing an old shell'], 1, 'The dust reflects and scatters light from Merope, producing a reflection nebula.'),
    question(messier(45), 'Why can small and large dust grains near Merope become separated?', ['Small grains are drawn more strongly by gravity per unit mass', 'Large grains all evaporate first', 'Starlight slows smaller grains more strongly'], 2, 'Radiation pressure from Merope acts differently on grains of different sizes, sorting the dust.'),
  ],
  'M 51': [
    question(messier(51), 'What happens where hydrogen gas is compressed in the Whirlpool’s arms?', ['Clusters of new stars form', 'The central black hole creates new spiral arms', 'Collisions turn the gas into old globular clusters'], 0, 'The arms contain dense star-forming regions where gas can collapse and form new stars.'),
    question(messier(51), 'Which nearby galaxy may have helped make M51’s arms especially prominent?', ['M32', 'NGC 5195', 'M101'], 1, 'NGC 5195 is the smaller companion at the tip of one arm. Its gravitational encounter may have enhanced the spiral pattern.'),
    question(messier(51), 'What does Hubble’s image trace with the bright blue strands along M51’s arms?', ['Jets from the nucleus', 'Light from the companion galaxy', 'Clusters of hot young stars'], 2, 'The blue strands contain hot young stars, while dusty lanes and glowing gas also trace the arms.'),
  ],
  'M 57': [
    question(messier(57), 'Where did the gas in the Ring Nebula come from?', ['The outer layers of a dying Sun-like star', 'A collision between two gas giants', 'Debris ejected from a young cluster of stars'], 0, 'A Sun-like star shed its outer layers late in its life, leaving a glowing planetary nebula.'),
    question(messier(57), 'What is left of the star that produced M57?', ['A stable red giant', 'A hot white dwarf', 'A spinning pulsar'], 1, 'The star’s exposed core is a white dwarf. Its radiation makes the surrounding gas glow.'),
    question('https://science.nasa.gov/asset/hubble/the-ring-nebula-m57/', 'Why can a three-dimensional shell in M57 look like a ring in an image?', ['The bright gas is confined to a flat orbit', 'A foreground cloud cuts an exact circle from the view', 'We see the projected shape of the gas from our viewing angle'], 2, 'The apparent ring is the projection of a three-dimensional gas structure viewed roughly down its axis.'),
  ],
  'M 101': [
    question(messier(101), 'Why is it easy to see the spiral pattern of the Pinwheel Galaxy?', ['We see its disk nearly face-on', 'We see its disk edge-on', 'Its arms extend perpendicular to the disk'], 0, 'A near face-on view reveals the arms across the disk with little overlap along the line of sight.'),
    question(messier(101), 'What do the bright knots scattered through M101’s spiral arms trace?', ['Background globular clusters', 'Regions where new stars are forming', 'Gaps in the disk'], 1, 'The knots include regions of glowing gas energized by young stars.'),
    question(messier(101), 'What galaxy structure can the Hubble and Webb composite of M101 help distinguish near its center?', ['A planetary ring system', 'Two separate galaxy disks', 'Starlight and dusty material seen at different wavelengths'], 2, 'Visible and infrared observations trace different components of the galaxy, including its stars and dust.'),
  ],
  'eps Ind B': [
    question(epsilon, 'What are the two resolved components of Epsilon Indi B?', ['Two brown dwarfs', 'A pair of white dwarfs', 'Two young Sun-like stars'], 0, 'Epsilon Indi Ba and Bb make up a nearby binary of brown dwarfs.'),
    question(epsilon, 'Which observation helps constrain the masses of Epsilon Indi Ba and Bb?', ['The color of unrelated stars in the same field', 'Measurements of their mutual orbit', 'A single image of their combined glow'], 1, 'Following their orbital motion constrains the masses through gravity.'),
    question(epsilon, 'Why is Epsilon Indi B useful for testing models of cool atmospheres?', ['Its components have identical spectra', 'Neither component emits infrared light', 'Its proximity lets astronomers characterize both components'], 2, 'This nearby binary allows separate measurements of two cool objects with well-constrained physical properties.'),
  ],
  'WISE J085510.83-071442.5': [
    question(wise, 'What makes WISE 0855 unusual among nearby brown dwarfs?', ['Its surface is hotter than the Sun’s', 'Its temperature is near 250 K', 'It shines mainly through visible hydrogen emission'], 1, 'WISE 0855 is an exceptionally cold brown dwarf, with a temperature around 250 kelvin.'),
    question(wise, 'Which wavelengths are especially useful for studying WISE 0855’s faint emission?', ['Infrared wavelengths', 'Ultraviolet wavelengths', 'Visible blue wavelengths'], 0, 'A cold object emits much more readily in the infrared than in visible or ultraviolet light.'),
    question(wise, 'How does the measured distance to WISE 0855 compare with the size of the Milky Way?', ['It lies in a neighboring galaxy', 'It lies near the far edge of the Milky Way', 'It is in the immediate solar neighborhood, about two parsecs away'], 2, 'Parallax measurements place WISE 0855 at roughly 2.2 parsecs, close to the Sun by stellar standards.'),
  ],
  'RW Aur': [
    question(aurigae, 'What is RW Aur B in relation to the young variable star RW Aur A?', ['A background galaxy', 'Its stellar companion', 'A dust knot in its disk'], 1, 'RW Aur A and RW Aur B form a binary star system.'),
    question(aurigae, 'Which element appeared unusually abundant in Chandra observations of RW Aur A during a dim interval?', ['Iron', 'Helium', 'Neon'], 0, 'Chandra’s X-ray spectrum showed strong evidence of enhanced iron when the star was dim.'),
    question(aurigae, 'What is one proposed cause of the dimming in RW Aur A?', ['A stable decrease in fusion in its core', 'The system moving much farther away', 'Material crossing the line of sight and blocking starlight'], 2, 'Obscuring material associated with the young system is a proposed explanation; the exact origin of that material remains uncertain.'),
  ],
  'R Dra': [
    question(draconis, 'How long is a typical brightness cycle of R Draconis?', ['About 25 days', 'About 246 days', 'About 2,460 days'], 1, 'The British Astronomical Association lists a period of about 245.6 days.'),
    question(draconis, 'Which observing record would best capture a full brightness cycle of R Draconis?', ['Regular measurements over about a year', 'High-speed measurements over one night', 'Two images taken one week apart'], 0, 'Its roughly eight-month period requires observations spread across many months to trace a full cycle.'),
    question(draconis, 'What does the “Dra” in R Dra identify?', ['The detector used to measure it', 'The star’s spectral class', 'The constellation Draco'], 2, 'R Dra is the abbreviated name for R Draconis, a variable star in Draco.'),
  ],
};

export function questionsFor(id) {
  return Object.hasOwn(sets, id) ? sets[id] : [];
}
