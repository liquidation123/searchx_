# SPHEREx sky map

Run `npm install` and `npm start` in this directory with Node.js 20 or newer. Open [the local sky map](http://127.0.0.1:5173/). Run `npm test` to check coordinate parsing and wavelength labels.

Search for an object or coordinates, select a wavelength, and click a labeled pin to read its catalog details. Return restores the last target. The local server relays the public SPHEREx DR1 tiles from NASA/IPAC IRSA. The viewer uses the official Aladin Lite 3.8.1 release from CDS.

[SPHEREx DR1 data](https://doi.org/10.26131/IRSA679) · [Aladin Lite source and license](https://github.com/cds-astro/aladin-lite/tree/v3.8.1)
# Molecular-band field guide

The Observatory's **Explore a cloud** guide lives in the map sidebar. Its region and feature records are in `public/spectral-guide.js`; add regions there with coordinates, field of view, short context, and an evidence URL. Feature records provide the band center, absorption/emission type, educational note, supported published regions, and source. The map uses the SPHEREx DR1 channel metadata to select the nearest wavelength; it does not encode band centers as channel numbers.

The guide is a guided wavelength browser plus published evidence, not a live molecular detection pipeline. For Cygnus X, the **Water ice** button on the main map overlays the H₂O optical-depth panel from Figure 3 of [Hora et al. (2026)](https://doi.org/10.3847/1538-4357/ae5180). The figure has been registered to its printed Galactic-coordinate ticks. Clicks report a coarse *relative color signal digitized from that published figure* and support comparing locations; they are not numeric optical-depth values or new SPHEREx measurements. The accompanying raster is derived from the published figure, and the WCS constants and conversion helpers are in `public/cygnus-water-map.js`. The paper's figure-level map and its limitations are described in the linked study. For a raw, quantitative per-location result, the app still needs processed scientific pixels or calibrated measurements with errors, channel response, quality flags, coverage and background treatment. The all-sky HiPS PNGs are visualization-only and the application's displayed channel brightness must not be interpreted as a molecular map.

The current example regions and references:

- Cygnus X and the North American Nebula: published H₂O, CO₂, CO ice and 3.28 μm PAH maps, [Hora et al. (2026)](https://doi.org/10.3847/1538-4357/ae5180).
- Rosette Nebula: published 3.3/3.4 μm PAH mapping example, [Saydjari et al. (2026 preprint)](https://arxiv.org/abs/2611.12846).

SPHEREx DR1 cubes have 102 channels and provide IMAGE, NHITS, FLAGS and spectral-channel metadata; the HiPS PNG tree is for visualization. See the [IRSA cube tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/) and [data product documentation](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-products/) before building the measurement service. In particular, the tutorial warns that a spectrum extracted directly from the all-sky cube is only a quick look; research measurements should use IRSA spectrophotometry.
