package app.lovable.lastzone;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.lovable.lastzone.gamebroadcast.GameBroadcastPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GameBroadcastPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
