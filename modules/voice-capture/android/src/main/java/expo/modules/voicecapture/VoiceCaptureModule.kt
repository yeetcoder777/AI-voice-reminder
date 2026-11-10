package expo.modules.voicecapture

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.sqrt

/** One recorder, six-second windows, one-second overlap. Foreground prototype only. */
class VoiceCaptureModule : Module() {
  private val running = AtomicBoolean(false)
  private var worker: Thread? = null
  private var recorder: AudioRecord? = null
  private val sessions = AtomicInteger(0)
  @Volatile private var finalChunk: Map<String, Any>? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceCapture")
    Events("onChunk", "onCaptureError", "onLevel")
    AsyncFunction("start") { startCapture() }
    AsyncFunction("stop") { stopCapture() }
    OnDestroy { stopCapture() }
  }

  @Synchronized
  private fun startCapture(): Int {
    check(!running.get() && worker == null) { "Capture is already active" }
    val minimum = AudioRecord.getMinBufferSize(16000,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minimum > 0) { "16 kHz microphone capture is unavailable" }
    val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
      AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minimum * 2, 6400))
    if (audio.state != AudioRecord.STATE_INITIALIZED) {
      audio.release()
      error("Microphone initialization failed")
    }
    try { audio.startRecording() } catch (e: Exception) { audio.release(); throw e }
    recorder = audio
    finalChunk = null
    val sessionId = sessions.incrementAndGet()
    running.set(true)
    worker = Thread({
      val input = ShortArray(1600)
      val window = FloatArray(96000)
      var filled = 0
      var sequence = 0
      var reads = 0
      try {
        while (running.get()) {
          val count = audio.read(input, 0, input.size, AudioRecord.READ_BLOCKING)
          if (count < 0) {
            if (running.get()) error("Microphone read failed: $count")
            break
          }
          if (++reads % 5 == 0 && count > 0) {
            var energy = 0.0
            for (i in 0 until count) { val sample = input[i] / 32768.0; energy += sample * sample }
            sendEvent("onLevel", mapOf("level" to sqrt(energy / count)))
          }
          for (i in 0 until count) {
            window[filled++] = input[i] / 32768f
            if (filled == window.size) {
              sendEvent("onChunk", mapOf("samples" to window.toList(),
                "sampleRate" to 16000, "sequence" to sequence++, "sessionId" to sessionId, "final" to false))
              window.copyInto(window, 0, 80000, 96000)
              filled = 16000
            }
          }
        }
      } catch (e: Exception) {
        if (running.get()) sendEvent("onCaptureError", mapOf("message" to (e.message ?: "Capture failed")))
      } finally {
        // Stop can unblock read() by throwing; preserve its tail in either case.
        if (filled >= 32000) {
          finalChunk = mapOf("samples" to window.copyOf(filled).toList(),
            "sampleRate" to 16000, "sequence" to sequence, "sessionId" to sessionId, "final" to true)
        }
        running.set(false)
        try { audio.stop() } catch (_: Exception) {}
        audio.release()
      }
    }, "voice-capture").also { it.start() }
    return sessionId
  }

  @Synchronized
  private fun stopCapture(): Map<String, Any>? {
    running.set(false)
    try { recorder?.stop() } catch (_: Exception) {}
    worker?.join(2000)
    check(worker?.isAlive != true) { "Microphone did not stop; try closing the app" }
    worker = null
    recorder = null
    val pending = finalChunk
    finalChunk = null
    return pending
  }
}
