package br.com.oluni.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OluniPrint")
public class OluniPrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { call.reject("Impressão indisponível neste aparelho."); return; }
                manager.print("Oluni - QR Codes", getBridge().getWebView().createPrintDocumentAdapter("Oluni - QR Codes"),
                    new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                call.resolve();
            } catch (Exception error) { call.reject("Não foi possível abrir a impressão.", error); }
        });
    }
}
