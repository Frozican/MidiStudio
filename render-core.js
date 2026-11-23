// Shared MIDI render timeline used by the visual renderer and audio exporter.
// All project positions are beats; this module converts them once into seconds.
export function createMidiRenderCore(project) {
  const fallbackBpm = Math.max(1, Number(project?.bpm) || 120);
  const tempoMap = Array.isArray(project?.tempoMap) && project.tempoMap.length
    ? project.tempoMap
        .map(item => ({ beat: Math.max(0, Number(item.beat) || 0), bpm: Math.max(1, Number(item.bpm) || fallbackBpm) }))
        .sort((a, b) => a.beat - b.beat)
    : [{ beat: 0, bpm: fallbackBpm }];

  if (tempoMap[0].beat > 0) tempoMap.unshift({ beat: 0, bpm: fallbackBpm });

  const segments = [];
  let seconds = 0;
  for (let i = 0; i < tempoMap.length; i++) {
    const current = tempoMap[i];
    const next = tempoMap[i + 1];
    segments.push({ beat: current.beat, seconds, bpm: current.bpm });
    if (next) seconds += Math.max(0, next.beat - current.beat) * 60 / current.bpm;
  }

  const beatToSeconds = beat => {
    const target = Math.max(0, Number(beat) || 0);
    let segment = segments[0];
    for (let i = 1; i < segments.length && segments[i].beat <= target; i++) segment = segments[i];
    return segment.seconds + (target - segment.beat) * 60 / segment.bpm;
  };

  const notes = (project?.tracks || []).flatMap((track, trackIndex) => {
    if (track?.muted) return [];
    return (track?.notes || []).map(note => {
      const startBeat = Math.max(0, Number(note.time) || 0);
      const durationBeats = Math.max(0.001, Number(note.duration) || 0.001);
      const startSeconds = beatToSeconds(startBeat);
      const endSeconds = beatToSeconds(startBeat + durationBeats);
      return Object.freeze({
        ...note,
        trackIndex,
        trackName: track?.name || `Track ${trackIndex + 1}`,
        startBeat,
        endBeat: startBeat + durationBeats,
        startSeconds,
        endSeconds,
        durationSeconds: Math.max(0.001, endSeconds - startSeconds)
      });
    });
  }).sort((a, b) => a.startSeconds - b.startSeconds || a.midi - b.midi);

  notes.forEach((note, index) => { note.gradientIndex = index; });

  const events = [];
  for (const note of notes) {
    events.push(Object.freeze({ type: "noteOn", time: note.startSeconds, note }));
    events.push(Object.freeze({ type: "noteOff", time: note.endSeconds, note }));
  }
  // A note-off at a shared timestamp is processed before a note-on.
  events.sort((a, b) => a.time - b.time || (a.type === "noteOff" ? -1 : 1));

  const firstNoteTime = notes[0]?.startSeconds ?? 0;
  const endTime = notes.reduce((end, note) => Math.max(end, note.endSeconds), firstNoteTime);

  return Object.freeze({
    bpm: fallbackBpm,
    tempoMap: Object.freeze(tempoMap.map(Object.freeze)),
    notes: Object.freeze(notes),
    events: Object.freeze(events),
    firstNoteTime,
    endTime,
    duration: Math.max(0, endTime - firstNoteTime),
    beatToSeconds
  });
}
