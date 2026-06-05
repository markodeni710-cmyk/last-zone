package app.lovable.lastzone.gamebroadcast

import android.content.Context
import android.content.Intent
import io.agora.rtc2.ChannelMediaOptions
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import io.agora.rtc2.RtcEngineEx
import io.agora.rtc2.ScreenCaptureParameters
import io.agora.rtc2.video.VideoEncoderConfiguration

class AgoraScreenPusher(private val androidContext: Context) {

    fun start(
        appId: String,
        channel: String,
        token: String,
        uid: Int
    ) {
        try {
            if (rtcEngine != null) {
                android.util.Log.w("AgoraScreenPusher", "engine already exists, skipping")
                return
            }

            val cfg = RtcEngineConfig().apply {
                mContext = androidContext.applicationContext
                mAppId = appId
                mEventHandler = object : IRtcEngineEventHandler() {
                    override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
                        android.util.Log.i("AgoraScreenPusher", "✅ join ok channel=$channel uid=$uid elapsed=$elapsed")
                    }
                    override fun onError(err: Int) {
                        android.util.Log.e("AgoraScreenPusher", "❌ agora error code=$err msg=${RtcEngine.getErrorDescription(err)}")
                    }
                    override fun onLocalVideoStateChanged(
                        source: Constants.VideoSourceType?,
                        state: Int,
                        error: Int
                    ) {
                        android.util.Log.i(
                            "AgoraScreenPusher",
                            "localVideoState src=$source state=$state err=$error"
                        )
                    }
                    override fun onUserJoined(uid: Int, elapsed: Int) {
                        android.util.Log.i("AgoraScreenPusher", "👤 viewer joined uid=$uid")
                    }
                    override fun onFirstLocalVideoFramePublished(source: Constants.VideoSourceType?, elapsed: Int) {
                        android.util.Log.i("AgoraScreenPusher", "🎥 first video frame PUBLISHED src=$source elapsed=$elapsed")
                    }
                }
            }
            val engine = RtcEngine.create(cfg) as RtcEngineEx
            rtcEngine = engine

            engine.setChannelProfile(Constants.CHANNEL_PROFILE_LIVE_BROADCASTING)
            engine.setClientRole(Constants.CLIENT_ROLE_BROADCASTER)
            engine.enableVideo()

            val metrics = androidContext.resources.displayMetrics
            val targetWidth = 720
            val targetHeight = if (metrics.widthPixels > 0) {
                (targetWidth.toFloat() * metrics.heightPixels / metrics.widthPixels).toInt()
            } else 1280

            engine.setVideoEncoderConfiguration(
                VideoEncoderConfiguration(
                    VideoEncoderConfiguration.VideoDimensions(targetWidth, targetHeight),
                    VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_15,
                    VideoEncoderConfiguration.STANDARD_BITRATE,
                    VideoEncoderConfiguration.ORIENTATION_MODE.ORIENTATION_MODE_ADAPTIVE
                )
            )

            val params = ScreenCaptureParameters().apply {
                captureVideo = true
                captureAudio = false
                videoCaptureParameters.width = targetWidth
                videoCaptureParameters.height = targetHeight
                videoCaptureParameters.framerate = 15
            }

            // 1) ابدأ التقاط الشاشة أولاً (يوصى به من Agora قبل الانضمام للقناة)
            val ret = engine.startScreenCapture(params)
            android.util.Log.i("AgoraScreenPusher", "startScreenCapture ret=$ret")

            // 2) إعداد خيارات النشر
            val options = ChannelMediaOptions().apply {
                publishCameraTrack = false
                publishMicrophoneTrack = false
                publishScreenCaptureVideo = true
                publishScreenCaptureAudio = false
                autoSubscribeAudio = false
                autoSubscribeVideo = false
                clientRoleType = Constants.CLIENT_ROLE_BROADCASTER
                channelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING
            }

            // 3) انضم للقناة كـ broadcaster مع تفعيل نشر شاشة
            val joinRet = engine.joinChannel(token, channel, uid, options)
            android.util.Log.i("AgoraScreenPusher", "joinChannel ret=$joinRet uid=$uid channel=$channel hasToken=${token.isNotEmpty()}")

            // 3) أعد تفعيل خيارات النشر للتأكد من بدء البث
            engine.updateChannelMediaOptions(options)
        } catch (t: Throwable) {
            android.util.Log.e("AgoraScreenPusher", "start failed", t)
            try { stop() } catch (_: Throwable) {}
        }
    }

    fun stop() {
        try {
            rtcEngine?.stopScreenCapture()
            rtcEngine?.leaveChannel()
            RtcEngine.destroy()
        } catch (_: Exception) {}
        rtcEngine = null
    }

    companion object {
        private var rtcEngine: RtcEngine? = null

        fun muteLocalVideo(mute: Boolean) {
            rtcEngine?.muteLocalVideoStream(mute)
        }
    }
}
