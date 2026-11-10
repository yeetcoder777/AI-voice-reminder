import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import Capture, { type AudioChunk } from './modules/voice-capture';
import * as Speaker from './src/speaker';
import { centroid, cosine, rms } from './src/voiceMath';
import { ProcessingQueue } from './src/processingQueue';

type Mode = 'idle' | 'enroll' | 'test';
type Clip = { uri: string; score: number; sequence: number; seconds: number };
function KeepRecordingScreenAwake() { useKeepAwake(); return null; }
const prompts = [
  'Speak naturally: describe your morning in Hindi or English.',
  'Keep talking: describe something you need to do tomorrow.',
  'One more sample: describe your favourite place or food.',
];
function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && { opacity: disabled ? 0.4 : 0.75 }]}>
    <Text style={[styles.buttonText, secondary && { color: '#173E78' }]}>{title}</Text>
  </Pressable>;
}
function ClipPlayer({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const player = useAudioPlayer(clip.uri);
  const status = useAudioPlayerStatus(player);
  useEffect(() => { if (disabled) player.pause(); }, [disabled, player]);
  return <View style={styles.clip}>
    <View style={{ flex: 1 }}><Text style={styles.label}>Accepted window {clip.sequence + 1}</Text><Text style={styles.muted}>Similarity {clip.score.toFixed(3)} · {clip.seconds.toFixed(1)} seconds</Text></View>
    <Button title={status.playing ? 'Pause' : 'Replay'} secondary disabled={disabled} onPress={() => {
      void (async () => { try { if (status.playing) player.pause(); else { await player.seekTo(0); player.play(); } } catch {} })();
    }} />
  </View>;
}
function Prototype() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [level, setLevel] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [profile, setProfile] = useState<number[] | null>(null);
  const [enrolled, setEnrolled] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [threshold, setThreshold] = useState(0.5);
  const [message, setMessage] = useState('Load the voice model, then record three samples.');
  const [error, setError] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [counts, setCounts] = useState({ accepted: 0, rejected: 0, quiet: 0, skipped: 0 });
  const [lastScore, setLastScore] = useState<number | null>(null);
  const current = useRef<Mode>('idle');
  const profileRef = useRef<number[] | null>(null);
  const thresholdRef = useRef(0.5);
  const samples = useRef<number[][]>([]);
  const processing = useRef(false);
  const action = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const clipList = useRef<Clip[]>([]);
  const started = useRef(0);
  const captureId = useRef<number | null>(null);
  const stopTask = useRef<Promise<void> | null>(null);
  const queue = useRef<ProcessingQueue<AudioChunk> | null>(null);

  function stop(reason = 'Session stopped. The microphone is off.', discard = false): Promise<void> {
    if (stopTask.current) return stopTask.current;
    setStopping(true);
    if (discard || current.current === 'enroll') { generation.current++; current.current = 'idle'; }
    const task = (async () => {
      try {
        const tail = await Capture.stop();
        setMessage('Microphone off. Finishing captured audio…');
        if (!discard && current.current === 'test' && tail && tail.sessionId === captureId.current) {
          if (!queue.current?.enqueue(tail)) { await queue.current?.drain(); queue.current?.enqueue(tail); }
        }
        await queue.current?.drain();
        setMessage(reason);
      } catch (e) { setError(String(e)); }
      finally {
        generation.current++; captureId.current = null; current.current = 'idle';
        setMode('idle'); setLevel(0); setStopping(false); stopTask.current = null;
      }
    })();
    stopTask.current = task;
    return task;
  }
  async function handleChunk(chunk: AudioChunk) {
    const active = current.current;
    if (active === 'idle' || chunk.sessionId !== captureId.current) return;
    processing.current = true;
    const token = generation.current;
    const processingStarted = Date.now();
    try {
      if (rms(chunk.samples) < 0.008) {
        setCounts(c => ({ ...c, quiet: c.quiet + 1 }));
        setMessage('Audio was too quiet. Speak clearly near the phone.');
        return;
      }
      const speech = await Speaker.speechOnly(chunk.samples);
      if (!mounted.current || generation.current !== token) return;
      if (speech.length < chunk.sampleRate * 2) {
        setCounts(c => ({ ...c, quiet: c.quiet + 1 }));
        setMessage('Less than two seconds of speech detected. Keep speaking naturally.');
        return;
      }
      const vector = await Speaker.embedding(speech, chunk.sampleRate);
      if (!mounted.current || generation.current !== token) return;
      if (active === 'enroll') {
        samples.current.push(vector);
        setEnrolled(samples.current.length);
        if (samples.current.length === 3) {
          const reference = centroid(samples.current);
          Speaker.saveProfile(reference);
          profileRef.current = reference;
          setProfile(reference);
          void stop('Voice profile saved on this phone. Start a test and take turns speaking.', true);
        } else setMessage(prompts[samples.current.length]);
      } else {
        if (!profileRef.current) throw new Error('Enroll your voice first');
        const score = cosine(profileRef.current, vector);
        setLastScore(score);
        if (score >= thresholdRef.current) {
          const uri = Speaker.saveClip(speech, chunk.sampleRate);
          const next = [{ uri, score, sequence: chunk.sequence, seconds: speech.length / chunk.sampleRate }, ...clipList.current];
          for (const old of next.slice(12)) Speaker.deleteClip(old.uri);
          clipList.current = next.slice(0, 12);
          setClips(clipList.current);
          setCounts(c => ({ ...c, accepted: c.accepted + 1 }));
          setMessage('Voice matched. This audio window was kept.');
        } else {
          setCounts(c => ({ ...c, rejected: c.rejected + 1 }));
          setMessage('Voice did not match. This audio window was discarded.');
        }
      }
    } catch (e) {
      if (mounted.current && token === generation.current) {
        setError(String(e));
        void stop('Capture stopped after a processing error. Retry when ready.', true);
      }
    } finally { processing.current = false; if (mounted.current) setLatency(Date.now() - processingStarted); }
  }
  const handler = useRef(handleChunk);
  handler.current = handleChunk;
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = Speaker.loadProfile(); profileRef.current = saved; setProfile(saved); Speaker.clearClips();
      const savedThreshold = Speaker.loadThreshold(); thresholdRef.current = savedThreshold; setThreshold(savedThreshold);
    }
    catch (e) { setError(String(e)); }
    queue.current = new ProcessingQueue(event => handler.current(event));
    const chunks = Capture.addListener('onChunk', event => {
      if (current.current === 'idle' || event.sessionId !== captureId.current) return;
      if (!queue.current?.enqueue(event)) setCounts(c => ({ ...c, skipped: c.skipped + 1 }));
    });
    const levels = Capture.addListener('onLevel', event => { if (current.current !== 'idle') setLevel(event.level); });
    const failures = Capture.addListener('onCaptureError', event => { setError(event.message); void stop('Microphone capture stopped.', true); });
    const lifecycle = AppState.addEventListener('change', state => {
      if (state !== 'active' && current.current !== 'idle') void stop('Paused because you left the app. Start again to continue.');
    });
    return () => { mounted.current = false; generation.current++; current.current = 'idle'; chunks.remove(); levels.remove(); failures.remove(); lifecycle.remove(); void Capture.stop().catch(() => {}); };
  }, []);
  useEffect(() => {
    if (mode === 'idle') return;
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [mode]);
  async function load() {
    if (action.current) return;
    action.current = true; setLoading(true); setError('');
    try { await Speaker.initialize(setMessage); setReady(true); setMessage('Voice model ready. All voice matching happens on this phone.'); }
    catch (e) { setError(String(e)); setMessage('Model setup failed. Retry to download any missing files.'); }
    finally { action.current = false; setLoading(false); }
  }
  async function begin(next: Mode) {
    if (action.current || processing.current || stopTask.current || current.current !== 'idle') return;
    action.current = true; setLoading(true); setError('');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission denied. Enable it in app settings.');
      if (AppState.currentState !== 'active') throw new Error('Keep the app open to start recording.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      generation.current++;
      samples.current = []; setEnrolled(0); setLastScore(null); setLatency(null);
      setCounts({ accepted: 0, rejected: 0, quiet: 0, skipped: 0 });
      started.current = Date.now(); setSeconds(0);
      current.current = next;
      captureId.current = await Capture.start();
      if (AppState.currentState !== 'active' || current.current !== next) { await stop(); return; }
      setMode(next);
      setMessage(next === 'enroll' ? prompts[0] : 'Take turns speaking. First result arrives after 6 seconds.');
    } catch (e) { current.current = 'idle'; setMode('idle'); setError(String(e)); }
    finally { action.current = false; setLoading(false); }
  }
  const active = mode !== 'idle';
  const locked = active || loading || stopping;
  function changeThreshold(delta: number) {
    try {
      const value = Math.round(Math.max(0.2, Math.min(0.9, threshold + delta)) * 100) / 100;
      Speaker.saveThreshold(value); thresholdRef.current = value; setThreshold(value);
    } catch (e) { setError(String(e)); }
  }
  const time = Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
  return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" />
    {active && <KeepRecordingScreenAwake />}
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}><Text style={styles.brand}>AI Reminder</Text><Text style={styles.badge}>Voice prototype 0.2.1</Text></View>
      <Text style={styles.title}>A little less{'\n'}to remember.</Text>
      <Text style={styles.intro}>Start with your voice. Enroll it, then check what the app keeps and what it ignores.</Text>
      <View style={styles.recorder}>
        <Text style={styles.status}>{stopping ? 'Finishing captured speech' : mode === 'enroll' ? 'Recording enrollment' : mode === 'test' ? 'Listening for your voice' : 'Microphone off'}</Text>
        <Text accessibilityLabel={seconds + ' seconds'} style={styles.timer}>{time}</Text>
        <View accessibilityLabel={'Microphone level ' + Math.round(level * 100)} style={{ height: 6, backgroundColor: '#DDE5F1', borderRadius: 3, marginBottom: 16 }}>
          <View style={{ width: `${(active && !stopping) ? Math.min(100, level * 800) : 0}%`, height: 6, backgroundColor: '#258168', borderRadius: 3 }} />
        </View>
        <View style={styles.track}>{[0, 1, 2].map(i => <View key={i} style={[styles.step, i < enrolled && styles.filled]} />)}</View>
        <Text style={styles.prompt}>{message}</Text>
        {active ? <Button title={stopping ? 'Finishing…' : 'Stop microphone'} disabled={stopping} onPress={() => { void stop(); }} /> : !ready ?
          <Button title={loading ? 'Preparing model…' : error ? 'Retry model setup' : 'Download & load voice model'} disabled={loading} onPress={() => { void load(); }} /> :
          <View style={{ gap: 10 }}>
            <Button title={profile ? 'Start voice test' : 'Enroll my voice'} disabled={loading} onPress={() => { void begin(profile ? 'test' : 'enroll'); }} />
            {profile && <Button title="Record enrollment again" secondary disabled={loading} onPress={() => { void begin('enroll'); }} />}
          </View>}
        <Text style={styles.note}>{profile ? 'Your voice profile is saved locally.' : 'Three samples. About 16 seconds of continuous speech.'}</Text>
      </View>
      {!!error && <View accessibilityRole="alert" style={styles.error}><Text style={{ color: '#982E35' }}>{error}</Text>{/permission/i.test(error) && <Button title="Open app settings" secondary onPress={() => { void Linking.openSettings(); }} />}</View>}
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Match sensitivity</Text><Text style={styles.score}>{threshold.toFixed(2)}</Text></View>
      <Text style={styles.muted}>Higher values reject more voices, including some of your own. This starting threshold needs testing.</Text>
      <View style={styles.controls}><Button title="− 0.05" secondary disabled={locked || threshold <= 0.2} onPress={() => changeThreshold(-0.05)} /><Button title="+ 0.05" secondary disabled={locked || threshold >= 0.9} onPress={() => changeThreshold(0.05)} /></View>
      <Text style={styles.label}>Last similarity: {lastScore === null ? 'Waiting for speech' : lastScore.toFixed(3)}</Text>
      <Text style={styles.muted}>{latency === null ? 'Processing time appears after a window is checked.' : 'Last window processed in ' + (latency / 1000).toFixed(2) + ' seconds.'}</Text>
      <View style={styles.stats}>{Object.entries(counts).map(([name, count]) => <View key={name}><Text style={styles.count}>{count}</Text><Text style={styles.muted}>{name}</Text></View>)}</View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Accepted audio</Text><Text style={styles.muted}>{clips.length} / 12 kept</Text></View>
      <Text style={styles.muted}>Speech is detected before matching. Replay keeps speech from accepted windows, including overlap. Up to 12 clips are kept.</Text>
      {clips.length === 0 && <Text style={styles.empty}>Your matching audio will appear here after a voice test.</Text>}
      {clips.map(clip => <ClipPlayer key={clip.uri} clip={clip} disabled={active || loading} />)}
      <View style={{ gap: 10, marginTop: 16 }}>
        <Button title="Delete accepted audio" secondary disabled={active || loading || !clips.length} onPress={() => { try { Speaker.clearClips(); clipList.current = []; setClips([]); } catch (e) { setError(String(e)); } }} />
        <Button title="Delete my voice profile" secondary disabled={active || loading || !profile} onPress={() => { try { Speaker.removeProfile(); profileRef.current = null; setProfile(null); setEnrolled(0); } catch (e) { setError(String(e)); } }} />
      </View>
      <Text style={styles.footer}>Keep this app open. The screen stays awake while recording. Silero detects speech before voice matching; less than two seconds of speech is skipped. One speaker at a time: this prototype cannot separate overlapping voices. Matching can make mistakes.</Text>
    </ScrollView>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Prototype /></SafeAreaProvider>; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F4FA' }, page: { padding: 24, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, brand: { fontSize: 18, fontWeight: '700', color: '#173E78' }, badge: { fontSize: 12, color: '#48617F', backgroundColor: '#E1E9F5', padding: 8, borderRadius: 6 },
  title: { fontSize: 38, lineHeight: 43, letterSpacing: -1.2, color: '#152D4D', fontWeight: '700', marginTop: 36 }, intro: { fontSize: 16, lineHeight: 24, color: '#48617F', marginTop: 14, marginBottom: 28 },
  recorder: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, borderWidth: 1, borderColor: '#D6E0EE' }, status: { color: '#173E78', fontWeight: '600', textAlign: 'center' }, timer: { fontSize: 64, fontWeight: '300', fontVariant: ['tabular-nums'], color: '#152D4D', textAlign: 'center', marginVertical: 14 },
  track: { flexDirection: 'row', gap: 6, alignSelf: 'center', marginBottom: 16 }, step: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#DDE5F1' }, filled: { backgroundColor: '#258168' }, prompt: { fontSize: 16, lineHeight: 23, color: '#334F70', textAlign: 'center', marginBottom: 22, minHeight: 70 },
  button: { minHeight: 48, backgroundColor: '#173E78', borderRadius: 10, paddingHorizontal: 17, paddingVertical: 14, justifyContent: 'center', alignItems: 'center' }, buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' }, secondary: { backgroundColor: '#E5ECF7' }, note: { color: '#48617F', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 14 },
  sectionHeader: { marginTop: 28, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { fontSize: 20, fontWeight: '600', color: '#152D4D' }, score: { fontSize: 20, color: '#173E78', fontWeight: '600' }, muted: { fontSize: 13, lineHeight: 20, color: '#48617F' }, controls: { flexDirection: 'row', gap: 10, marginVertical: 14 }, label: { color: '#152D4D', fontSize: 14, fontWeight: '600' }, stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#CCD8E8' }, count: { fontSize: 26, color: '#173E78' }, empty: { color: '#48617F', lineHeight: 22, paddingVertical: 24 }, clip: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#CCD8E8' }, error: { backgroundColor: '#FBECEE', padding: 16, borderRadius: 10, gap: 12, marginTop: 16 }, footer: { fontSize: 12, lineHeight: 19, color: '#48617F', marginTop: 28 },
});
