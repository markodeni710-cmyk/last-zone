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
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP or Gravity.START
        params.x = 50
        params.y = 200

        // السحب
        bubbleView?.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var touchX = 0f
            private var touchY = 0f

            private fun isPointInsideView(x: Float, y: Float, view: View?): Boolean {
                if (view == null) return false
                val location = IntArray(2)
                view.getLocationOnScreen(location)
                val viewX = location[0]
                val viewY = location[1]
                return (x >= viewX && x <= viewX + view.width && y >= viewY && y <= viewY + view.height)
            }

            override fun onTouch(v: View?, e: MotionEvent): Boolean {
                val btnPause = bubbleView?.findViewById<View>(R.id.btn_pause)
                val btnStop = bubbleView?.findViewById<View>(R.id.btn_stop)

                when (e.action) {
                    MotionEvent.ACTION_DOWN -> {
                        // إذا كان اللمس على الأزرار، لا تستهلك الحدث لتسمح بضغطها
                        if (isPointInsideView(e.rawX, e.rawY, btnPause) || isPointInsideView(e.rawX, e.rawY, btnStop)) {
                            return false
                        }
                        initialX = params.x; initialY = params.y
                        touchX = e.rawX; touchY = e.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (e.rawX - touchX).toInt()
                        val dy = (e.rawY - touchY).toInt()
                        params.x = initialX + dx
                        params.y = initialY + dy
                        windowManager?.updateViewLayout(bubbleView, params)
                        return true
                    }
                }
                return false
            }
        })

        // زر الإيقاف — يوقف البث ويخبر JS عشان يحدّث قاعدة البيانات
        bubbleView?.findViewById<ImageButton>(R.id.btn_stop)?.setOnClickListener {
            stopService(Intent(this, ScreenCaptureService::class.java))
            GameBroadcastPlugin.instance?.notifyStoppedFromBubble()
            stopSelf()
        }
        // زر التوقف المؤقت
        bubbleView?.findViewById<ImageButton>(R.id.btn_pause)?.setOnClickListener {
            paused = !paused
            AgoraScreenPusher.muteLocalVideo(paused)
        }

        try {
            windowManager?.addView(bubbleView, params)
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
