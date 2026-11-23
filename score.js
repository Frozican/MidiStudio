const VEROVIO_URL = "https://www.verovio.org/javascript/latest/verovio-toolkit-wasm.js";
let toolkitPromise;

const escapeXml = value => String(value ?? "").replace(/[<>&"']/g, ch => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;"
}[ch]));

export function preloadVerovio() { return loadVerovio(); }

function loadVerovio() {
  if (toolkitPromise) return toolkitPromise;

  toolkitPromise = new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer;
    let timeoutTimer;

    const cleanup = () => {
      clearTimeout(pollTimer);
      clearTimeout(timeoutTimer);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      toolkitPromise = null;
      reject(error);
    };
    const finish = () => {
      if (settled) return;
      const module = window.verovio?.module;
      // The toolkit constructor is exposed before the WASM runtime is ready.
      // Emscripten's calledRun flag is the readiness check; never instantiate
      // the toolkit merely because window.verovio.toolkit exists.
      if (!module || !(module.calledRun || module.runtimeInitialized)) return;
      try {
        if (typeof window.verovio.toolkit !== "function") {
          throw new Error("Verovio loaded, but its toolkit constructor is unavailable.");
        }
        const instance = new window.verovio.toolkit();
        if (typeof instance.loadData !== "function" ||
            typeof instance.setOptions !== "function" ||
            typeof instance.renderToSVG !== "function") {
          throw new Error("Verovio WASM initialized without the required rendering methods.");
        }
        settled = true;
        cleanup();
        resolve(instance);
      } catch (error) {
        fail(error);
      }
    };

    let script = document.querySelector("script[data-midistudio-verovio]");
    const watch = () => {
      if (settled) return;
      const module = window.verovio?.module;
      if (module) {
        const previous = module.onRuntimeInitialized;
        if (!module.__midiStudioReadyHook) {
          module.__midiStudioReadyHook = true;
          module.onRuntimeInitialized = function () {
            try { if (typeof previous === "function") previous.apply(this, arguments); }
            finally { finish(); }
          };
        }
        finish();
      }
      if (!settled) pollTimer = setTimeout(watch, 50);
    };

    if (!script) {
      script = document.createElement("script");
      script.src = VEROVIO_URL;
      script.async = true;
      script.dataset.midistudioVerovio = "true";
      script.addEventListener("error", () => fail(
        new Error("Could not load Verovio. Check your internet connection and reload the score.")
      ), { once: true });
      document.head.appendChild(script);
    }
    watch();
    timeoutTimer = setTimeout(() => {
      fail(new Error("Verovio WebAssembly initialization timed out."));
    }, 45000);
  });

  return toolkitPromise;
}

const FIFTHS = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7
};

const DURATIONS = [
  [4, "whole"], [3, "half", 1], [2, "half"], [1.5, "quarter", 1],
  [1, "quarter"], [.75, "eighth", 1], [.5, "eighth"],
  [.375, "16th", 1], [.25, "16th"], [.1875, "32nd", 1],
  [.125, "32nd"], [.09375, "64th", 1], [.0625, "64th"]
];
const TRIPLETS = [
  [8 / 3, "half", 2, 3], [4 / 3, "quarter", 2, 3],
  [2 / 3, "eighth", 2, 3], [1 / 3, "16th", 2, 3],
  [1 / 6, "32nd", 2, 3]
];

function durationNotation(ticks) {
  const beats = ticks / 960;
  const candidates = [
    ...DURATIONS.map(([value, type, dots = 0]) => ({ value, type, dots, actual: 1, normal: 1 })),
    ...TRIPLETS.map(([value, type, actual, normal]) => ({ value, type, dots: 0, actual, normal }))
  ];
  candidates.sort((a, b) => Math.abs(a.value - beats) - Math.abs(b.value - beats));
  const best = candidates[0];
  return Math.abs(best.value - beats) < 0.012
    ? best
    : null;
}

