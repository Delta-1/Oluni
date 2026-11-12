package br.com.oluni.app;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceAuthPlugin.class);
        registerPlugin(AppUpdatesPlugin.class);
        registerPlugin(OluniPrintPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setBackgroundColor(Color.rgb(16, 16, 21));
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
