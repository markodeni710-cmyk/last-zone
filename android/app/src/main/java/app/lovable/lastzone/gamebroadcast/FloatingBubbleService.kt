package app.lovable.lastzone.gamebroadcast

import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.*
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import app.lovable.lastzone.R

class FloatingBubbleService : Service() {

    private var windowManager: WindowManager? = null
    private var bubbleView: View? = null
    private var viewerText: TextView? = null
    private var paused = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val inflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater
        bubbleView = inflater.inflate(R.layout.floating_bubble, null)
        viewerText = bubbleView?.findViewById(R.id.viewer_count)

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            // FLAG_NOT_TOUCH_MODAL يسمح بتمرير اللمس خارج النافذة
            // FLAG_WATCH_OUTSIDE_TOUCH لمراقبة اللمس خارج النافذة
            // لا نستخدم FLAG_NOT_FOCUSABLE لأنه يمنع الأزرار من العمل
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.START
        params.x = 50
        params.y = 200

        // ===== منطقة السحب فقط =====
        val dragArea = bubbleView?.findViewById<LinearLayout>(R.id.drag_area)
        dragArea?.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var touchX = 0f
            private var touchY = 0f

            override fun onTouch(v: View?, e: MotionEvent): Boolean {
                when (e.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        touchX = e.rawX
                        touchY = e.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        params.x = initialX + (e.rawX - touchX).toInt()
                        params.y = initialY + (e.rawY - touchY).toInt()
                        windowManager?.updateViewLayout(bubbleView, params)
                        return true
                    }
                }
                return false
            }
        })

        // ===== زر الإيقاف =====
        val btnStop = bubbleView?.findViewById<ImageButton>(R.id.btn_stop)
        btnStop?.isClickable = true
        btnStop?.isFocusable = true
        btnStop?.setOnClickListener {
            android.util.Log.i("FloatingBubble", "🛑 STOP clicked")
            stopService(Intent(this, ScreenCaptureService::class.java))
            GameBroadcastPlugin.instance?.notifyStoppedFromBubble()
            stopSelf()
        }

        // ===== زر الإيقاف المؤقت =====
        val btnPause = bubbleView?.findViewById<ImageButton>(R.id.btn_pause)
        btnPause?.isClickable = true
        btnPause?.isFocusable = true
        btnPause?.setOnClickListener {
            android.util.Log.i("FloatingBubble", "⏸ PAUSE clicked, paused=$paused")
            paused = !paused
            AgoraScreenPusher.muteLocalVideo(paused)
            // تغيير الأيقونة حسب الحالة
            if (paused) {
                btnPause.setImageResource(android.R.drawable.ic_media_play)
            } else {
                btnPause.setImageResource(android.R.drawable.ic_media_pause)
            }
        }

        try {
            windowManager?.addView(bubbleView, params)
            android.util.Log.i("FloatingBubble", "✅ Bubble added to WindowManager")
        } catch (e: Exception) {
            android.util.Log.e("FloatingBubble", "Failed to add bubble", e)
            stopSelf()
        }
    }

    override fun onDestroy() {
        try {
            bubbleView?.let { windowManager?.removeView(it) }
        } catch (_: Exception) {}
        instance = null
        super.onDestroy()
    }

    companion object {
        @JvmStatic var instance: FloatingBubbleService? = null

        fun updateViewerCount(count: Int) {
            val inst = instance ?: return
            Handler(Looper.getMainLooper()).post {
                inst.viewerText?.text = count.toString()
            }
        }
    }
}
