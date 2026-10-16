package com.esand.reactnativeliveness

import android.content.Context
import com.esandinfo.livingdetection.EsLivingDetectionManager
import com.esandinfo.livingdetection.bean.EsLDTInitConfig
import com.esandinfo.livingdetection.bean.EsLivingDetectResult
import com.esandinfo.livingdetection.bean.EsTitleLanguage
import com.esandinfo.livingdetection.biz.EsLivingDetectCallback
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

class EsandLivenessModule(reactContext: ReactApplicationContext) :
  NativeEsandLivenessSpec(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()
  private val operationInProgress = AtomicBoolean(false)
  private val diagnostics = EsandLivenessDiagnostics(reactContext)

  @Volatile private var initialized = false

  override fun prepare(promise: Promise) {
    runExclusive("prepare", promise) { callId, startedAt ->
      try {
        EsLivingDetectionManager.Init()
        diagnostics.append("prepare", callId, "native-prepare-complete", startedAt)
        promise.resolve(null)
      } catch (error: Throwable) {
        diagnostics.append("prepare", callId, "native-exception", startedAt, error.javaClass.simpleName)
        promise.reject("native_bridge_error", error.message ?: "Native preparation failed.", error)
      } finally {
        finishOperation()
      }
    }
  }

  override fun initialize(config: ReadableMap, promise: Promise) {
    runExclusive("initialize", promise) { callId, startedAt ->
      try {
        diagnostics.append("initialize", callId, "config-validation-start", startedAt)
        val actions = requireActions(config.getArray("actions"))
        val nativeConfig = EsLDTInitConfig(encodeActions(actions))
        nativeConfig.setTitleLanguage(parseLanguage(config.getString("language")))
        nativeConfig.setTakePhotoEveryType(config.getBoolean("saveActionImages"))
        nativeConfig.setNavigate(config.getBoolean("showNavigation"))

        EsLivingDetectionManager.s_isOpenVideoRecorder = config.getBoolean("recordVideo")
        EsLivingDetectionManager.s_isUseStrictMode = config.getBoolean("strictMode")
        EsLivingDetectionManager.s_isAutoUploadVerifyMsg = false
        applyAppearance(config.getMap("appearance"))

        diagnostics.append("initialize", callId, "native-initialize-start", startedAt)
        val result = EsLivingDetectionManager(managerContext()).verifyInit(nativeConfig)
        diagnostics.append(
          "initialize",
          callId,
          "native-initialize-complete",
          startedAt,
          "code=${result.code}"
        )
        initialized = result.code?.name == "ELD_SUCCESS"
        promise.resolve(mapInitializeResult(result, callId))
      } catch (error: Throwable) {
        initialized = false
        diagnostics.append("initialize", callId, "native-exception", startedAt, error.javaClass.simpleName)
        promise.reject("native_bridge_error", error.message ?: "Native initialization failed.", error)
      } finally {
        finishOperation()
      }
    }
  }

  override fun startDetection(options: ReadableMap, promise: Promise) {
    if (!initialized) {
      promise.reject("not_initialized", "initialize() must complete successfully first.")
      return
    }
    if (!operationInProgress.compareAndSet(false, true)) {
      promise.reject("operation_in_progress", "Another liveness operation is running.")
      return
    }

    val callId = UUID.randomUUID().toString()
    val startedAt = System.currentTimeMillis()
    val completed = AtomicBoolean(false)
    diagnostics.begin("startDetection", callId, startedAt)

    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      diagnostics.append("startDetection", callId, "no-active-screen", startedAt)
      finishOperation()
      promise.reject("no_active_screen", "A foreground Android Activity is required.")
      return
    }

    val token = options.getString("token")?.trim().orEmpty()
    if (token.isEmpty()) {
      finishOperation()
      promise.reject("invalid_configuration", "token must be a non-empty string.")
      return
    }
    val camera = options.getString("camera") ?: "front"
    val cameraId = when (camera) {
      "front" -> "1"
      "rear" -> "0"
      else -> {
        finishOperation()
        promise.reject("unsupported_option", "Unsupported camera: $camera")
        return
      }
    }

    UiThreadUtil.runOnUiThread {
      try {
        diagnostics.append("startDetection", callId, "native-detection-start", startedAt)
        EsLivingDetectionManager(activity).startLivingDetect(
          cameraId,
          token,
          object : EsLivingDetectCallback {
            override fun onFinish(result: EsLivingDetectResult) {
              if (!completed.compareAndSet(false, true)) return
              diagnostics.append(
                "startDetection",
                callId,
                "native-detection-callback",
                startedAt,
                "code=${result.code}"
              )
              promise.resolve(mapDetectionResult(result, callId))
              finishOperation()
            }
          }
        )
      } catch (error: Throwable) {
        if (!completed.compareAndSet(false, true)) return@runOnUiThread
        diagnostics.append("startDetection", callId, "native-exception", startedAt, error.javaClass.simpleName)
        promise.reject("native_bridge_error", error.message ?: "Native detection failed.", error)
        finishOperation()
      }
    }
  }

  override fun getCapabilities(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putString("platform", "android")
      putArray("actions", stringArray(ACTION_CODES.keys))
      putArray("cameras", stringArray(listOf("front", "rear")))
      putArray("languages", stringArray(listOf("zh-CN", "zh-TW", "en", "ja", "ko", "th")))
      putBoolean("supportsVideoRecording", true)
      putBoolean("supportsActionImages", true)
      putBoolean("supportsDiagnostics", true)
    })
  }

  override fun getSdkVersion(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putString("platform", "android")
      putString("version", EsandLivenessDiagnostics.SDK_VERSION)
    })
  }

  override fun getDiagnosticInfo(promise: Promise) {
    promise.resolve(diagnostics.read())
  }

  override fun clearDiagnosticInfo(promise: Promise) {
    diagnostics.clear()
    promise.resolve(null)
  }

  private fun runExclusive(
    api: String,
    promise: Promise,
    work: (callId: String, startedAt: Long) -> Unit
  ) {
    if (!operationInProgress.compareAndSet(false, true)) {
      promise.reject("operation_in_progress", "Another liveness operation is running.")
      return
    }
    val callId = UUID.randomUUID().toString()
    val startedAt = System.currentTimeMillis()
    diagnostics.begin(api, callId, startedAt)
    executor.execute { work(callId, startedAt) }
  }

  private fun finishOperation() {
    operationInProgress.set(false)
  }

  private fun managerContext(): Context =
    reactApplicationContext.currentActivity ?: reactApplicationContext

  private fun requireActions(actions: ReadableArray?): List<String> {
    require(actions != null && actions.size() in 1..4) {
      "actions must contain between one and four items."
    }
    return (0 until actions.size()).map { index ->
      requireNotNull(actions.getString(index)) { "actions must contain strings." }
    }.also { values ->
      require(values.toSet().size == values.size) { "actions must not contain duplicates." }
      require(values.all(ACTION_CODES::containsKey)) { "actions contains an unsupported value." }
    }
  }

  private fun encodeActions(actions: List<String>): Int =
    actions.joinToString("") { ACTION_CODES.getValue(it).toString() }.toInt()

  private fun parseLanguage(language: String?): EsTitleLanguage = when (language) {
    "zh-CN" -> EsTitleLanguage.CN
    "zh-TW" -> EsTitleLanguage.TCN
    "ja" -> EsTitleLanguage.JP
    "ko" -> EsTitleLanguage.KR
    "th" -> EsTitleLanguage.THA
    else -> EsTitleLanguage.EN
  }

  private fun applyAppearance(appearance: ReadableMap?) {
    if (appearance == null) return
    val style = EsLivingDetectionManager.LivingViewStyleInstance()
    appearance.string("backgroundColor")?.let(style::setBackGroundColor)
    appearance.string("textColor")?.let(style::setTextColor)
    appearance.string("progressBackgroundColor")?.let(style::setProgressBgColor)
    appearance.string("progressStartColor")?.let(style::setProgressStaGradient)
    appearance.string("progressEndColor")?.let(style::setProgressEndGradient)
    if (appearance.hasKey("progressWidth") && !appearance.isNull("progressWidth")) {
      style.setCircleBackWidth(appearance.getDouble("progressWidth").roundToInt())
    }
  }

  private fun mapInitializeResult(result: EsLivingDetectResult, callId: String): WritableMap =
    baseResult(result, callId).apply {
      putString("initializationPayload", result.data.orEmpty())
    }

  private fun mapDetectionResult(result: EsLivingDetectResult, callId: String): WritableMap =
    baseResult(result, callId).apply {
      putString("verificationPayload", result.data.orEmpty())
      putString("token", result.token.orEmpty())
      val path = result.video?.absolutePath ?: result.videoABSPath
      if (!path.isNullOrBlank()) putString("videoPath", path)
    }

  private fun baseResult(result: EsLivingDetectResult, callId: String): WritableMap =
    Arguments.createMap().apply {
      val nativeCode = result.code?.name.orEmpty()
      putString("code", normalizeResultCode(nativeCode))
      putString("nativeCode", nativeCode)
      putString("message", result.msg.orEmpty())
      putString("diagnosticId", callId)
    }

  private fun normalizeResultCode(code: String): String = when (code) {
    "ELD_SUCCESS", "0" -> "success"
    "ELD_FAILED", "1" -> "failed"
    "ELD_PARAME_ERROR", "2" -> "invalid_argument"
    "ELD_EXCEPTION", "3" -> "exception"
    "ELD_TIMEOUT", "4" -> "timeout"
    "ELD_PERMISSION", "5" -> "permission_denied"
    "ELD_UNSUPPORT", "6" -> "unsupported"
    "ELD_CANCEL", "ELD_EXIT", "7" -> "cancelled"
    "ELD_ENV_ERROR", "8" -> "environment_error"
    else -> "exception"
  }

  private fun stringArray(values: Collection<String>) = Arguments.createArray().apply {
    values.forEach(::pushString)
  }

  private fun ReadableMap.string(key: String): String? =
    if (hasKey(key) && !isNull(key)) getString(key) else null

  companion object {
    const val NAME = NativeEsandLivenessSpec.NAME

    private val ACTION_CODES = linkedMapOf(
      "distance" to 1,
      "blink" to 2,
      "turn_head" to 3,
      "nod" to 4,
      "open_mouth" to 5,
      "color_flash" to 6
    )
  }
}
