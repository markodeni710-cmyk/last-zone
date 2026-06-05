package app.lovable.lastzone.gamebroadcast

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ScreenCaptureService : Service() {

    private var pusher: AgoraScreenPusher? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {

        // بدء الخدمة كـ Foreground قبل أي شيء آخر ليتوافق مع متطلبات Android 14
        startForegroundWithNotification()

        val appId = intent?.getStringExtra("appId").orEmpty()
        val channel = intent?.getStringExtra("channel").orEmpty()
        val token = intent?.getStringExtra("token").orEmpty()
        val uid = intent?.getIntExtra("uid", 0) ?: 0

        android.util.Log.i(
            "ScreenCaptureService",
            "start params: appId=${appId.take(6)}... channel=$channel uid=$uid hasToken=${token.isNotEmpty()}"
        )

        if (appId.isEmpty() || channel.isEmpty()) {
            android.util.Log.e("ScreenCaptureService", "missing required params (appId/channel), stopping")
            stopSelf()
            return START_NOT_STICKY
        }

        // تشغيل Agora على الـ Main Thread لأن بدء التقاط الشاشة قد يطلب إذن المستخدم (UI)
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                pusher = AgoraScreenPusher(this).apply {
                    start(appId, channel, token, uid)
                }
            } catch (t: Throwable) {
                android.util.Log.e("ScreenCaptureService", "pusher start failed", t)
            }
        }

        return START_STICKY
    }

    private fun startForegroundWithNotification() {
        val channelId = "game_broadcast_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val ch = NotificationChannel(channelId, "بث اللعبة", NotificationManager.IMPORTANCE_LOW)
            ch.lightColor = Color.RED
            nm.createNotificationChannel(ch)
        }
        val notif: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Last Zone — بث مباشر نشط")
            .setContentText("اضغط على الفقاعة العائمة للتحكم")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1001, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(1001, notif)
        }
    }

    override fun onDestroy() {
        try {
            pusher?.stop()
        } catch (_: Exception) {}
        pusher = null
        super.onDestroy()
    }
}
