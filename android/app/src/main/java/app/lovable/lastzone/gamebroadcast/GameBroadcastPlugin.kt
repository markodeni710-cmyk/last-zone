package app.lovable.lastzone.gamebroadcast

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "GameBroadcast",
    permissions = [
        Permission(strings = [android.Manifest.permission.RECORD_AUDIO], alias = "mic"),
        Permission(strings = [android.Manifest.permission.POST_NOTIFICATIONS], alias = "notif")
    ]
)
class GameBroadcastPlugin : Plugin() {

    private var pendingCall: PluginCall? = null
    private var pendingOptions: JSObject? = null

    @PluginMethod
    fun startBroadcast(call: PluginCall) {
        val opts = JSObject().apply {
            put("appId", call.getString("appId", "") ?: "")
            put("channel", call.getString("channel", "") ?: "")
            put("token", call.getString("token", "") ?: "")
            put("uid", call.getInt("uid", 0) ?: 0)
            put("tournamentName", call.getString("tournamentName", "بطولة") ?: "بطولة")
        }

        // تحقق من صلاحية النافذة العائمة أولاً
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            call.reject("OVERLAY_PERMISSION_REQUIRED")
            return
        }

        pendingCall = call
        pendingOptions = opts

        // ابدأ Foreground Service مباشرة بدون طلب الصلاحية هنا (Agora ستتكفل بذلك)
        val svc = Intent(context, ScreenCaptureService::class.java).apply {
            putExtra("appId", opts.getString("appId"))
            putExtra("channel", opts.getString("channel"))
            putExtra("token", opts.getString("token"))
            putExtra("uid", opts.optInt("uid", 0))
            putExtra("tournamentName", opts.getString("tournamentName"))
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc)
            } else {
                context.startService(svc)
            }
        } catch (e: Exception) {
            android.util.Log.e("GameBroadcastPlugin", "Failed to start ScreenCaptureService", e)
            call.reject("SERVICE_START_FAILED", e.message)
            return
        }

        // ابدأ النافذة العائمة
        try {
            val bubble = Intent(context, FloatingBubbleService::class.java).apply {
                putExtra("tournamentName", opts.getString("tournamentName"))
            }
            context.startService(bubble)
        } catch (e: Exception) {
            android.util.Log.e("GameBroadcastPlugin", "Failed to start FloatingBubbleService", e)
        }

        notifyBroadcastEvent("started", null)
        val ret = JSObject().apply { put("success", true) }
        call.resolve(ret)
    }

    @PluginMethod
    fun stopBroadcast(call: PluginCall) {
        context.stopService(Intent(context, ScreenCaptureService::class.java))
        context.stopService(Intent(context, FloatingBubbleService::class.java))
        notifyBroadcastEvent("stopped", null)
        val ret = JSObject().apply { put("success", true) }
        call.resolve(ret)
    }

    @PluginMethod
    fun updateViewerCount(call: PluginCall) {
        val count = call.getInt("count", 0) ?: 0
        FloatingBubbleService.updateViewerCount(count)
        call.resolve()
    }

    @PluginMethod
    fun hasOverlayPermission(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else true
        val ret = JSObject().apply { put("granted", granted) }
        call.resolve(ret)
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(intent)
            } catch (e: Exception) {
                android.util.Log.e("GameBroadcastPlugin", "Failed to open settings", e)
            }
        }
        val ret = JSObject().apply {
            put("granted", Settings.canDrawOverlays(context))
        }
        call.resolve(ret)
    }

    private fun notifyBroadcastEvent(type: String, message: String?) {
        val data = JSObject().apply {
            put("type", type)
            if (message != null) put("message", message)
        }
        notifyListeners("broadcastEvent", data)
    }

    /** يُستدعى من الفقاعة العائمة لما المستخدم يضغط زر الإيقاف */
    fun notifyStoppedFromBubble() {
        notifyBroadcastEvent("stopped", "stopped_from_bubble")
    }

    companion object {
        @JvmStatic
        var instance: GameBroadcastPlugin? = null
    }

    override fun load() {
        super.load()
        instance = this
    }
}
