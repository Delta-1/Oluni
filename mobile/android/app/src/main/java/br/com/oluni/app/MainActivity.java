package br.com.oluni.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceAuthPlugin.class);
        registerPlugin(AppUpdatesPlugin.class);
        registerPlugin(OluniPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