function pitchFor(midi, key) {
  const flatKeys = ["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
  const names = flatKeys.includes(key)
    ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = names[((midi % 12) + 12) % 12];
  return {
    step: name[0],
    alter: name.length > 1 ? (name[1] === "#" ? 1 : -1) : 0,
    octave: Math.floor(midi / 12) - 1
  };
}

function makeNoteXml(note, ticks, voice, staff, key, tieStart, tieStop, chord) {
  const pitch = pitchFor(note.midi, key);
  const notation = durationNotation(ticks);
  const ties = (tieStop ? '<tie type="stop"/>' : "") + (tieStart ? '<tie type="start"/>' : "");
  let xml = "<note>";
  if (chord) xml += "<chord/>";
  xml += "<pitch><step>" + pitch.step + "</step>";
  if (pitch.alter) xml += "<alter>" + pitch.alter + "</alter>";
  xml += "<octave>" + pitch.octave + "</octave></pitch>";
  xml += "<duration>" + ticks + "</duration>";
  xml += ties + "<voice>" + voice + "</voice>";
  if (notation) {
    xml += "<type>" + notation.type + "</type>" + "<dot/>".repeat(notation.dots);
    if (notation.actual !== 1) {
      xml += "<time-modification><actual-notes>" + notation.actual +
        "</actual-notes><normal-notes>" + notation.normal +
        "</normal-notes></time-modification>";
    }
  }
  xml += "<staff>" + staff + "</staff>";
  if (tieStart || tieStop) {
    xml += "<notations>";
    if (tieStop) xml += '<tied type="stop"/>';
    if (tieStart) xml += '<tied type="start"/>';
    xml += "</notations>";
  }
  return xml + "</note>";
}

function restXml(ticks, voice, staff) {
  const notation = durationNotation(ticks);
  let xml = "<note><rest/><duration>" + ticks + "</duration><voice>" + voice + "</voice>";
  if (notation) xml += "<type>" + notation.type + "</type>" + "<dot/>".repeat(notation.dots);
  return xml + "<staff>" + staff + "</staff></note>";
}

function groupNotes(notes, staffFor) {
  const groups = new Map();
  for (const note of notes) {
    const start = Math.max(0, Math.round(Number(note.time || 0) * 960));
    const duration = Math.max(1, Math.round(Math.max(.01, Number(note.duration || .25)) * 960));
    const staff = staffFor(note);
    const key = start + ":" + duration + ":" + staff;
    if (!groups.has(key)) groups.set(key, { start, end: start + duration, duration, staff, notes: [] });
    groups.get(key).notes.push(note);
  }
  return [...groups.values()].sort((a, b) => a.start - b.start || a.staff - b.staff || a.end - b.end);
}

function assignVoices(events, staffCount) {
  const voices = Array.from({ length: staffCount }, () => []);
  for (let staff = 1; staff <= staffCount; staff++) {
    const laneEnds = [];
    for (const event of events.filter(item => item.staff === staff)) {
      let lane = laneEnds.findIndex(end => end <= event.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = event.end;
      event.voice = lane + 1;
      if (!voices[staff - 1][lane]) voices[staff - 1][lane] = [];
      voices[staff - 1][lane].push(event);
    }
  }
  return voices;
}

function makePart(name, notes, partIndex, state, measureCount, ticksPerMeasure, staffMode) {
  const grand = staffMode === "grand";
  const staffCount = grand ? 2 : 1;
  const staffFor = staffMode === "grand"
    ? note => note.__staff || (note.midi < 60 ? 2 : 1)
    : staffMode === "split"
    ? note => note.midi < 60 ? 2 : 1
    : staffMode === "upper" ? () => 1
    : staffMode === "lower" ? () => 2
    : () => 1;
  const events = groupNotes(notes, staffFor);
  const voices = assignVoices(events, staffCount);
  const laneCounts = voices.map(lanes => Math.max(1, lanes.length));
  let measures = "";

  for (let bar = 0; bar < measureCount; bar++) {
    const from = bar * ticksPerMeasure;
    const to = from + ticksPerMeasure;
    let body = "";

    if (bar === 0) {
      body += '<attributes><divisions>960</divisions><key><fifths>' +
        (FIFTHS[state.key] ?? 0) + '</fifths></key><time><beats>' +
        state.numerator + '</beats><beat-type>' + state.denominator + '</beat-type></time>';
      if (grand) {
        body += '<staves>2</staves><part-symbol>brace</part-symbol>' +
          '<clef number="1"><sign>G</sign><line>2</line></clef>' +
          '<clef number="2"><sign>F</sign><line>4</line></clef>';
      } else {
        const avg = notes.length ? notes.reduce((sum, n) => sum + n.midi, 0) / notes.length : 60;
        body += '<clef><sign>' + (avg < 60 ? "F" : "G") + '</sign><line>' + (avg < 60 ? 4 : 2) + '</line></clef>';
      }
      body += "</attributes>";
      if (partIndex === 0) {
        const bpm = Math.max(20, Math.min(400, Number(state.bpm) || 120));
        body += '<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' +
          Math.round(bpm) + '</per-minute></metronome></direction-type><sound tempo="' + bpm + '"/></direction>';
      }
    }

    let firstVoice = true;
    for (let staff = 1; staff <= staffCount; staff++) {
      const lanes = voices[staff - 1];
      for (let lane = 0; lane < laneCounts[staff - 1]; lane++) {
        if (!firstVoice) body += '<backup><duration>' + ticksPerMeasure + '</duration></backup>';
        firstVoice = false;
        const laneEvents = (lanes[lane] || [])
          .filter(event => event.start < to && event.end > from)
          .sort((a, b) => a.start - b.start);
        let cursor = from;

        for (const event of laneEvents) {
          const start = Math.max(from, event.start);
          const end = Math.min(to, event.end);
          if (start > cursor) body += restXml(start - cursor, lane + 1, staff);
          const segment = end - start;
          event.notes.forEach((note, index) => {
            body += makeNoteXml(note, segment, lane + 1, staff, state.key,
              event.end > to, event.start < from, index > 0);
          });
          cursor = Math.max(cursor, end);
        }
        if (cursor < to) body += restXml(to - cursor, lane + 1, staff);
      }
    }
    if (bar === measureCount - 1) body += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    measures += '<measure number="' + (bar + 1) + '">' + body + "</measure>";
  }
  return '<part id="P' + (partIndex + 1) + '">' + measures + "</part>";
}

export function buildMusicXml(state) {
  const tracks = (state.tracks || []).filter(track => Array.isArray(track.notes) && track.notes.length);
  if (!tracks.length) throw new Error("There are no notes to engrave yet.");

  const numerator = Math.max(1, Number(state.numerator) || 4);
  const denominator = Math.max(1, Number(state.denominator) || 4);
  const beatsPerMeasure = numerator * 4 / denominator;
  const ticksPerMeasure = Math.round(beatsPerMeasure * 960);
  const lastBeat = Math.max(0, ...tracks.flatMap(track =>
    track.notes.map(note => Number(note.time || 0) + Math.max(.01, Number(note.duration || .25)))
  ));
  const measureCount = Math.max(1, Math.ceil(lastBeat / beatsPerMeasure));

  // Two imported piano tracks are commonly a right-hand / left-hand split.
  // Keep them together on a single grand staff so the result reads as piano music.
  let parts;
  let partNames;
  if (tracks.length === 2) {
    const upper = tracks[0].notes;
    const lower = tracks[1].notes;
    const merged = [...upper.map(note => ({ ...note, __staff: 1 })), ...lower.map(note => ({ ...note, __staff: 2 }))];
    parts = [makePart("Piano", merged, 0, state, measureCount, ticksPerMeasure, "grand")];
    partNames = '<score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation></score-part>';
  } else {
    parts = tracks.map((track, index) => {
      const pitches = track.notes.map(note => note.midi);
      const hasLow = pitches.some(pitch => pitch < 60);
      const hasHigh = pitches.some(pitch => pitch >= 60);
      const mode = hasLow && hasHigh ? "split" : "single";
      return makePart(track.name || ("Track " + (index + 1)), track.notes, index, state,
        measureCount, ticksPerMeasure, mode);
    });
    partNames = tracks.map((track, index) =>
      '<score-part id="P' + (index + 1) + '"><part-name>' +
      escapeXml(track.name || ("Track " + (index + 1))) +
      '</part-name></score-part>'
    ).join("");
  }

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<score-partwise version="3.1"><work><work-title>' +
    escapeXml(state.name || "MidiStudio Score") +
    '</work-title></work><identification><encoding><software>MidiStudio</software></encoding></identification>' +
    '<part-list>' + partNames + '</part-list>' + parts.join("") + '</score-partwise>';
}

export async function renderScore(state, host) {
  host.replaceChildren();
  host.classList.add("osmd-score");
  const loading = document.createElement("div");
  loading.className = "score-loading";
  loading.textContent = "Loading professional notation engine…";
  host.append(loading);

  const toolkit = await loadVerovio();
  const musicXml = buildMusicXml(state);
  toolkit.setOptions({
    pageWidth: 2100,
    pageHeight: 2970,
    scale: 38,
    adjustPageWidth: false,
    adjustPageHeight: false,
    breaks: "auto",
    pageMarginTop: 95,
    pageMarginBottom: 95,
    pageMarginLeft: 110,
    pageMarginRight: 110,
    spacingSystem: 8,
    spacingStaff: 8,
    header: "none",
    footer: "none",
    svgViewBox: true,
    engravePage: true
  });

  if (!toolkit.loadData(musicXml)) {
    throw new Error("Verovio could not parse the generated MusicXML.");
  }
  const pageCount = Math.max(1, toolkit.getPageCount());
  const pages = [];
  for (let page = 1; page <= pageCount; page++) {
    const svg = toolkit.renderToSVG(page, {});
    if (!svg || !svg.includes("<svg")) throw new Error("Verovio failed to render page " + page + ".");
    const section = document.createElement("section");
    section.className = "score-page verovio-page";
    section.innerHTML = svg;
    pages.push(section);
  }
  host.replaceChildren(...pages);
  host.dataset.pageCount = String(pageCount);
  host.dataset.engine = "Verovio";
  return { backend: "Verovio", pageCount };
}
