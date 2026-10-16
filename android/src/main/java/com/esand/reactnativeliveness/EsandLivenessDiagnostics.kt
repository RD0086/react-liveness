package com.esand.reactnativeliveness

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject

internal class EsandLivenessDiagnostics(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @Synchronized
  fun begin(api: String, callId: String, startedAt: Long) {
    val current = preferences.getString(KEY_CURRENT, "") ?: ""
    preferences.edit()
      .putString(KEY_PREVIOUS, current)
      .putString(KEY_CURRENT, "")
      .apply()
    append(api, callId, "call-received", startedAt)
  }

  @Synchronized
  fun append(
    api: String,
    callId: String,
    stage: String,
    startedAt: Long,
    detail: String = ""
  ) {
    val now = System.currentTimeMillis()
    val entry = JSONObject()
      .put("version", "1")
      .put("platform", "android")
      .put("sdkVersion", SDK_VERSION)
      .put("packageVersion", PACKAGE_VERSION)
      .put("api", api)
      .put("callId", callId)
      .put("stage", stage)
      .put("timestamp", now)
      .put("elapsedMs", now - startedAt)

    if (detail.isNotBlank()) {
      entry.put("detail", detail.take(MAX_DETAIL_LENGTH))
    }

    val existing = preferences.getString(KEY_CURRENT, "") ?: ""
    val updated = if (existing.isEmpty()) entry.toString() else "$existing\n$entry"
    preferences.edit().putString(KEY_CURRENT, updated.takeLast(MAX_TRACE_LENGTH)).apply()
  }

  @Synchronized
  fun read(): WritableMap = Arguments.createMap().apply {
    putArray("current", parse(preferences.getString(KEY_CURRENT, "") ?: ""))
    putArray("previous", parse(preferences.getString(KEY_PREVIOUS, "") ?: ""))
  }

  @Synchronized
  fun clear() {
    preferences.edit().remove(KEY_CURRENT).remove(KEY_PREVIOUS).apply()
  }

  private fun parse(trace: String): WritableArray {
    val result = Arguments.createArray()
    trace.lineSequence()
      .filter { it.isNotBlank() }
      .forEach { line ->
        runCatching { jsonToMap(JSONObject(line)) }
          .onSuccess(result::pushMap)
      }
    return result
  }

  private fun jsonToMap(json: JSONObject): WritableMap = Arguments.createMap().apply {
    putString("version", json.optString("version"))
    putString("platform", json.optString("platform"))
    putString("sdkVersion", json.optString("sdkVersion"))
    putString("packageVersion", json.optString("packageVersion"))
    putString("api", json.optString("api"))
    putString("callId", json.optString("callId"))
    putString("stage", json.optString("stage"))
    putDouble("timestamp", json.optLong("timestamp").toDouble())
    putDouble("elapsedMs", json.optLong("elapsedMs").toDouble())
    json.optString("detail").takeIf { it.isNotBlank() }?.let { putString("detail", it) }
  }

  companion object {
    const val SDK_VERSION = "1.26.3"
    const val PACKAGE_VERSION = "0.1.0"
    private const val PREFERENCES = "liveness.diagnostics"
    private const val KEY_CURRENT = "current"
    private const val KEY_PREVIOUS = "previous"
    private const val MAX_TRACE_LENGTH = 12_000
    private const val MAX_DETAIL_LENGTH = 512
  }
}
