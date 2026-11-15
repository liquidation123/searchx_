# SPHEREx sky map

Run `npm install` and `npm start` in this directory with Node.js 20 or newer. Open [the local sky map](http://127.0.0.1:5173/). Run `npm test` to check coordinate parsing and wavelength labels.

Search for an object or coordinates, select a wavelength, and click a labeled pin to read its catalog details. Return restores the last target. The local server relays the public SPHEREx DR1 tiles from NASA/IPAC IRSA. The viewer uses the official Aladin Lite 3.8.1 release from CDS.

[SPHEREx DR1 data](https://doi.org/10.26131/IRSA679) · [Aladin Lite source and license](https://github.com/cds-astro/aladin-lite/tree/v3.8.1)
# Molecular-band field guide

The Observatory's **Explore a cloud** guide lives in the map sidebar. Its region and feature records are in `public/spectral-guide.js`; add regions there with coordinates, field of view, short context, and an evidence URL. Feature records provide the band center, absorption/emission type, educational note, supported published regions, and source. The map uses the SPHEREx DR1 channel metadata to select the nearest wavelength; it does not encode band centers as channel numbers.

The guide is a guided wavelength browser plus published evidence, not a live molecular detection pipeline. For Cygnus X, selecting water ice or PAH shows the NASA/JPL published SPHEREx figure; the caption identifies what each color means. Other feature/region combinations link to the published study and state that the result is region-level, not a measurement at the cursor. The all-sky HiPS PNGs are visualization-only and the application's displayed channel brightness must not be interpreted as a molecular map. Published SPHEREx feature maps use calibrated spectra and specialized modelling; the PAH maps in particular use forward modelling to account for the linear-variable-filter response. A live per-location result still needs calibrated measurements and their errors, channel response, quality flags, coverage and background treatment, then should return candidate strength, uncertainty and provenance.

The current example regions and references:

- Cygnus X and the North American Nebula: published H₂O, CO₂, CO ice and 3.28 μm PAH maps, [Hora et al. (2026)](https://doi.org/10.3847/1538-4357/ae5180).
- Rosette Nebula: published 3.3/3.4 μm PAH mapping example, [Saydjari et al. (2026 preprint)](https://arxiv.org/abs/2611.12846).

SPHEREx DR1 cubes have 102 channels and provide IMAGE, NHITS, FLAGS and spectral-channel metadata; the HiPS PNG tree is for visualization. See the [IRSA cube tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-hipscube/) and [data product documentation](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-products/) before building the measurement service. In particular, the tutorial warns that a spectrum extracted directly from the all-sky cube is only a quick look; research measurements should use IRSA spectrophotometry.
