/* Weavefield — defaults: timber species, rod profiles, soils, parameters, families, starting design */
SF.Defaults = (function () {
  'use strict';
  const PROTA = 'https://uses.plantnet-project.org/en/';
  // species for the timber profiles (frame members and sticks); E in GPa, MOR in MPa, density kg/m³
  const SPECIES = [
    { id: 'sissoo', name: 'Sissoo (sheesham)', latin: 'Dalbergia sissoo', density: 775, E_gpa: 10.4, mor: 97, src: PROTA + 'Dalbergia_sissoo_(PROTA)' },
    { id: 'teak', name: 'Teak', latin: 'Tectona grandis', density: 670, E_gpa: 10.5, mor: 95, src: PROTA + 'Tectona_grandis_(PROTA)' },
    { id: 'eucalyptus', name: 'River red gum', latin: 'Eucalyptus camaldulensis', density: 830, E_gpa: 12.6, mor: 120, src: PROTA + 'Eucalyptus_camaldulensis_(PROTA)' },
    { id: 'babul', name: 'Babul', latin: 'Acacia nilotica', density: 740, E_gpa: 11.06, mor: 88, src: PROTA + 'Acacia_nilotica_(PROTA)' },
    { id: 'ash', name: 'Ash', latin: 'Fraxinus excelsior', density: 680, E_gpa: 11, mor: 104, src: 'https://www.wood-database.com/european-ash/' }
  ];
  // rod profiles: timber ones take E, strength and density from the species unless they set their own
  const PROFILES = {
    frame: { label: 'Frame member · steam-bent', section_mm: 40, steam: true, timber: true },
    stick: { label: 'Stick · bent cold', section_mm: 20, timber: true },
    weave: { label: 'Weave · rattan', section_mm: 10, E_gpa: 6, strength_mpa: 55, density: 550 },
    pole: { label: 'Ground pole · staked', section_mm: 70, timber: true, staked: true }
  };
  // allowable bearing (kPa), friction, peg pull-out and sideways capacity (N)
  const SOILS = [
    { id: 'loose', name: 'Loose sand or fill', q: 75, mu: 0.35, pegU: 120, pegH: 180 },
    { id: 'firm', name: 'Firm soil', q: 150, mu: 0.5, pegU: 300, pegH: 400 },
    { id: 'dense', name: 'Compacted ground or murram', q: 300, mu: 0.6, pegU: 500, pegH: 650 }
  ];
  function params() {
    return {
      material: {
        species: 'sissoo', strength_factor: 0.6, bundle_action: 0.5, gravity: 1,
        joint_stiffness: 20000, joint_capacity_n: 600, joint_rot: 15, slip_factor: 3, segment_m: 0.3,
        max_rod_m: 8, lap_m: 0.3, elastic_strain: 0.004, soak_strain: 0.017, steam_strain: 0.03, profiles: {}
      },
      grow: {
        count: 150, batch: 8, seed: 1, lenMin: 1.2, lenMax: 4.2, spMin: 0.12, spMax: 0.5, reach: 1.7, overhang: 0.3, tendril: 1.0,
        ground: true, openings: true, candidates: 8, bend: 1, tieRadius: 0.07, tieSpacing: 0.45, prebend: 'auto', patience: 120, settle: 700
      },
      ground: { zone: 0.15, footMin: 30, keepOff: true, soil: 'firm', socket: 'tangent' },
      view: { color: 'stress', thickness: 1.6, ties: true, ortho: false }
    };
  }
  // stick families: each follows its own field (Stickfield's aggregation presets); share = how many sticks it gets
  function families() {
    return [
      { id: 'A', name: 'Bridging', preset: 'span', enabled: true, share: 1.0, type: 'bent', len: 1, profile: 'stick' },
      { id: 'B', name: 'Rim strands', preset: 'wrap', enabled: true, share: 0.6, type: 'bent', len: 1, profile: 'stick' },
      { id: 'C', name: 'Offcut braces', preset: 'span', enabled: true, share: 0.35, type: 'straight', len: 0.5, profile: 'stick' },
      { id: 'D', name: 'Tendrils', preset: 'radial', enabled: true, share: 0.12, type: 'tendril', len: 0.65, profile: 'weave' }
    ];
  }
  const PRESETS_FLOW = [
    { id: 'span', label: 'Bridge between members' }, { id: 'wrap', label: 'Wrap round the members' }, { id: 'along', label: 'Run along the members' },
    { id: 'rise', label: 'Rise and lean in' }, { id: 'swirl', label: 'Spiral round the centre' }, { id: 'radial', label: 'Reach outwards' }, { id: 'none', label: 'Blank (paint it)' }
  ];
  const STICK_TYPES = [['bent', 'Bent'], ['straight', 'Straight offcut'], ['tendril', 'Tendril']];
  function design() {
    return { version: 1, name: 'Nest study 01', families: families(), strokes: [], scalarStrokes: [], formworkEls: [] };
  }
  return { SPECIES, PROFILES, SOILS, params, families, design, PRESETS_FLOW, STICK_TYPES };
})();
